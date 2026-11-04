/**
 * 아카이브 sync vs an edit made while it is in flight (29-10).
 *
 * The push used to clear every id it sent, by id, when the server answered — so a second edit typed
 * during the request lost its dirty mark, the pull that follows put the server's older copy back on
 * the phone, and the edit was gone from both. Pinned: the second edit stays local AND dirty, and
 * the next sync is what carries it up.
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
import { syncArchive } from '../src/features/archive/api/memoriesApi';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';
import type { ArchiveMemory } from '../src/features/archive/types';

/** What the server holds, by id: whatever the last push sent. */
const server = new Map<string, ArchiveMemory>();
const pushedBodies: { upserts: ArchiveMemory[] }[] = [];
/** When set, the next POST waits on this before it answers. */
let gate: Promise<void> | null = null;

(global as any).fetch = jest.fn(async (url: string, init: RequestInit = {}) => {
  const answer = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body }) as Response;
  if (init.method === 'POST' && url.endsWith('/memories/sync')) {
    const body = JSON.parse(String(init.body));
    pushedBodies.push(body);
    if (gate) {
      const g = gate;
      gate = null;
      await g;
    }
    body.upserts.forEach((m: ArchiveMemory) => server.set(m.id, m));
    return answer(200, { success: true, saved: body.upserts.length, deleted: 0 });
  }
  if (url.endsWith('/memories')) return answer(200, { success: true, memories: [...server.values()] });
  return answer(404, {});
});

beforeEach(() => {
  server.clear();
  pushedBodies.length = 0;
  gate = null;
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
});

it('an edit made while the push is in flight stays on the phone, stays dirty, and goes up next time', async () => {
  const m = useArchiveStore.getState().add({ category: 'wish', content: 'v1' });

  let release: () => void = () => {};
  gate = new Promise(r => { release = r; });
  const sync = syncArchive();
  // Let the request leave (headers + fetch) before the player edits the row again.
  await new Promise(r => setTimeout(r, 0));
  expect(pushedBodies).toHaveLength(1);
  useArchiveStore.getState().update(m.id, { content: 'v2' });
  release();
  await sync;

  const st = useArchiveStore.getState();
  expect(st.memories.find(x => x.id === m.id)?.content).toBe('v2');
  expect(st.dirty).toEqual([m.id]);
  expect(server.get(m.id)?.content).toBe('v1');

  await syncArchive();
  expect(pushedBodies[1].upserts.map(x => x.content)).toEqual(['v2']);
  expect(server.get(m.id)?.content).toBe('v2');
  expect(useArchiveStore.getState().dirty).toEqual([]);
  expect(useArchiveStore.getState().memories.find(x => x.id === m.id)?.content).toBe('v2');
});

it('a row left alone during the push is marked synced as before', async () => {
  const m = useArchiveStore.getState().add({ category: 'wish', content: 'only' });
  await syncArchive();
  expect(useArchiveStore.getState().dirty).toEqual([]);
  expect(server.get(m.id)?.content).toBe('only');
});
