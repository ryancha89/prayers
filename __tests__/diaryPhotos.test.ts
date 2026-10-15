/**
 * Spec 006 T037 — photos on a diary entry, with both native modules mocked (they are guarded
 * requires: a build without the pods must still run and say so).
 *
 * Pinned: no picker → "unavailable"; a refused permission → "denied"; picked files are copied into
 * Documents/diary/<memoryId>/ and queued; saving offline keeps them queued; a later flush uploads
 * them once; removing a photo deletes the phone copy now and the server copy on the next flush.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => {
  const headers = { 'Content-Type': 'application/json', 'Game-Token': 'tok' };
  return {
    apiHeaders: async () => headers,
    authedFetch: (url: string, init: RequestInit = {}) => (global as any).fetch(url, { ...init, headers }),
  };
});

const mockPicker = { launchImageLibrary: jest.fn() };
jest.mock('react-native-image-picker', () => mockPicker);
const mockFiles = new Set<string>();
const mockFs = {
  DocumentDirectoryPath: '/docs',
  files: mockFiles,
  mkdir: jest.fn(async () => {}),
  copyFile: jest.fn(async (_from: string, to: string) => { mockFiles.add(to); }),
  unlink: jest.fn(async (p: string) => { mockFiles.delete(p); }),
  exists: jest.fn(async (p: string) => mockFiles.has(p)),
};
jest.mock('@dr.pogodin/react-native-fs', () => mockFs);

import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';
import { pickPhotos, photosAvailable, detachPhoto } from '../src/features/myroom/diary/photos';
import { saveDiaryEntry, deleteDiaryEntry } from '../src/features/myroom/diary/diaryActions';
import { flushPhotos } from '../src/features/myroom/diary/diaryApi';

let online = false;
const calls: { url: string; method: string }[] = [];
(global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
  calls.push({ url, method: init.method ?? 'GET' });
  if (!online) throw new Error('offline');
  if (url.endsWith('/photos') && init.method === 'POST') {
    const body = init.body as any;
    const id = typeof body?.get === 'function'
      ? body.get('client_photo_id')
      : body?._parts?.find((p: [string, string]) => p[0] === 'client_photo_id')?.[1];
    return { ok: true, status: 200, json: async () => ({ success: true, photo: { id, url: `/f/${id}`, width: 1, height: 1, position: 0 } }) };
  }
  return { ok: true, status: 200, json: async () => ({ success: true }) };
});

const draft = (over = {}) => ({
  kind: 'diary' as const, date: '2026-10-07', mood: 'great', counselor: 'dosa', content: 'Hello',
  aiEnabled: true, added: [], removed: [], ...over,
});

beforeEach(() => {
  online = false;
  calls.length = 0;
  mockFs.files.clear();
  mockPicker.launchImageLibrary.mockReset();
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
});

it('says plainly when the picker is not in the build', async () => {
  // A build without the pod: the module resolves to nothing usable.
  const launch = mockPicker.launchImageLibrary;
  (mockPicker as any).launchImageLibrary = undefined;
  expect(photosAvailable()).toBe(false);
  expect(await pickPhotos(4)).toEqual({ status: 'unavailable' });
  mockPicker.launchImageLibrary = launch;
  expect(photosAvailable()).toBe(true);
});

it('reads a refused permission and a cancel', async () => {
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ errorCode: 'permission' });
  expect(await pickPhotos(4)).toEqual({ status: 'denied' });
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ didCancel: true });
  expect(await pickPhotos(4)).toEqual({ status: 'cancel' });
});

it('asks for at most the room left, never the location, and sized for the server', async () => {
  // The library's file has to exist: the pick is copied into the pending folder at once.
  mockFiles.add('/tmp/a.jpg');
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ assets: [{ uri: 'file:///tmp/a.jpg', width: 3, height: 4 }] });
  const r = await pickPhotos(2);
  expect(mockPicker.launchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({
    mediaType: 'photo', selectionLimit: 2, maxWidth: 1600, includeExtra: false,
  }));
  expect(r).toMatchObject({ status: 'ok', failed: 0, photos: [{ uri: expect.stringMatching(/^file:\/\/\/docs\/diary\/_pending\/ph_.*\.jpg$/), width: 3, height: 4 }] });
});

it('offline: the entry and its photos are saved on the phone and queued; online, one upload each', async () => {
  const picked = [{ id: 'ph1', uri: 'file:///tmp/a.jpg', width: 1, height: 1 }, { id: 'ph2', uri: 'file:///tmp/b.jpg', width: 1, height: 1 }];
  const { memory, pushed } = await saveDiaryEntry(draft({ added: picked }));
  expect(pushed).toBe(false);
  expect(useArchiveStore.getState().dirty).toContain(memory.id);
  const list = useDiaryStore.getState().photos[memory.id];
  expect(list.map(p => p.localUri)).toEqual([`file:///docs/diary/${memory.id}/ph1.jpg`, `file:///docs/diary/${memory.id}/ph2.jpg`]);
  expect(list.every(p => !p.uploaded)).toBe(true);

  online = true;
  const { pushArchive } = require('../src/features/archive/api/memoriesApi');
  await pushArchive();
  await flushPhotos();
  await flushPhotos();
  expect(calls.filter(c => c.url.endsWith('/photos') && c.method === 'POST')).toHaveLength(2);
  expect(useDiaryStore.getState().photos[memory.id].every(p => p.uploaded)).toBe(true);
});

it('removing a photo deletes the phone copy now and the server copy on the next flush; delete takes all', async () => {
  online = true;
  const { memory } = await saveDiaryEntry(draft({ added: [{ id: 'ph1', uri: 'file:///tmp/a.jpg', width: 1, height: 1 }] }));
  await flushPhotos();
  expect(mockFs.files.has(`/docs/diary/${memory.id}/ph1.jpg`)).toBe(true);

  await detachPhoto(memory.id, 'ph1');
  expect(mockFs.files.size).toBe(0);
  expect(useDiaryStore.getState().photoDeletes).toEqual([{ memoryId: memory.id, photoId: 'ph1' }]);
  await flushPhotos();
  expect(calls.some(c => c.method === 'DELETE' && c.url.endsWith(`/memories/${memory.id}/photos/ph1`))).toBe(true);
  expect(useDiaryStore.getState().photoDeletes).toEqual([]);

  const second = await saveDiaryEntry(draft({ added: [{ id: 'ph2', uri: 'file:///tmp/b.jpg', width: 1, height: 1 }] }));
  await deleteDiaryEntry(second.memory.id);
  expect(mockFs.files.size).toBe(0);
  expect(useDiaryStore.getState().photos[second.memory.id]).toBeUndefined();
  expect(useArchiveStore.getState().deleted).toEqual([]); // pushed as a delete
});
