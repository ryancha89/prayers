/**
 * Spec 006 — the diary flow fixes of 08-10 (review of the shipped flow).
 *
 * Pinned: a row the server refuses inside a 200 stays dirty; the photo queue deletes before it
 * uploads, and an over-the-limit answer is not final while a delete is still owed; a sync asks for
 * the reflections a Save could not (offline, or the 아카이브 tab); new photos never take a position
 * the server would clamp onto another; sign-out empties the 아카이브 and the diary.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {}, getAllKeys: async () => [] },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => {
  const headers = { 'Content-Type': 'application/json', 'Game-Token': 'tok', 'User-Auth': 'dev-x' };
  return {
    apiHeaders: async () => headers,
    authedFetch: (url: string, init: RequestInit = {}) =>
      (global as any).fetch(url, { ...init, headers: { ...headers, ...(init.headers as object) } }),
  };
});

import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { pushArchive } from '../src/features/archive/api/memoriesApi';
import { catchUpReflections, flushPhotos } from '../src/features/myroom/diary/diaryApi';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';
import { nextPosition } from '../src/features/myroom/diary/photos';
import { forgetLocalData } from '../src/features/auth/api/deleteAccount';

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown };
let handler: Handler;
const calls: { url: string; method: string }[] = [];
(global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
  calls.push({ url, method: init.method ?? 'GET' });
  const { status, body } = handler(url, init);
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
});

const row = (id: string, category: string, updatedAt = new Date().toISOString()) => ({
  id, category, content: 'x', details: {}, importance: 2 as const, confidence: 1, source: 'manual' as const,
  aiEnabled: true, createdAt: updatedAt, updatedAt,
});
const photo = (id: string, position: number, uploaded: boolean) => ({ id, localUri: `file:///docs/diary/m1/${id}.jpg`, width: 1, height: 1, position, uploaded });

beforeEach(() => {
  calls.length = 0;
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
});

it('a row the server rejects inside a 200 stays dirty, and the push says it did not go', async () => {
  useArchiveStore.setState({ memories: [row('a', 'wish'), row('b', 'diary')] as never, dirty: ['a', 'b'] });
  handler = () => ({ status: 200, body: { success: true, saved: 1, deleted: 0, rejected: [{ id: 'a', errors: ['Category is not included'] }] } });
  expect(await pushArchive()).toBe(false);
  expect(useArchiveStore.getState().dirty).toEqual(['a']);
});

it('the photo queue deletes before it uploads (a replaced 4th photo is not refused as over the limit)', async () => {
  useArchiveStore.setState({ memories: [row('m1', 'diary')] as never });
  useDiaryStore.setState({ photos: { m1: [photo('p1', 0, true), photo('p2', 1, true), photo('p3', 2, true), photo('p5', 3, false)] }, photoDeletes: [{ memoryId: 'm1', photoId: 'p4' }] });
  handler = (url, init) => (init.method === 'DELETE' ? { status: 200, body: { success: true } }
    : { status: 200, body: { success: true, photo: { id: 'p5', url: '/f', width: 1, height: 1, position: 3 } } });
  await flushPhotos();
  expect(calls.map(c => c.method)).toEqual(['DELETE', 'POST']);
  expect(useDiaryStore.getState().photos.m1.find(p => p.id === 'p5')?.uploaded).toBe(true);
});

it('over the limit is not final while a delete is still owed on the entry', async () => {
  useArchiveStore.setState({ memories: [row('m1', 'diary')] as never });
  useDiaryStore.setState({ photos: { m1: [photo('p5', 3, false)] }, photoDeletes: [{ memoryId: 'm1', photoId: 'p4' }] });
  handler = (url, init) => (init.method === 'DELETE' ? { status: 500, body: {} } : { status: 422, body: { error_code: 'PHOTO_LIMIT' } });
  await flushPhotos();
  expect(useDiaryStore.getState().photos.m1[0].refused).toBeUndefined();
  // With nothing owed, the same answer is final.
  useDiaryStore.setState({ photoDeletes: [] });
  await flushPhotos();
  expect(useDiaryStore.getState().photos.m1[0].refused).toBe(true);
});

it('a sync asks for the reflections a Save could not: recent synced rows with none, and stale ones', async () => {
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  useArchiveStore.setState({
    memories: [row('fresh', 'diary'), row('wish', 'wish'), row('dirty', 'diary'), row('old', 'diary', old), row('stale', 'goal', old), row('done', 'diary'), row('person', 'person')] as never,
    dirty: ['dirty'],
  });
  const r = (stale: boolean) => ({ status: 'ready' as const, text: 't', topics: [], counselor: 'sunyeo', lang: 'en', stale });
  useDiaryStore.setState({ reflections: { stale: r(true), done: r(false) } });
  handler = () => ({ status: 202, body: { success: true, reflection: { status: 'pending', text: null, topics: [], counselor: 'sunyeo', lang: 'en', stale: false } } });
  expect(await catchUpReflections('en')).toBe(3);
  const asked = calls.filter(c => c.method === 'POST').map(c => c.url.split('/').slice(-2)[0]).sort();
  expect(asked).toEqual(['fresh', 'stale', 'wish']);
});

it('a new photo takes the next slot while it fits, else the first free one', () => {
  expect(nextPosition([])).toBe(0);
  expect(nextPosition([{ position: 0 }, { position: 1 }])).toBe(2);
  expect(nextPosition([{ position: 0 }, { position: 2 }, { position: 3 }])).toBe(1);
});

it('sign-out empties the 아카이브 and the diary in memory, not only on disk', async () => {
  useArchiveStore.setState({ memories: [row('a', 'diary')] as never, dirty: ['a'] });
  useDiaryStore.setState({ reflections: { a: { status: 'ready', text: 't', topics: [], counselor: 'x', lang: 'en', stale: false } }, photos: { a: [photo('p', 0, false)] } });
  await forgetLocalData();
  expect(useArchiveStore.getState().memories).toEqual([]);
  expect(useArchiveStore.getState().dirty).toEqual([]);
  expect(useDiaryStore.getState().reflections).toEqual({});
  expect(useDiaryStore.getState().photos).toEqual({});
});
