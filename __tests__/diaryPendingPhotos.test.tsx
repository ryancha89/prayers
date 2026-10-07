/**
 * The 07-10 blank previews: four picked photos showed four × buttons and nothing else, and the app's
 * tmp/ held no picked file at all. react-native-image-picker returns the uri of the file it MEANT to
 * write — it ignores a failed load and a failed write — so a uri from it is no proof of a file.
 *
 * Pinned, with the picker and the fs module mocked:
 *  - a pick is copied at once to Documents/diary/_pending/<photoId>.jpg, checked, and the preview
 *    shows the copy (never the picker's tmp uri), with a devlog line naming both and the size;
 *  - a pick that left no file is dropped, said on the sheet, and explained in the devlog;
 *  - Save moves the copy into Documents/diary/<memoryId>/; discarding the sheet deletes it;
 *  - a photo that fails to load says why in the devlog and falls back to the visible plate.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { Image } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
const mockDevlog = jest.fn();
jest.mock('../src/shared/devlog', () => ({ devlog: (line: string) => mockDevlog(line) }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/auth/api/headers', () => ({ apiHeaders: async () => null, authedFetch: async () => null }));

const mockPicker = { launchImageLibrary: jest.fn() };
jest.mock('react-native-image-picker', () => mockPicker);
/** path → size in bytes. A directory unlink takes everything under it, as RNFS's does. */
const mockFiles = new Map<string, number>();
const mockFs = {
  DocumentDirectoryPath: '/docs',
  mkdir: jest.fn(async () => {}),
  copyFile: jest.fn(async (from: string, to: string) => {
    if (!mockFiles.has(from)) throw new Error(`ENOENT ${from}`);
    mockFiles.set(to, mockFiles.get(from)!);
  }),
  moveFile: jest.fn(async (from: string, to: string) => {
    if (!mockFiles.has(from)) throw new Error(`ENOENT ${from}`);
    mockFiles.set(to, mockFiles.get(from)!);
    mockFiles.delete(from);
  }),
  stat: jest.fn(async (p: string) => {
    if (!mockFiles.has(p)) throw new Error(`ENOENT ${p}`);
    return { size: mockFiles.get(p)! };
  }),
  unlink: jest.fn(async (p: string) => {
    for (const k of [...mockFiles.keys()]) if (k === p || k.startsWith(`${p}/`)) mockFiles.delete(k);
  }),
  exists: jest.fn(async (p: string) => [...mockFiles.keys()].some(k => k === p || k.startsWith(`${p}/`))),
};
jest.mock('@dr.pogodin/react-native-fs', () => mockFs);

import { DiaryWriteSheet } from '../src/features/myroom/diary/components/DiaryWriteSheet';
import { DiaryImage } from '../src/features/myroom/diary/components/DiaryImage';
import { pickPhotos, discardPending } from '../src/features/myroom/diary/photos';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { useLanguageStore } from '../src/shared/i18n';

const TMP = '/Users/x/Library/Developer/CoreSimulator/Devices/D/data/Containers/Data/Application/A/tmp';
const pending = (id: string) => `/docs/diary/_pending/${id}.jpg`;
const pendingFiles = () => [...mockFiles.keys()].filter(k => k.startsWith('/docs/diary/_pending/'));

beforeEach(() => {
  mockFiles.clear();
  mockDevlog.mockClear();
  mockPicker.launchImageLibrary.mockReset();
  useLanguageStore.setState({ lang: 'en' } as never);
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
  useConversationsStore.setState({ byId: {}, order: [] } as never);
});

/** The library's answer: four assets in tmp, the first `written` of which really exist. */
function libraryAnswers(written: number) {
  const assets = [0, 1, 2, 3].map(i => ({ uri: `file://${TMP}/P${i}.jpg`, width: 1200, height: 1600, type: 'image/jpeg' }));
  assets.slice(0, written).forEach((a, i) => mockFiles.set(a.uri.slice(7), 1000 + i));
  mockPicker.launchImageLibrary.mockResolvedValueOnce({ assets });
}

describe('pickPhotos', () => {
  it('copies each pick into the pending folder and hands back the copy, with a devlog line', async () => {
    libraryAnswers(4);
    const r = await pickPhotos(4);
    if (r.status !== 'ok') throw new Error(r.status);
    expect(r.failed).toBe(0);
    expect(r.photos).toHaveLength(4);
    for (const p of r.photos) {
      expect(p.uri).toBe(`file://${pending(p.id)}`);
      expect(mockFiles.has(pending(p.id))).toBe(true);
    }
    expect(mockPicker.launchImageLibrary).toHaveBeenCalledWith(expect.objectContaining({ assetRepresentationMode: 'compatible' }));
    const id = r.photos[0].id;
    expect(mockDevlog).toHaveBeenCalledWith(`[diary] picked ${id} file://${TMP}/P0.jpg -> ${pending(id)} 1000 1200x1600`);
  });

  it('drops a pick the library never wrote, and says so', async () => {
    libraryAnswers(1);
    const r = await pickPhotos(4);
    expect(r).toMatchObject({ status: 'ok', failed: 3 });
    expect(pendingFiles()).toHaveLength(1);
    expect(mockDevlog.mock.calls.filter(([l]) => / -> source missing /.test(l))).toHaveLength(3);

    mockPicker.launchImageLibrary.mockResolvedValueOnce({ assets: [{ uri: `file://${TMP}/gone.jpg`, width: 0, height: 0 }] });
    expect(await pickPhotos(4)).toEqual({ status: 'error' });
  });

  it('reads a percent-encoded uri (an NSURL absoluteString)', async () => {
    mockFiles.set('/tmp/My Photos/a.jpg', 50);
    mockPicker.launchImageLibrary.mockResolvedValueOnce({ assets: [{ uri: 'file:///tmp/My%20Photos/a.jpg', width: 1, height: 1 }] });
    expect(await pickPhotos(1)).toMatchObject({ status: 'ok', failed: 0 });
  });

  it('discardPending deletes only pending copies', async () => {
    mockFiles.set('/docs/diary/m1/kept.jpg', 9);
    libraryAnswers(2);
    const r = await pickPhotos(2);
    if (r.status !== 'ok') throw new Error(r.status);
    await discardPending([...r.photos, { id: 'kept', uri: 'file:///docs/diary/m1/kept.jpg', width: 1, height: 1 }]);
    expect(pendingFiles()).toEqual([]);
    expect(mockFiles.has('/docs/diary/m1/kept.jpg')).toBe(true);
  });
});

describe('the Write sheet', () => {
  const byId = (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
    r.root.findAll(n => n.props.testID === id && typeof n.type !== 'string')[0];
  const previews = (r: ReactTestRenderer.ReactTestRenderer) =>
    r.root.findAllByType(Image)
      .filter(i => String(i.props.testID).startsWith('diary-photo-img-'))
      .map(i => (i.props.source as { uri: string }).uri);

  let open: ReactTestRenderer.ReactTestRenderer | null = null;
  afterEach(() => { try { open?.unmount(); } catch {} open = null; });

  async function openAndPick(written = 4) {
    let r!: ReactTestRenderer.ReactTestRenderer;
    const onSaved = jest.fn();
    await act(async () => {
      r = ReactTestRenderer.create(<DiaryWriteSheet initialKind="wish" onClose={jest.fn()} onSaved={onSaved} />);
    });
    libraryAnswers(written);
    open = r;
    await act(async () => byId(r, 'diary-add-photo').props.onPress());
    return { r, onSaved };
  }

  it('previews the pending copies, never the picker’s tmp file', async () => {
    const { r } = await openAndPick();
    const uris = previews(r);
    expect(uris).toHaveLength(4);
    for (const u of uris) expect(u).toMatch(/^file:\/\/\/docs\/diary\/_pending\/ph_.*\.jpg$/);
    expect(uris.some(u => u.includes('/tmp/'))).toBe(false);
  });

  it('Save moves the copies into the entry’s folder and leaves nothing pending', async () => {
    const { r, onSaved } = await openAndPick();
    await act(async () => byId(r, 'diary-text').props.onChangeText('A good day.'));
    await act(async () => byId(r, 'diary-save').props.onPress());
    const memory = onSaved.mock.calls[0][0];
    const list = useDiaryStore.getState().photos[memory.id];
    expect(list).toHaveLength(4);
    for (const p of list) {
      expect(p.localUri).toBe(`file:///docs/diary/${memory.id}/${p.id}.jpg`);
      expect(mockFiles.has(`/docs/diary/${memory.id}/${p.id}.jpg`)).toBe(true);
    }
    expect(mockFs.moveFile).toHaveBeenCalled();
    expect(pendingFiles()).toEqual([]);
    // The sheet goes after Save: its unmount must not take the saved files with it.
    act(() => r.unmount());
    await act(async () => {});
    expect(list.every(p => mockFiles.has(p.localUri!.slice(7)))).toBe(true);
  });

  it('discarding the sheet deletes the pending copies; × deletes one at once', async () => {
    const { r } = await openAndPick();
    expect(pendingFiles()).toHaveLength(4);
    const first = r.root.findAll(n => n.props.accessibilityLabel === 'Remove photo' && typeof n.props.onPress === 'function')[0];
    await act(async () => first.props.onPress());
    expect(pendingFiles()).toHaveLength(3);
    act(() => r.unmount());
    await act(async () => {});
    expect(pendingFiles()).toEqual([]);
  });

  it('says so on the sheet when a pick left no file', async () => {
    const { r } = await openAndPick(2);
    expect(previews(r)).toHaveLength(2);
    expect(r.root.findAll(n => n.props.testID === 'diary-photo-failed').length).toBeGreaterThan(0);
  });

  it('a tile has a visible plate under the photo', async () => {
    const { r } = await openAndPick(1);
    const tile = r.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('diary-photo-ph_'))[0];
    const flat = Object.assign({}, ...[tile.props.style].flat(Infinity).filter(Boolean));
    expect(flat.backgroundColor).toBeTruthy();
  });
});

it('DiaryImage logs a failed load and falls back to the plate', async () => {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { r = ReactTestRenderer.create(<DiaryImage localUri="file:///docs/x.jpg" style={{ width: 10, height: 10 }} testID="img" />); });
  const img = r.root.findByType(Image);
  await act(async () => img.props.onError({ nativeEvent: { error: 'no such file' } }));
  expect(mockDevlog).toHaveBeenCalledWith('[diary] image failed file:///docs/x.jpg no such file');
  expect(r.root.findAllByType(Image)).toHaveLength(0);
});
