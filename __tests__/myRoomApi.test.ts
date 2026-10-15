/**
 * My Room against saju_server (spec 005 T024/T033), below the screen:
 *  · saveLayout reads every answer of PUT prayers/myroom — saved (the server's normalised copy and
 *    what it dropped), 409 VERSION_CONFLICT (their copy, to reload), 422 LAYOUT_INVALID (reasons),
 *    no answer (offline) and any other refusal (401 kept as an error),
 *  · the device cache: per account, persisted, and sending back the version it was loaded at,
 *  · purchases: one key per intent (kept across a lost answer or a 5xx, dropped on a definitive
 *    one), IDEM_KEY_REUSED told apart from ALREADY_OWNED, and the shared 402 shape,
 *  · the UUID v4 behind the keys, with and without `crypto.getRandomValues`.
 */
const mockDisk = new Map<string, string>();
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => mockDisk.get(k) ?? null,
    setItem: async (k: string, v: string) => { mockDisk.set(k, v); },
    removeItem: async (k: string) => { mockDisk.delete(k); },
  },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import { authedFetch } from '../src/features/auth/api/headers';
import { buyMyRoomSku, getMyRoom, purchaseKeyFor, saveLayout } from '../src/features/myroom/api/myRoomApi';
import { useMyRoomStore } from '../src/features/myroom/store/myRoomStore';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useInbox } from '../src/features/myroom/inbox/inboxStore';
import { uuidV4 } from '../src/shared/uuid';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const SOFA = { uid: 'a1', item: 'Sofa', pos: { x: 1, z: -0.5 }, rot: 90, slot: null };
const IVY = { uid: 'h1', item: 'HangingIvy', pos: null, rot: 0, slot: 'cornice.2' };
const OWNED = { items: { Sofa: 1, HangingIvy: 2 }, themes: ['basic'] };
const flush = () => new Promise(r => setImmediate(r));
const UUID4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

beforeEach(() => {
  fetchMock.mockReset();
  useCoins.setState({ balance: 10, products: [], shopOpen: false });
  useAuthStore.setState({ userAuth: 'u-1' });
  useMyRoomStore.setState({ byUser: {} });
  useInbox.setState({ items: [] });
});

describe('saveLayout (PUT prayers/myroom)', () => {
  const layout = { theme: 'basic', items: [SOFA, IVY] };

  it('200: the server’s copy at version + 1, what it dropped, and the wallet', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, {
      success: true, theme: 'basic', items: [SOFA], version: 4, owned: OWNED, coin_balance: 300,
      dropped: [{ uid: 'h1', item: 'HangingIvy', reason: 'not_owned' }, { uid: null, item: 'theme:fantasy', reason: 'not_owned' }],
    }));
    const r = await saveLayout(layout, 3);
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/myroom$/);
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ theme: 'basic', items: [SOFA, IVY], version: 3 });
    expect(r).toEqual({
      kind: 'saved', layout: { theme: 'basic', items: [SOFA] }, version: 4, owned: OWNED,
      dropped: [{ uid: 'h1', item: 'HangingIvy', reason: 'not_owned' }, { uid: null, item: 'theme:fantasy', reason: 'not_owned' }],
    });
    expect(useCoins.getState().balance).toBe(300);
  });

  it('a reset sends `items: null` explicitly (a PUT without the key is refused)', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { success: true, theme: 'basic', items: null, version: 1, owned: OWNED, dropped: [] }));
    const r = await saveLayout({ theme: 'basic', items: null }, 0);
    expect(fetchMock.mock.calls[0][1].body).toBe('{"theme":"basic","items":null,"version":0}');
    expect(r).toMatchObject({ kind: 'saved', layout: { theme: 'basic', items: null }, version: 1 });
  });

  it('409 VERSION_CONFLICT: the current copy, to reload', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, {
      success: false, error_code: 'VERSION_CONFLICT', theme: 'modern', items: [IVY], version: 7, owned: OWNED, coin_balance: 10,
    }));
    expect(await saveLayout(layout, 3)).toEqual({
      kind: 'conflict', layout: { theme: 'modern', items: [IVY] }, version: 7, owned: OWNED,
    });
  });

  it('422 LAYOUT_INVALID: the reasons, nothing stored', async () => {
    fetchMock.mockResolvedValueOnce(reply(422, { success: false, error_code: 'LAYOUT_INVALID', reasons: ['items[0].pos', 'version'] }));
    expect(await saveLayout(layout, 3)).toEqual({ kind: 'invalid', reasons: ['items[0].pos', 'version'] });
  });

  it('offline: no answer (a thrown fetch or none at all); 401 is an error, not offline', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));
    expect(await saveLayout(layout, 3)).toEqual({ kind: 'offline' });
    fetchMock.mockResolvedValueOnce(undefined);
    expect(await saveLayout(layout, 3)).toEqual({ kind: 'offline' });
    fetchMock.mockResolvedValueOnce({ status: 401, ok: false, json: async () => { throw new Error('HTTP Token Access denied.'); } });
    expect(await saveLayout(layout, 3)).toEqual({ kind: 'failed', status: 401 });
  });
});

describe('GET prayers/myroom', () => {
  it('reads layout, version and owned; a never-saved room is items: null at version 0', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { success: true, theme: 'basic', items: null, version: 0, owned: OWNED, coin_balance: 55 }));
    expect(await getMyRoom()).toEqual({ layout: { theme: 'basic', items: null }, version: 0, owned: OWNED });
    expect(useCoins.getState().balance).toBe(55);
    fetchMock.mockResolvedValueOnce(reply(500, {}));
    expect(await getMyRoom()).toBeNull();
  });
});

describe('the device cache (myRoomStore)', () => {
  const KEY = 'prayers.myroom.v1';

  it('is per account and persisted: a relaunch opens on the same room, another account on its own', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, { success: true, theme: 'basic', items: [SOFA], version: 2, owned: OWNED }));
    await useMyRoomStore.getState().refresh();
    await flush();
    const saved = mockDisk.get(KEY)!;
    expect(JSON.parse(saved).state.byUser['u-1']).toMatchObject({ layout: { theme: 'basic', items: [SOFA] }, version: 2, owned: OWNED });

    // Relaunch: memory gone, the disk row read back.
    useMyRoomStore.setState({ byUser: {} });
    mockDisk.set(KEY, saved);
    await useMyRoomStore.persist.rehydrate();
    expect(useMyRoomStore.getState().current()).toMatchObject({ version: 2, layout: { items: [SOFA] } });

    useAuthStore.setState({ userAuth: 'u-2' });
    expect(useMyRoomStore.getState().current()).toBeNull();
  });

  it('offline keeps the cache; saveLayout sends the cached version and keeps the server’s copy on save and on conflict', async () => {
    useMyRoomStore.setState({ byUser: { 'u-1': { layout: { theme: 'basic', items: [SOFA] }, version: 5, owned: OWNED, updatedAt: 'x' } } });
    fetchMock.mockResolvedValueOnce(undefined);
    expect(await useMyRoomStore.getState().refresh()).toBeNull();
    expect(useMyRoomStore.getState().current()?.version).toBe(5);

    fetchMock.mockResolvedValueOnce(reply(409, { success: false, error_code: 'VERSION_CONFLICT', theme: 'basic', items: [IVY], version: 6, owned: OWNED }));
    const conflict = await useMyRoomStore.getState().saveLayout({ theme: 'basic', items: [SOFA, IVY] });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).version).toBe(5);
    expect(conflict.kind).toBe('conflict');
    expect(useMyRoomStore.getState().current()).toMatchObject({ version: 6, layout: { items: [IVY] } });

    fetchMock.mockResolvedValueOnce(reply(200, { success: true, theme: 'basic', items: [IVY, SOFA], version: 7, owned: OWNED, dropped: [] }));
    await useMyRoomStore.getState().saveLayout({ theme: 'basic', items: [IVY, SOFA] });
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).version).toBe(6);
    expect(useMyRoomStore.getState().current()).toMatchObject({ version: 7, layout: { items: [IVY, SOFA] } });

    // 422 / offline: nothing stored, the cache unchanged.
    fetchMock.mockResolvedValueOnce(reply(422, { success: false, error_code: 'LAYOUT_INVALID', reasons: ['items'] }));
    await useMyRoomStore.getState().saveLayout({ theme: 'basic', items: [] });
    expect(useMyRoomStore.getState().current()?.version).toBe(7);
  });
});

describe('purchases (POST prayers/myroom/purchase)', () => {
  const sent = () => fetchMock.mock.calls.map(c => JSON.parse(c[1].body));
  const ok = () => reply(200, { success: true, sku: 'item:Sofa', charged: 150, coin_balance: 350, owned: OWNED });

  it('one key per intent: kept across a lost answer and a 5xx, dropped by a definitive answer', async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError('Network request failed'))
      .mockResolvedValueOnce(reply(503, {}))
      .mockResolvedValueOnce(ok())
      .mockResolvedValueOnce(ok());
    expect(await buyMyRoomSku('item:Sofa')).toEqual({ ok: false, kind: 'failed' });
    expect(await buyMyRoomSku('item:Sofa')).toEqual({ ok: false, kind: 'failed' });
    expect(await buyMyRoomSku('item:Sofa')).toMatchObject({ ok: true, charged: 150, balance: 350 });
    await buyMyRoomSku('item:Sofa');
    const keys = sent().map(b => b.idem_key);
    expect(keys[0]).toMatch(UUID4);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).toBe(keys[0]);
    expect(keys[3]).not.toBe(keys[0]);
    // Another piece is another intent.
    expect(purchaseKeyFor('item:Pouf')).not.toBe(purchaseKeyFor('item:Sofa'));
  });

  it('409 tells IDEM_KEY_REUSED from ALREADY_OWNED, and either ends the intent', async () => {
    fetchMock.mockResolvedValueOnce(reply(409, { success: false, error_code: 'IDEM_KEY_REUSED' }));
    expect(await buyMyRoomSku('theme:modern')).toEqual({ ok: false, kind: 'keyReused' });
    fetchMock.mockResolvedValueOnce(reply(409, { success: false, error_code: 'ALREADY_OWNED' }));
    expect(await buyMyRoomSku('theme:modern')).toEqual({ ok: false, kind: 'owned' });
    const [a, b] = sent().map(x => x.idem_key);
    expect(a).not.toBe(b);
  });

  it('402 is the shared insufficient shape, and the wallet is set here — or left alone when the reply has no balance', async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { success: false, error_code: 'INSUFFICIENT_COINS', price: 150, coin_balance: 40 }));
    expect(await buyMyRoomSku('item:Sofa')).toEqual({ ok: false, kind: 'insufficient', price: 150, balance: 40 });
    expect(useCoins.getState().balance).toBe(40);
    fetchMock.mockResolvedValueOnce(reply(402, { success: false, error_code: 'INSUFFICIENT_COINS' }));
    expect(await buyMyRoomSku('item:Sofa')).toEqual({ ok: false, kind: 'insufficient', price: null, balance: 40 });
    expect(useCoins.getState().balance).toBe(40);
  });
});

describe('uuidV4', () => {
  it('is a v4 UUID with crypto.getRandomValues, and without it', () => {
    const g = globalThis as { crypto?: unknown };
    const had = Object.getOwnPropertyDescriptor(g, 'crypto');
    const seen = new Set<string>();
    try {
      Object.defineProperty(g, 'crypto', { value: { getRandomValues: (a: Uint8Array) => { a.fill(0xff); return a; } }, configurable: true });
      expect(uuidV4()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
      Object.defineProperty(g, 'crypto', { value: undefined, configurable: true });
      for (let i = 0; i < 200; i++) seen.add(uuidV4());
    } finally {
      if (had) Object.defineProperty(g, 'crypto', had);
      else delete g.crypto;
    }
    expect(seen.size).toBe(200);
    seen.forEach(u => expect(u).toMatch(UUID4));
  });
});
