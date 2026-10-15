/**
 * Spec 006 T028 — the reflection's round trip and the server-owned halves of a diary entry.
 *
 * Pinned: pending → ready by polling; still pending at 45 s returns pending (the sheet then says
 * "still reading", never a client-written reflection); a 404 pushes the 아카이브 and asks once more;
 * a 401 is reported, not retried forever; a pull hands `reflection` / `photos` to the diary store
 * and keeps them out of the archive row.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
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
import { pullArchive } from '../src/features/archive/api/memoriesApi';
import { awaitReflection, flushPhotos, photoSource, requestReflection } from '../src/features/myroom/diary/diaryApi';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';

type Handler = (url: string, init: RequestInit) => { status: number; body: unknown };
let handler: Handler;
const calls: { url: string; method: string }[] = [];
(global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
  calls.push({ url, method: init.method ?? 'GET' });
  const { status, body } = handler(url, init);
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
});

const reflection = (status: string, text = '') => ({
  status, text, topics: status === 'ready' ? ['people', 'future'] : [], counselor: 'dosa', lang: 'en', stale: false, generatedAt: null,
});
const noSleep = async () => {};

beforeEach(() => {
  calls.length = 0;
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
});

describe('the reflection', () => {
  it('goes pending → ready by polling GET, and every step reaches the screen', async () => {
    let gets = 0;
    handler = (url, init) => {
      if (init.method === 'POST') return { status: 202, body: { success: true, reflection: reflection('pending') } };
      gets += 1;
      return { status: 200, body: { success: true, reflection: gets < 3 ? reflection('pending') : reflection('ready', 'A good day. Rest well.') } };
    };
    const seen: string[] = [];
    const last = await awaitReflection('mem_1', 'en', { onUpdate: r => seen.push(r.status), sleep: noSleep });
    expect(last?.status).toBe('ready');
    expect(seen).toEqual(['pending', 'pending', 'pending', 'ready']);
    expect(useDiaryStore.getState().reflections.mem_1.text).toBe('A good day. Rest well.');
    expect(calls[0]).toMatchObject({ method: 'POST', url: expect.stringContaining('/api/v1/prayers/memories/mem_1/reflection') });
  });

  it('stops at 45 s still pending, and a reflection that lands later replaces it on the next pull', async () => {
    handler = () => ({ status: 202, body: { success: true, reflection: reflection('pending') } });
    const last = await awaitReflection('mem_1', 'en', { sleep: noSleep });
    expect(last?.status).toBe('pending');
    expect(calls.filter(c => c.method === 'GET')).toHaveLength(15); // 45 s / 3 s

    handler = () => ({
      status: 200,
      body: { success: true, memories: [{ id: 'mem_1', category: 'diary', content: 'x', details: { mood: 'great' }, reflection: reflection('ready', 'Later.'), photos: [] }] },
    });
    await pullArchive();
    expect(useDiaryStore.getState().reflections.mem_1).toMatchObject({ status: 'ready', text: 'Later.' });
    // Read-only: never folded into the row the phone pushes back.
    expect(useArchiveStore.getState().memories[0].details).toEqual({ mood: 'great' });
  });

  it('on 404 (not synced yet) pushes the 아카이브 and asks exactly once more', async () => {
    useArchiveStore.getState().add({ category: 'diary', content: 'a', details: { mood: 'good', date: '2026-10-07' } });
    let posts = 0;
    handler = url => {
      if (url.endsWith('/memories/sync')) return { status: 200, body: { success: true } };
      posts += 1;
      return posts === 1
        ? { status: 404, body: { success: false, error_code: 'MEMORY_NOT_FOUND' } }
        : { status: 200, body: { success: true, reflection: reflection('fallback', 'Saved line.') } };
    };
    const r = await requestReflection(useArchiveStore.getState().memories[0].id, 'ko');
    expect(r).toMatchObject({ ok: true, reflection: { status: 'fallback' } });
    expect(calls.map(c => c.url.split('/').pop())).toEqual(['reflection', 'sync', 'reflection']);
  });

  it('reports a 401 and a non-diary 422 instead of retrying', async () => {
    handler = () => ({ status: 401, body: { success: false } });
    expect(await requestReflection('m', 'en')).toEqual({ ok: false, status: 401, code: undefined });
    expect(calls).toHaveLength(1);
    handler = () => ({ status: 422, body: { success: false, error_code: 'CATEGORY_NOT_DIARY' } });
    expect(await requestReflection('m', 'en')).toEqual({ ok: false, status: 422, code: 'CATEGORY_NOT_DIARY' });
    expect(await awaitReflection('m', 'en', { sleep: noSleep })).toBeNull();
  });
});

describe('photos', () => {
  it('a pull keeps the phone copy of a server photo and a local photo still queued', async () => {
    useDiaryStore.setState({
      photos: {
        mem_1: [
          { id: 'p1', localUri: 'file:///docs/diary/mem_1/p1.jpg', width: 10, height: 10, position: 0, uploaded: true },
          { id: 'p2', localUri: 'file:///docs/diary/mem_1/p2.jpg', width: 10, height: 10, position: 1, uploaded: false },
        ],
      },
    });
    handler = () => ({
      status: 200,
      body: { success: true, memories: [{ id: 'mem_1', category: 'diary', content: 'x', details: {}, reflection: null,
        photos: [{ id: 'p1', url: '/api/v1/prayers/memories/mem_1/photos/p1/file', width: 1600, height: 1200, position: 0 }] }] },
    });
    await pullArchive();
    const list = useDiaryStore.getState().photos.mem_1;
    expect(list.map(p => [p.id, p.uploaded, !!p.localUri])).toEqual([['p1', true, true], ['p2', false, true]]);
    expect(list[0].width).toBe(1600);
  });

  it('a dev-disk url is a path under the API base that needs the account headers; a presigned one does not', async () => {
    const disk = await photoSource('/api/v1/prayers/memories/m/photos/p/file');
    expect(disk.uri).toMatch(/^http:\/\/127\.0\.0\.1:4000\/api\/v1\/prayers\/memories\/m\/photos\/p\/file$/);
    expect(disk.headers).toEqual({ 'Game-Token': 'tok', 'User-Auth': 'dev-x' });
    expect(await photoSource('https://r2.example.com/x.jpg?sig=1')).toEqual({ uri: 'https://r2.example.com/x.jpg?sig=1' });
  });

  it('the queue skips an entry still waiting to push, uploads once, and retries a failure next time', async () => {
    const m = useArchiveStore.getState().add({ category: 'diary', content: 'a', details: {} });
    useDiaryStore.getState().addPhotos(m.id, [{ id: 'p1', localUri: 'file:///x.jpg', width: 1, height: 1, position: 0, uploaded: false }]);
    handler = () => ({ status: 500, body: {} });
    await flushPhotos();
    expect(calls).toHaveLength(0); // dirty: its upload would only 404

    useArchiveStore.getState().pushed([m.id], []);
    handler = () => ({ status: 503, body: {} });
    await flushPhotos();
    expect(useDiaryStore.getState().photos[m.id][0].uploaded).toBe(false);

    handler = () => ({ status: 200, body: { success: true, photo: { id: 'p1', url: '/f', width: 2, height: 3, position: 0 } } });
    await flushPhotos();
    await flushPhotos();
    expect(calls.filter(c => c.method === 'POST')).toHaveLength(2);
    expect(useDiaryStore.getState().photos[m.id][0]).toMatchObject({ uploaded: true, url: '/f' });
  });
});
