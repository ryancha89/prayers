/**
 * My Room's decorate mode, the RN half (spec 005 T025), with the embedded player present.
 *
 * Pinned here:
 *  · the way in: Decorate waits for MYROOM_READY and for this visit's GET (offline = muted, with a
 *    "needs connection" note and no MYROOM_EDIT); a seated player stands first; walking controls go,
 *  · the messages: MYROOM_EDIT on / off+cancel / off then MYROOM_LAYOUT (the server's copy) on Done,
 *    a tap → MYROOM_TAP, one finger → MYROOM_DRAG (a stream: begin and end always, moves coalesced),
 *    ↺ ↻ → MYROOM_ROTATE, swap → MYROOM_SWAP, store → MYROOM_REMOVE, tray → MYROOM_ADD,
 *  · Done: off until Unity calls the layout valid, the reason shown; 409 stays in edit mode and shows
 *    their room; 422 / offline / 401 keep the edit and say so,
 *  · the tray: owned copies minus placed copies; swap: same kind AND category, a copy left, not itself,
 *  · the kept edit: a remount resumes it.
 */
import React from 'react';
import { Alert, Dimensions, PanResponder, StyleSheet } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
const mockSafe = { top: 0, right: 0, bottom: 0, left: 0 };
const mockNavListeners: Record<string, Set<(e: unknown) => void>> = {};
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockSafe,
}));
jest.mock('../src/shared/devlog', () => ({ devlog: jest.fn() }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('../src/features/tickets/api/attendance', () => ({ fetchAttendance: async () => null, checkIn: jest.fn() }));
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [], dropPendingBeatLines: jest.fn(), openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(), sayBeatLine: jest.fn(), stopBeatVoice: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  // Listeners are recorded so a test can play the back gesture (beforeRemove) at the screen.
  useNavigation: () => ({
    navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(),
    addListener: (event: string, fn: (e: unknown) => void) => {
      (mockNavListeners[event] ??= new Set()).add(fn);
      return () => mockNavListeners[event].delete(fn);
    },
  }),
  useFocusEffect: () => {},
}));
jest.mock('../src/features/counseling/bridge', () => {
  const { NativeUnityBridge } = jest.requireActual('../src/features/counseling/bridge/NativeUnityBridge');
  const bridge = new NativeUnityBridge();
  const posted: { type: string; payload?: unknown }[] = [];
  bridge.registerView({ postMessage: (_g: string, _m: string, message: string) => posted.push(JSON.parse(message)) });
  return {
    isNativeUnity: () => true,
    nativeUnityBridge: bridge,
    getUnityBridge: () => bridge,
    getWorldBridge: () => bridge,
    getMyRoomBridge: () => bridge,
    mockPosted: posted,
  };
});
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import { nativeUnityBridge } from '../src/features/counseling/bridge';
import { MyRoomScreen } from '../src/features/myroom/screens/MyRoomScreen';
import { useMyRoomStore } from '../src/features/myroom/store/myRoomStore';
import { MYROOM_FEATURES } from '../src/features/myroom/edit/features';
import { copiesLeft, swapCandidates } from '../src/features/myroom/edit/decorate';
import { TRAY_SHARE, trayCap, trayMaxHeight } from '../src/features/myroom/components/DecorateTray';
import { skinList, swatchFor } from '../src/features/myroom/edit/decorate';
import { INSETS_SETTLE_MS } from '../src/features/counseling/bridge/viewInsets';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useLanguageStore } from '../src/shared/i18n';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useInbox } from '../src/features/myroom/inbox/inboxStore';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import type { CatalogItem } from '../src/features/myroom/api/myRoomApi';
import type { MyRoomItem, MyRoomLayout, MyRoomOwned } from '../src/features/counseling/types';

const { mockPosted } = jest.requireMock('../src/features/counseling/bridge') as {
  mockPosted: { type: string; payload?: unknown }[];
};
const { authedFetch } = jest.requireMock('../src/features/auth/api/headers') as { authedFetch: jest.Mock };
const posts = (type: string) => mockPosted.filter(p => p.type === type);
const fromUnity = (event: object) => act(() => nativeUnityBridge.receiveFromUnity(JSON.stringify(event)));
const reply = (status: number, body: object) => ({ ok: status < 300, status, json: async () => body });

const piece = (uid: string, item: string, slot: string | null = null): MyRoomItem =>
  ({ uid, item, pos: slot ? null : { x: 0, z: 0 }, rot: 0, slot });
const ROOM: MyRoomLayout = { theme: 'basic', items: [piece('s1', 'Sofa'), piece('a1', 'Armchair'), piece('l1', 'TableLamp', 'Desk:top')] };
const OWNED = { items: { Sofa: 1, Armchair: 1, Pouf: 2, TableLamp: 1, GlobeLamp: 1, Bed: 1 }, themes: ['basic'] };
const CATALOG = {
  success: true, coin_balance: 1000, furniture_for_sale: true,
  // `modern` on sale here, as it will be once Unity's art is wired (the server has it off sale today).
  themes: [
    { id: 'basic', price: 0, starter: true, owned: true },
    { id: 'modern', price: 500, starter: false, owned: false },
    { id: 'fantasy', price: 800, starter: false, owned: false },
  ],
  items: [
    { id: 'Sofa', kind: 'floor', category: 'seat', size: 'large', price: 150, starter: 1, owned: 1, buyable: true },
    { id: 'Armchair', kind: 'floor', category: 'seat', size: 'large', price: 150, starter: 1, owned: 1, buyable: true },
    { id: 'Pouf', kind: 'floor', category: 'seat', size: 'small', price: 50, starter: 1, owned: 2, buyable: true },
    { id: 'Bed', kind: 'floor', category: 'bed', size: 'large', price: 150, starter: 1, owned: 1, buyable: true },
    { id: 'TableLamp', kind: 'surface', category: 'lamp', size: 'small', price: 50, starter: 1, owned: 1, buyable: true },
    { id: 'GlobeLamp', kind: 'surface', category: 'lamp', size: 'small', price: 50, starter: 1, owned: 1, buyable: true },
  ],
};

/** Stage 1 (14-10): the same catalog, every piece still listed, none for sale. */
const SKINS_ONLY = { ...CATALOG, furniture_for_sale: false, items: CATALOG.items.map(i => ({ ...i, buyable: false })) };

/** The server: GET answers (or not), PUT answers `put`. Every PUT body is recorded. */
const server = {
  online: true,
  put: [] as unknown[],
  putReply: null as null | (() => unknown),
  owned: OWNED as MyRoomOwned,
  purchaseReply: null as null | ((body: { sku: string; idem_key: string }) => unknown),
  purchases: [] as { sku: string; idem_key: string }[],
  forSale: true,
};
function serve() {
  authedFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
    if (!server.online) return undefined;
    if (url.endsWith('/myroom/catalog')) return reply(200, server.forSale ? CATALOG : SKINS_ONLY);
    if (url.endsWith('/myroom/purchase')) {
      const body = JSON.parse(init!.body!);
      server.purchases.push(body);
      return server.purchaseReply ? server.purchaseReply(body) : undefined;
    }
    if (url.endsWith('/myroom') && init?.method === 'PUT') {
      server.put.push(JSON.parse(init.body!));
      return server.putReply ? server.putReply() : undefined;
    }
    if (url.endsWith('/myroom')) return reply(200, { success: true, ...ROOM, version: 3, owned: server.owned, coin_balance: 1000 });
    return null;
  });
}

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
const render = async () => {
  await act(async () => { tree = ReactTestRenderer.create(<MyRoomScreen />); });
  await act(async () => {});
};
const has = (testID: string) => tree!.root.findAll(n => n.props.testID === testID).length > 0;
const node = (testID: string) => tree!.root.findAll(n => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
const tap = (testID: string) => {
  const n = node(testID);
  if (!n) throw new Error(`no ${testID}`);
  return act(async () => { await n.props.onPress(); });
};
/** The Decorate button as assistive tech reads it (PillButton's `muted`). */
const editMuted = () => tree!.root.findAll(n => n.props.testID === 'myroom-edit').some(n => n.props.accessibilityState?.disabled === true);
const texts = () => tree!.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
const changed = (layout: MyRoomLayout, valid = true, reason = '', uid = '') =>
  fromUnity({ type: 'MYROOM_LAYOUT_CHANGED', payload: { layout, valid, reason, uid } });
const select = (uid: string, item: string, kind: string, canMove: boolean) =>
  fromUnity({ type: 'MYROOM_SELECT', payload: { uid, item, kind, canMove } });

/** The room with the lamp put away: a working copy that differs from the entry. */
const EDITED: MyRoomLayout = { theme: 'basic', items: [piece('s1', 'Sofa'), piece('a1', 'Armchair')] };

/** Unity has the room back after edit mode (its MYROOM_LAYOUT_APPLIED): the walk HUD returns. */
const backToWalk = () => fromUnity({ type: 'MYROOM_LAYOUT_APPLIED', payload: { theme: 'basic', placed: 3, skipped: [] } });

/** In the room, the GET answered, edit mode on and Unity's first report in. */
async function intoEditMode() {
  await render();
  fromUnity({ type: 'MYROOM_READY' });
  await tap('myroom-edit');
  changed(ROOM);
}

beforeEach(() => {
  useLanguageStore.setState({ lang: 'ko' });
  useCoins.setState({ balance: 100, shopOpen: false });
  useAuthStore.setState({ userAuth: null, displayName: null });
  useInbox.setState({ items: [] });
  useArchiveStore.setState({ memories: [] });
  useJourneyPlayer.setState({ journeyId: null, status: 'idle' } as never);
  // Storage on for the suites written with it (the code stays covered); stage 1's own describe
  // switches it off.
  MYROOM_FEATURES.storage = true;
  // The coach has been seen: it has its own test, and would sit over every other one.
  useMyRoomStore.setState({ byUser: {}, pending: null, coachSeen: { '-': true } });
  server.online = true;
  server.put = [];
  server.putReply = null;
  server.owned = OWNED;
  server.purchaseReply = null;
  server.purchases = [];
  server.forSale = true;
  mockSafe.bottom = 0;
  serve();
  mockPosted.length = 0;
  jest.spyOn(Dimensions, 'get').mockImplementation(() => ({ width: 400, height: 800, scale: 3, fontScale: 1 }) as never);
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
  authedFetch.mockReset();
});

describe('the way in', () => {
  it('offline: Decorate is muted, says it needs a connection, and sends nothing', async () => {
    server.online = false;
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    expect(editMuted()).toBe(true);
    await tap('myroom-edit');
    expect(posts('MYROOM_EDIT')).toHaveLength(0);
    expect(has('myroom-decorate-bar')).toBe(false);
    expect(texts()).toContain('꾸미기는 인터넷 연결이 필요해요');
    // The tap asked the server again: once it answers, the button is on.
    server.online = true;
    await tap('myroom-edit');
    await act(async () => {});
    expect(editMuted()).toBe(false);
  });

  it('waits for the room: before MYROOM_READY it is muted too', async () => {
    await render();
    expect(editMuted()).toBe(true);
    await tap('myroom-edit');
    expect(posts('MYROOM_EDIT')).toHaveLength(0);
  });

  it('on: MYROOM_EDIT, a seated player stands first, and walking goes', async () => {
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    fromUnity({ type: 'MYROOM_NEAR_ITEM', payload: { uid: 'a1', item: 'Armchair', action: 'sit', near: true, active: false } });
    fromUnity({ type: 'MYROOM_ACT_STATE', payload: { uid: 'a1', action: 'sit', active: true } });
    expect(has('world-joystick')).toBe(true);
    mockPosted.length = 0;
    await tap('myroom-edit');
    expect(mockPosted.map(p => p.type)).toEqual(['MYROOM_ACT_END', 'MYROOM_EDIT']);
    expect(posts('MYROOM_EDIT')[0].payload).toEqual({ on: true });
    expect(has('myroom-decorate-bar')).toBe(true);
    expect(has('myroom-decorate-tray')).toBe(true);
    expect(has('world-joystick')).toBe(false);
    expect(has('myroom-run')).toBe(false);
    expect(has('myroom-act')).toBe(false);
    expect(has('myroom-top')).toBe(false);
  });
});

describe('the messages', () => {
  it('Cancel: MYROOM_EDIT off + cancel, the kept copy dropped, the room’s controls back', async () => {
    await intoEditMode();
    expect(useMyRoomStore.getState().pendingEdit()?.layout).toEqual(ROOM);
    await tap('myroom-decorate-cancel');
    backToWalk();
    expect(posts('MYROOM_EDIT').map(p => p.payload)).toEqual([{ on: true }, { on: false, cancel: true }]);
    expect(useMyRoomStore.getState().pending).toBeNull();
    expect(has('myroom-decorate-bar')).toBe(false);
    expect(has('myroom-top')).toBe(true);
  });

  it('Done: PUT the reported layout at the cached version, then MYROOM_EDIT off, then MYROOM_LAYOUT with the server’s copy', async () => {
    const saved = { theme: 'basic', items: [piece('s1', 'Sofa')] };
    server.putReply = () => reply(200, {
      success: true, ...saved, version: 4, owned: OWNED, coin_balance: 100,
      dropped: [{ uid: 'a1', item: 'Armchair', reason: 'not_owned' }],
    });
    await intoEditMode();
    changed(EDITED);
    mockPosted.length = 0;
    await tap('myroom-decorate-done');
    backToWalk();
    expect(server.put).toEqual([{ ...EDITED, version: 3 }]);
    expect(mockPosted.map(p => p.type)).toEqual(['MYROOM_EDIT', 'MYROOM_LAYOUT']);
    expect(mockPosted[0].payload).toEqual({ on: false });
    expect(mockPosted[1].payload).toEqual({ layout: saved });
    expect(has('myroom-decorate-bar')).toBe(false);
    expect(useMyRoomStore.getState().pending).toBeNull();
    expect(useMyRoomStore.getState().current()).toMatchObject({ version: 4, layout: saved });
    // Something was dropped by the server: said so.
    expect(texts()).toContain('방을 저장했어요 — 가구 1개는 저장되지 않았어요');
  });

  it('a tap selects (MYROOM_TAP), one finger drags the piece (MYROOM_DRAG from where it went down), two fingers stay the camera', async () => {
    jest.useFakeTimers();
    type Cfg = Required<Parameters<typeof PanResponder.create>[0]>;
    const configs: Cfg[] = [];
    const real = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(c => { configs.push(c as Cfg); return real(c); });
    const ev = (touches: { pageX: number; pageY: number }[]) => ({ nativeEvent: { touches, pageX: touches[0]?.pageX ?? 0, pageY: touches[0]?.pageY ?? 0 } }) as never;
    const one = (x: number, y: number) => ev([{ pageX: x, pageY: y }]);
    const g = (dx: number, dy: number) => ({ dx, dy }) as never;
    await intoEditMode();
    const look = configs.filter(c => c.onPanResponderTerminationRequest?.(one(0, 0), g(0, 0)) === true).pop()!;
    mockPosted.length = 0;

    act(() => look.onPanResponderGrant(one(200, 400), g(0, 0)));
    act(() => look.onPanResponderRelease(one(200, 400), g(0, 0)));
    // A second quick tap is another selection, not "camera home".
    act(() => look.onPanResponderGrant(one(100, 200), g(0, 0)));
    act(() => look.onPanResponderRelease(one(100, 200), g(0, 0)));
    expect(posts('MYROOM_TAP').map(p => p.payload)).toEqual([{ x: 0.5, y: 0.5 }, { x: 0.25, y: 0.25 }]);
    expect(posts('MYROOM_CAMERA')).toHaveLength(0);

    act(() => look.onPanResponderGrant(one(200, 400), g(0, 0)));
    act(() => look.onPanResponderMove(one(220, 400), g(20, 0)));
    act(() => look.onPanResponderMove(one(240, 400), g(40, 0)));
    act(() => look.onPanResponderRelease(one(240, 400), g(40, 0)));
    act(() => { jest.advanceTimersByTime(50); });
    const drag = posts('MYROOM_DRAG').map(p => p.payload as { phase: string; x: number; y: number });
    expect(drag[0]).toEqual({ phase: 'begin', x: 0.5, y: 0.5 });
    expect(drag[drag.length - 1]).toEqual({ phase: 'end', x: 0.6, y: 0.5 });
    expect(posts('MYROOM_CAMERA')).toHaveLength(0);
    expect(posts('MYROOM_TAP')).toHaveLength(2);
  });

  it('the selected piece: ↺ ↻ only when it can move, swap, and store; nothing selected = no controls', async () => {
    await intoEditMode();
    expect(has('myroom-decorate-selection')).toBe(false);
    select('l1', 'TableLamp', 'surface', false);
    expect(has('myroom-decorate-selection')).toBe(true);
    expect(has('myroom-decorate-rotate-left')).toBe(false);
    select('s1', 'Sofa', 'floor', true);
    mockPosted.length = 0;
    await tap('myroom-decorate-rotate-left');
    await tap('myroom-decorate-rotate-right');
    await tap('myroom-decorate-store');
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([
      ['MYROOM_ROTATE', { step: -1 }], ['MYROOM_ROTATE', { step: 1 }], ['MYROOM_REMOVE', {}],
    ]);
    select('', '', 'floor', false);
    expect(has('myroom-decorate-selection')).toBe(false);
  });
});

describe('Done and its answers', () => {
  it('is off until Unity reports, and while the layout is invalid — with the reason in words', async () => {
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    await tap('myroom-edit');
    expect(node('myroom-decorate-done').props.disabled).toBe(true);
    changed(ROOM, false, 'blocked_path', 's1');
    expect(node('myroom-decorate-done').props.disabled).toBe(true);
    expect(texts()).toContain('길을 막고 있어요 — 빈 곳으로 옮겨 주세요');
    await tap('myroom-decorate-done');
    backToWalk();
    expect(server.put).toHaveLength(0);
    changed(ROOM, false, 'overlap', 's1');
    expect(texts()).toContain('다른 가구와 겹쳐요 — 빈 곳으로 옮겨 주세요');
    changed(ROOM, true);
    expect(node('myroom-decorate-done').props.disabled).toBe(false);
  });

  it('an ADD with no place (no_space) or no prefab (unknown_item) is a note over the room', async () => {
    await intoEditMode();
    changed(ROOM, true, 'no_space');
    expect(texts()).toContain('놓을 자리가 없어요');
    changed(ROOM, true, 'unknown_item');
    expect(texts()).toContain('이 버전에서는 놓을 수 없는 가구예요');
  });

  it('409: says the room changed elsewhere, shows THEIR room in edit mode, nothing merged; the next Done uses their version', async () => {
    const theirs = { theme: 'basic', items: [piece('b1', 'Bed')] };
    server.putReply = () => reply(409, { success: false, error_code: 'VERSION_CONFLICT', ...theirs, version: 9, owned: OWNED });
    await intoEditMode();
    changed(EDITED);
    mockPosted.length = 0;
    await tap('myroom-decorate-done');
    backToWalk();
    expect(texts()).toContain('다른 기기에서 방이 바뀌었어요. 최신 방을 불러왔어요');
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([['MYROOM_LAYOUT', { layout: theirs }]]);
    expect(has('myroom-decorate-bar')).toBe(true);
    // Unity reports their room as the working copy; Done saves it against version 9.
    changed(theirs);
    server.putReply = () => reply(200, { success: true, ...theirs, version: 10, owned: OWNED, dropped: [] });
    await tap('myroom-decorate-done');
    backToWalk();
    expect(server.put[1]).toEqual({ ...theirs, version: 9 });
  });

  it('422, offline and 401 keep edit mode and the edit, and say so', async () => {
    await intoEditMode();
    changed(EDITED);
    server.putReply = () => reply(422, { success: false, error_code: 'LAYOUT_INVALID', reasons: ['items[0].pos'] });
    await tap('myroom-decorate-done');
    backToWalk();
    expect(texts()).toContain('이 배치는 저장할 수 없어요');
    server.putReply = () => undefined;
    await tap('myroom-decorate-done');
    backToWalk();
    expect(texts()).toContain('저장하지 못했어요 — 연결을 확인해 주세요. 꾸민 내용은 그대로예요');
    server.putReply = () => ({ ok: false, status: 401, json: async () => { throw new Error('denied'); } });
    await tap('myroom-decorate-done');
    backToWalk();
    expect(texts()).toContain('저장하지 못했어요 — 연결을 확인해 주세요. 꾸민 내용은 그대로예요');
    expect(server.put).toHaveLength(3);
    expect(has('myroom-decorate-bar')).toBe(true);
    expect(posts('MYROOM_EDIT')).toHaveLength(1);
    expect(useMyRoomStore.getState().pendingEdit()?.layout).toEqual(EDITED);
  });
});

describe('the tray and swaps', () => {
  it('Owned: owned copies minus placed copies; a tap adds one', async () => {
    await intoEditMode();
    // Sofa, Armchair and TableLamp are placed (one each, one owned each); Pouf 2 and the rest are left.
    expect(has('myroom-owned-Sofa')).toBe(false);
    expect(has('myroom-owned-TableLamp')).toBe(false);
    expect(node('myroom-owned-Pouf')).toBeDefined();
    expect(tree!.root.findAll(n => n.props.testID === 'myroom-owned-count-Pouf')[0].props.children).toBe('×2');
    changed({ theme: 'basic', items: [...ROOM.items!, piece('p1', 'Pouf')] });
    expect(tree!.root.findAll(n => n.props.testID === 'myroom-owned-count-Pouf')[0].props.children).toBe('×1');
    mockPosted.length = 0;
    await tap('myroom-owned-Bed');
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([['MYROOM_ADD', { item: 'Bed' }]]);
  });

  it('Swap offers owned pieces of the same kind AND category with a copy left, never the piece itself', async () => {
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    await tap('myroom-decorate-swap');
    // Seats: the pouf (2 owned, none placed). Not the armchair (its one copy is placed), not the bed.
    expect(has('myroom-decorate-swap-Pouf')).toBe(true);
    expect(has('myroom-decorate-swap-Armchair')).toBe(false);
    expect(has('myroom-decorate-swap-Bed')).toBe(false);
    expect(has('myroom-decorate-swap-Sofa')).toBe(false);
    mockPosted.length = 0;
    await tap('myroom-decorate-swap-Pouf');
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([['MYROOM_SWAP', { item: 'Pouf' }]]);

    select('l1', 'TableLamp', 'surface', false);
    await tap('myroom-decorate-swap');
    expect(has('myroom-decorate-swap-GlobeLamp')).toBe(true);
    expect(has('myroom-decorate-swap-Pouf')).toBe(false);
  });

  it('swapCandidates / copiesLeft, without the screen', () => {
    const cat = CATALOG.items as CatalogItem[];
    const sel = { uid: 's1', item: 'Sofa', kind: 'floor' as const, canMove: true };
    expect(copiesLeft(OWNED, ROOM)).toEqual({ Pouf: 2, GlobeLamp: 1, Bed: 1 });
    expect(copiesLeft(OWNED, { theme: 'basic', items: null })).toEqual(OWNED.items);
    expect(swapCandidates(sel, OWNED, ROOM, cat)).toEqual(['Pouf']);
    // Same category, different kind: not offered (it would not fit the same place).
    const wallSeat = [...cat, { id: 'WallSeat', kind: 'wall', category: 'seat', size: 'small', price: 50, starter: 0, owned: 1, buyable: true }];
    expect(swapCandidates(sel, { ...OWNED, items: { ...OWNED.items, WallSeat: 1 } }, ROOM, wallSeat)).toEqual(['Pouf']);
    // A piece the catalog does not list has no category: nothing offered for it, and it is never offered.
    expect(swapCandidates({ ...sel, item: 'DiaryBook' }, OWNED, ROOM, cat)).toEqual([]);
    expect(swapCandidates(sel, OWNED, ROOM, cat, id => id !== 'Pouf')).toEqual([]);
    expect(swapCandidates(null, OWNED, ROOM, cat)).toEqual([]);
    expect(swapCandidates(sel, OWNED, ROOM, null)).toEqual([]);
  });
});

describe('the kept edit', () => {
  it('a remount mid-edit (the app backgrounded and rebuilt) goes back into edit mode on the kept copy', async () => {
    const mine = { theme: 'basic', items: [piece('p1', 'Pouf')] };
    useMyRoomStore.getState().setPending({ layout: mine, valid: true, reason: '', uid: '' });
    await render();
    expect(posts('MYROOM_EDIT')).toHaveLength(0);
    fromUnity({ type: 'MYROOM_READY' });
    await act(async () => {});
    expect(posts('MYROOM_EDIT').map(p => p.payload)).toEqual([{ on: true }]);
    expect(posts('MYROOM_LAYOUT').pop()!.payload).toEqual({ layout: mine });
    expect(has('myroom-decorate-bar')).toBe(true);
  });
});

describe('MYROOM_DRAG on the bridge', () => {
  it('is a stream: begin and end always go out, in order; a burst of moves is coalesced to the latest', () => {
    jest.useFakeTimers();
    const posted: { type: string; payload?: { phase: string; x: number } }[] = [];
    const bridge = new NativeUnityBridge();
    bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
    bridge.sendMyRoomDrag('begin', 0.1, 0.5);
    for (let i = 1; i <= 10; i++) bridge.sendMyRoomDrag('move', 0.1 + i * 0.01, 0.5);
    bridge.sendMyRoomDrag('end', 0.2, 0.5);
    jest.advanceTimersByTime(100);
    const drag = posted.filter(p => p.type === 'MYROOM_DRAG').map(p => p.payload!);
    expect(drag[0]).toEqual({ phase: 'begin', x: 0.1, y: 0.5 });
    expect(drag[drag.length - 1]).toEqual({ phase: 'end', x: 0.2, y: 0.5 });
    expect(drag.filter(d => d.phase === 'move').length).toBeLessThan(10);
    // Clamped like a tap: a finger past the edge is the edge.
    bridge.sendMyRoomDrag('end', 1.4, -0.2);
    expect(posted.pop()!.payload).toEqual({ phase: 'end', x: 1, y: 0 });
  });
});

/* ---- the tray's size and what it covers (sim QA 14-10: a fixed 36 % tray hid the room) -------- */

describe('the tray’s size and VIEW_INSETS', () => {
  const trayStyle = () => StyleSheet.flatten(tree!.root.findAll(n => n.props.testID === 'myroom-decorate-tray' && typeof n.type === 'string')[0].props.style);
  const handle = () => tree!.root.findAll(n => n.props.testID === 'myroom-decorate-handle' && typeof n.props.onAccessibilityTap === 'function')[0];

  it('is sized by its content and capped: 30 % collapsed, 60 % expanded (handle tap or drag, or the Shop tab)', async () => {
    type Cfg = Required<Parameters<typeof PanResponder.create>[0]>;
    const configs: Cfg[] = [];
    const real = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(c => { configs.push(c as Cfg); return real(c); });
    expect(TRAY_SHARE).toEqual({ collapsed: 0.3, expanded: 0.6 });
    expect(trayCap(800, false)).toBe(240);
    expect(trayCap(800, true)).toBe(480);

    await intoEditMode();
    // No fixed height: a tray with one strip is one strip tall.
    expect(trayStyle().height).toBeUndefined();
    expect(trayStyle().maxHeight).toBe(240);
    // Collapsed, Owned is one horizontal strip.
    expect(tree!.root.findAll(n => n.props.testID === 'myroom-decor-owned' && n.props.horizontal === true).length).toBeGreaterThan(0);

    await act(async () => { handle().props.onAccessibilityTap(); });
    expect(trayStyle().maxHeight).toBe(480);
    expect(handle().props.accessibilityState).toEqual({ expanded: true });
    // A drag down on the handle closes it; up opens it.
    const handleCfg = configs.filter(c => !c.onPanResponderTerminationRequest && c.onPanResponderRelease).pop()!;
    await act(async () => { handleCfg.onPanResponderRelease({} as never, { dy: 40 } as never); });
    expect(trayStyle().maxHeight).toBe(240);
    await act(async () => { handleCfg.onPanResponderRelease({} as never, { dy: -40 } as never); });
    expect(trayStyle().maxHeight).toBe(480);
    await act(async () => { handleCfg.onPanResponderRelease({} as never, { dy: 40 } as never); });
    // The shop needs the room: its tab opens the tray.
    await tap('myroom-decor-tab-shop');
    expect(trayStyle().maxHeight).toBe(480);
  });

  it('VIEW_INSETS follow the measured bar and dock: on enter, on expand/collapse, on select — and the HUD’s again on exit', async () => {
    jest.useFakeTimers();
    const lay = (testID: string, y: number, height: number) => {
      const n = tree!.root.findAll(x => x.props.testID === testID && typeof x.type === 'string' && typeof x.props.onLayout === 'function')[0];
      if (!n) throw new Error(`no ${testID}`);
      act(() => n.props.onLayout({ nativeEvent: { layout: { x: 0, y, width: 400, height } } }));
    };
    const settle = () => act(() => { jest.advanceTimersByTime(INSETS_SETTLE_MS + 10); });
    const insets = () => {
      const p = posts('VIEW_INSETS').pop()!.payload as { top: number; bottom: number };
      return { top: p.top, bottom: p.bottom };
    };
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    const stage = tree!.root.findAll(n => typeof n.type === 'string' && typeof n.props.onLayout === 'function')[0];
    act(() => stage.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 800 } } }));
    lay('myroom-top', 0, 80);
    lay('myroom-bottom', 740, 60);
    settle();
    expect(insets()).toEqual({ top: 0.1, bottom: 0.08 });

    await tap('myroom-edit');
    changed(ROOM);
    lay('myroom-decorate-bar', 0, 96);
    lay('myroom-decorate-dock', 600, 200);
    settle();
    expect(insets()).toEqual({ top: 0.12, bottom: 0.25 });

    await act(async () => { tree!.root.findAll(n => n.props.testID === 'myroom-decorate-handle' && typeof n.props.onAccessibilityTap === 'function')[0].props.onAccessibilityTap(); });
    lay('myroom-decorate-dock', 320, 480);
    settle();
    expect(insets().bottom).toBe(0.6);
    await act(async () => { tree!.root.findAll(n => n.props.testID === 'myroom-decorate-handle' && typeof n.props.onAccessibilityTap === 'function')[0].props.onAccessibilityTap(); });
    lay('myroom-decorate-dock', 600, 200);
    settle();
    expect(insets().bottom).toBe(0.25);

    // A selection puts its bar over the tray: the dock grows, and the inset with it.
    select('s1', 'Sofa', 'floor', true);
    expect(has('myroom-decorate-selection')).toBe(true);
    lay('myroom-decorate-dock', 540, 260);
    settle();
    expect(insets().bottom).toBe(0.33);

    await tap('myroom-decorate-cancel');

    backToWalk();
    lay('myroom-top', 0, 80);
    lay('myroom-bottom', 740, 60);
    settle();
    expect(insets()).toEqual({ top: 0.1, bottom: 0.08 });
  });
});

/* ---- skins (spec 005 US3: a theme not owned can be previewed in edit mode, not saved) ------- */

describe('skins', () => {
  const skinCard = (id: string) => tree!.root.findAll(n => n.props.testID === `myroom-skin-${id}` && typeof n.props.onPress === 'function')[0];
  const doneOff = () => node('myroom-decorate-done').props.disabled === true;
  const status = () => tree!.root.findAll(n => n.props.testID === 'myroom-decorate-status' && typeof n.type === 'string')[0].props.children;
  const themed = (theme: string, reason = '') => changed({ ...ROOM, theme }, true, reason);
  async function onSkins() {
    await intoEditMode();
    await tap('myroom-decor-tab-skins');
  }

  it('lists the catalog’s skins and the owned ones, the worn one marked, Owned or a price on each', async () => {
    server.owned = { ...OWNED, themes: ['basic', 'nature'] };
    await onSkins();
    for (const id of ['basic', 'modern', 'fantasy', 'nature']) expect(skinCard(id)).toBeDefined();
    expect(skinCard('basic').props.accessibilityState).toEqual({ selected: true });
    expect(skinCard('modern').props.accessibilityState).toEqual({ selected: false });
    expect(skinCard('modern').props.accessibilityLabel).toBe('모던 · 500');
    expect(skinCard('nature').props.accessibilityLabel).toBe('자연 · 보유 중');
    // Without the screen: catalog order, then owned-only; a starter is owned; unknown ids dropped.
    const cat = CATALOG.themes;
    expect(skinList(cat, { items: {}, themes: ['nature'] })).toEqual([
      { id: 'basic', price: 0, owned: true }, { id: 'modern', price: 500, owned: false },
      { id: 'fantasy', price: 800, owned: false }, { id: 'nature', price: null, owned: true },
    ]);
    expect(skinList(cat, null, id => id !== 'fantasy').map(x => x.id)).toEqual(['basic', 'modern']);
    expect(swatchFor('basic')).toHaveLength(3);
    expect(swatchFor('modern')).toHaveLength(4);
    expect(swatchFor('nope')).toHaveLength(3);
  });

  it('a tap sends MYROOM_THEME; an unowned skin turns Done off and offers it for its price', async () => {
    await onSkins();
    mockPosted.length = 0;
    await act(async () => { skinCard('modern').props.onPress(); });
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([['MYROOM_THEME', { theme: 'modern' }]]);
    // Nothing changes until Unity says the room wears it.
    expect(doneOff()).toBe(false);
    themed('modern');
    expect(skinCard('modern').props.accessibilityState).toEqual({ selected: true });
    expect(doneOff()).toBe(true);
    expect(status()).toBe('이 스킨을 계속 쓰려면 구매하세요 · 500코인');
    expect(has('myroom-skin-buy')).toBe(true);
    // Back to an owned skin: the offer goes, Done comes back.
    await act(async () => { skinCard('basic').props.onPress(); });
    themed('basic');
    expect(doneOff()).toBe(false);
    expect(has('myroom-skin-buy')).toBe(false);
  });

  it('Buy spends through the purchase path (sku theme:<id>, a UUID key); then Done saves the skin in the PUT', async () => {
    server.purchaseReply = body => reply(200, {
      success: true, sku: body.sku, charged: 500, coin_balance: 500, owned: { ...OWNED, themes: ['basic', 'modern'] },
    });
    server.putReply = () => reply(200, { success: true, ...ROOM, theme: 'modern', version: 4, owned: OWNED, dropped: [] });
    await onSkins();
    await act(async () => { skinCard('modern').props.onPress(); });
    themed('modern');
    await tap('myroom-skin-buy');
    expect(server.purchases).toHaveLength(1);
    expect(server.purchases[0].sku).toBe('theme:modern');
    expect(server.purchases[0].idem_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(doneOff()).toBe(false);
    expect(has('myroom-skin-buy')).toBe(false);
    expect(texts()).toContain('스킨을 구매했어요');
    await tap('myroom-decorate-done');
    backToWalk();
    expect(server.put).toEqual([{ ...ROOM, theme: 'modern', version: 3 }]);
  });

  it('short of coins: Buy opens the coin shop and spends nothing; Done stays off', async () => {
    await onSkins();
    useCoins.setState({ balance: 100 });
    await act(async () => { skinCard('modern').props.onPress(); });
    themed('modern');
    await tap('myroom-skin-buy');
    expect(server.purchases).toHaveLength(0);
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(doneOff()).toBe(true);
  });

  it('unknown_theme: a note, and the room keeps the skin it wore', async () => {
    await onSkins();
    await act(async () => { skinCard('fantasy').props.onPress(); });
    themed('basic', 'unknown_theme');
    expect(texts()).toContain('이 버전에는 아직 없는 스킨이에요');
    expect(skinCard('basic').props.accessibilityState).toEqual({ selected: true });
    expect(doneOff()).toBe(false);
  });

  it('Cancel ends the preview: back in, the bar is plain and Done waits only for Unity', async () => {
    await onSkins();
    await act(async () => { skinCard('modern').props.onPress(); });
    themed('modern');
    expect(has('myroom-skin-buy')).toBe(true);
    // The skin changed the room: Cancel asks, and Discard leaves.
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons!.find(x => x.style === 'destructive')!.onPress!());
    await tap('myroom-decorate-cancel');
    backToWalk();
    expect(posts('MYROOM_EDIT').pop()!.payload).toEqual({ on: false, cancel: true });
    expect(useMyRoomStore.getState().pending).toBeNull();
    await tap('myroom-edit');
    changed(ROOM);
    expect(has('myroom-skin-buy')).toBe(false);
    expect(status()).toBe('가구를 눌러 고르세요');
    expect(doneOff()).toBe(false);
  });

  it('the expanded dock — selection bar and home-indicator padding included — stays within 60 % (sim run3: 0.70)', async () => {
    mockSafe.bottom = 34;
    // The arithmetic: what the panel may take is the cap minus the selection bar; padding is inside.
    expect(trayMaxHeight(874, true, 60) + 60).toBeLessThanOrEqual(Math.round(874 * 0.6));
    expect(trayMaxHeight(874, false, 0)).toBe(Math.round(874 * 0.3));
    // A short phone with a tall selection: the tray keeps a usable floor.
    expect(trayMaxHeight(400, false, 200)).toBe(120);

    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    const wrap = tree!.root.findAll(n => n.props.testID === 'myroom-decorate-selection-wrap' && typeof n.type === 'string')[0];
    act(() => wrap.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 400, height: 60 } } }));
    await act(async () => { tree!.root.findAll(n => n.props.testID === 'myroom-decorate-handle' && typeof n.props.onAccessibilityTap === 'function')[0].props.onAccessibilityTap(); });
    const tray = StyleSheet.flatten(tree!.root.findAll(n => n.props.testID === 'myroom-decorate-tray' && typeof n.type === 'string')[0].props.style);
    expect(tray.paddingBottom).toBe(34);
    expect(tray.maxHeight).toBe(480 - 60);
    // Dock = selection 60 + panel ≤ 420 (padding inside) = 480 of an 800 pt window.
    expect((60 + (tray.maxHeight as number)) / 800).toBeLessThanOrEqual(0.6);
  });
});

/* ---- easy to understand (14-10: "làm sao cho UX dễ hiểu đi") ------------------------------------ */

describe('easy to understand', () => {
  const { sfx } = jest.requireMock('../src/shared/audio/sfx') as { sfx: Record<string, jest.Mock> };
  const status = () => tree!.root.findAll(n => n.props.testID === 'myroom-decorate-status' && typeof n.type === 'string')[0].props.children;
  const undoOff = () => node('myroom-decorate-undo').props.disabled === true;
  const rotated = (rot: number): MyRoomLayout => ({ ...ROOM, items: ROOM.items!.map(i => (i.uid === 's1' ? { ...i, rot } : i)) });

  it('the top line says what to do now: pick, drag/turn, fixed, why not (move it), or buy the skin', async () => {
    await intoEditMode();
    expect(status()).toBe('가구를 눌러 고르세요');
    select('s1', 'Sofa', 'floor', true);
    expect(status()).toBe('끌어서 옮기기 · 버튼으로 돌리기');
    select('l1', 'TableLamp', 'surface', false);
    expect(status()).toBe('고정된 가구예요 — 바꾸거나 보관할 수 있어요');
    changed(ROOM, false, 'overlap', 'l1');
    expect(status()).toBe('다른 가구와 겹쳐요 — 빈 곳으로 옮겨 주세요');
    changed({ ...ROOM, theme: 'modern' }, true);
    expect(status()).toBe('이 스킨을 계속 쓰려면 구매하세요 · 500코인');
    // Two lines at most, and smaller rather than clipped.
    const line = tree!.root.findAll(n => n.props.testID === 'myroom-decorate-status' && typeof n.type === 'string')[0].props;
    expect(line.numberOfLines).toBe(2);
    expect(line.adjustsFontSizeToFit).toBe(true);
  });

  it('labelled actions: turn buttons only for a movable piece, a Fixed chip for a slotted one', async () => {
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    expect(has('myroom-decorate-rotate-left')).toBe(true);
    expect(has('myroom-decorate-fixed')).toBe(false);
    for (const label of ['왼쪽 회전', '오른쪽 회전', '바꾸기', '보관함에 넣기']) expect(texts()).toContain(label);
    select('l1', 'TableLamp', 'surface', false);
    expect(has('myroom-decorate-rotate-left')).toBe(false);
    expect(has('myroom-decorate-rotate-right')).toBe(false);
    expect(has('myroom-decorate-fixed')).toBe(true);
    expect(texts()).toContain('고정');
  });

  it('Undo: only the player’s own edits push; a drag is one step; it pops back through MYROOM_LAYOUT and is off when empty', async () => {
    jest.useFakeTimers();
    type Cfg = Required<Parameters<typeof PanResponder.create>[0]>;
    const configs: Cfg[] = [];
    const real = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(c => { configs.push(c as Cfg); return real(c); });
    const ev = (x: number, y: number) => ({ nativeEvent: { touches: [{ pageX: x, pageY: y }], pageX: x, pageY: y } }) as never;
    const g = (dx: number, dy: number) => ({ dx, dy }) as never;
    await intoEditMode();
    expect(undoOff()).toBe(true);
    // A report the player did not cause (a reload) is not an undo step.
    changed(ROOM);
    expect(undoOff()).toBe(true);

    select('s1', 'Sofa', 'floor', true);
    sfx.select.mockClear();
    await tap('myroom-decorate-rotate-right');
    changed(rotated(15));
    expect(undoOff()).toBe(false);

    // A drag: begin, many moves, end — Unity reports once, on lift: one step.
    const look = configs.filter(c => c.onPanResponderTerminationRequest?.(ev(0, 0), g(0, 0)) === true).pop()!;
    act(() => look.onPanResponderGrant(ev(200, 400), g(0, 0)));
    for (let i = 1; i <= 8; i++) act(() => look.onPanResponderMove(ev(200 + i * 10, 400), g(i * 10, 0)));
    act(() => look.onPanResponderRelease(ev(280, 400), g(80, 0)));
    const dragged: MyRoomLayout = { ...rotated(15), items: rotated(15).items!.map(i => (i.uid === 's1' ? { ...i, pos: { x: 1, z: 0 } } : i)) };
    changed(dragged);

    mockPosted.length = 0;
    await tap('myroom-decorate-undo');
    expect(sfx.select).toHaveBeenCalled();
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([['MYROOM_LAYOUT', { layout: rotated(15) }]]);
    changed(rotated(15)); // Unity's echo: not a new step
    await tap('myroom-decorate-undo');
    expect(mockPosted.map(p => p.payload)).toEqual([{ layout: rotated(15) }, { layout: ROOM }]);
    changed(ROOM);
    expect(undoOff()).toBe(true);
    // An edit that came back unchanged (a refused add) is nothing to undo.
    await tap('myroom-owned-Bed');
    changed(ROOM, true, 'no_space');
    expect(undoOff()).toBe(true);
  });

  it('Undo keeps the last 20 steps, and is cleared by Cancel and by Done', async () => {
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    for (let i = 1; i <= 22; i++) {
      await tap('myroom-decorate-rotate-right');
      changed(rotated(i * 15));
    }
    mockPosted.length = 0;
    for (let i = 0; i < 25; i++) {
      if (undoOff()) break;
      await tap('myroom-decorate-undo');
    }
    expect(posts('MYROOM_LAYOUT')).toHaveLength(20);
    expect(posts('MYROOM_LAYOUT').pop()!.payload).toEqual({ layout: rotated(30) });

    // Cancel clears it (the room is changed, so it asks first).
    jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons!.find(x => x.style === 'destructive')!.onPress!());
    await tap('myroom-decorate-cancel');
    backToWalk();
    await tap('myroom-edit');
    changed(ROOM);
    expect(undoOff()).toBe(true);

    // So does Done.
    select('s1', 'Sofa', 'floor', true);
    await tap('myroom-decorate-rotate-right');
    changed(rotated(15));
    server.putReply = () => reply(200, { success: true, ...rotated(15), version: 4, owned: OWNED, dropped: [] });
    await tap('myroom-decorate-done');
    backToWalk();
    await tap('myroom-edit');
    changed(rotated(15));
    expect(undoOff()).toBe(true);
  });

  it('Cancel asks only when the room changed (a full turn is no change); Keep editing stays', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await intoEditMode();
    // 360° is where it started.
    changed(rotated(360));
    await tap('myroom-decorate-cancel');
    backToWalk();
    expect(alert).not.toHaveBeenCalled();
    expect(posts('MYROOM_EDIT').pop()!.payload).toEqual({ on: false, cancel: true });

    await tap('myroom-edit');
    changed(ROOM);
    changed(rotated(15));
    mockPosted.length = 0;
    await tap('myroom-decorate-cancel');
    backToWalk();
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe('변경 사항을 버릴까요?');
    expect(buttons!.map(b => b.text)).toEqual(['계속 꾸미기', '버리기']);
    // Keep editing: nothing sent, still decorating.
    expect(posts('MYROOM_EDIT')).toHaveLength(0);
    expect(has('myroom-decorate-bar')).toBe(true);
    act(() => buttons![1].onPress!());
    expect(posts('MYROOM_EDIT').map(p => p.payload)).toEqual([{ on: false, cancel: true }]);
    expect(has('myroom-decorate-bar')).toBe(false);
  });

  it('Done with nothing changed leaves without a PUT', async () => {
    await intoEditMode();
    mockPosted.length = 0;
    await tap('myroom-decorate-done');
    backToWalk();
    expect(server.put).toHaveLength(0);
    expect(mockPosted.map(p => [p.type, p.payload])).toEqual([['MYROOM_EDIT', { on: false }]]);
    expect(has('myroom-decorate-bar')).toBe(false);
  });

  it('the tabs carry counts, and a summary line says what is in the room and in storage', async () => {
    await intoEditMode();
    // Owned Sofa 1, Armchair 1, Pouf 2, TableLamp 1, GlobeLamp 1, Bed 1; placed Sofa, Armchair, TableLamp.
    expect(texts()).toContain('보관함 (4)');
    expect(texts()).toContain('스킨 (3)');
    expect(texts()).toContain('상점');
    expect(texts()).toContain('방 안: 3개 · 보관함: 4개');
    expect(texts()).toContain('방에 놓기');
  });

  it('a placed piece gets a note saying it can be dragged', async () => {
    await intoEditMode();
    await tap('myroom-owned-Bed');
    expect(posts('MYROOM_ADD').map(p => p.payload)).toEqual([{ item: 'Bed' }]);
    changed({ ...ROOM, items: [...ROOM.items!, piece('b1', 'Bed')] });
    expect(texts()).toContain('침대을(를) 놓았어요 — 끌어서 위치를 맞춰요');
  });

  it('empty storage explains how to fill it, and links to the Shop', async () => {
    server.owned = { items: { Sofa: 1, Armchair: 1, TableLamp: 1 }, themes: ['basic'] };
    await intoEditMode();
    expect(has('myroom-decor-owned-empty')).toBe(true);
    expect(texts()).toContain('보관함 (0)');
    expect(texts()).toContain('보관함이 비었어요. 방에서 가구를 고른 뒤 “보관함에 넣기”를 누르거나, 상점에서 더 사 보세요.');
    await tap('myroom-decor-to-shop');
    expect(has('myroom-decor-shop')).toBe(true);
  });

  it('the coach: three cards on an account’s first visit only, a tap anywhere moves on, and "?" replays it', async () => {
    useMyRoomStore.setState({ coachSeen: {} });
    const card = () => tree!.root.findAll(n => n.props.testID === 'myroom-coach-text' && typeof n.type === 'string')[0]?.props.children;
    await intoEditMode();
    expect(card()).toBe('가구를 눌러서 고르세요');
    await tap('myroom-coach-next');
    expect(card()).toBe('끌어서 옮기고, 버튼으로 돌려요');
    await tap('myroom-coach'); // anywhere on the dim
    expect(card()).toBe('두 손가락으로 시점을 돌리고 확대해요 · 실수하면 되돌리기');
    expect(texts()).toContain('알겠어요');
    await tap('myroom-coach-next');
    expect(has('myroom-coach')).toBe(false);
    expect(useMyRoomStore.getState().coachSeen['-']).toBe(true);

    // Second visit: no coach. "?" brings it back.
    await tap('myroom-decorate-cancel');
    backToWalk();
    await tap('myroom-edit');
    expect(has('myroom-coach')).toBe(false);
    await tap('myroom-decorate-help');
    expect(card()).toBe('가구를 눌러서 고르세요');
  });

  it('selecting a piece sounds the light select', async () => {
    await intoEditMode();
    sfx.select.mockClear();
    select('s1', 'Sofa', 'floor', true);
    expect(sfx.select).toHaveBeenCalledTimes(1);
    select('', '', 'floor', false);
    expect(sfx.select).toHaveBeenCalledTimes(1);
  });
});

/* ---- previews (14-10: "ở đây không có preview hả?") ------------------------------------------ */

describe('previews', () => {
  const { ITEM_THUMB, SKIN_THUMB, placeholderIcon } = jest.requireActual('../src/features/myroom/thumbs') as typeof import('../src/features/myroom/thumbs');
  const { Image } = jest.requireActual('react-native') as typeof import('react-native');
  const { Icon } = jest.requireActual('../src/shared/components/Icon') as typeof import('../src/shared/components/Icon');
  const byId = (id: string) => tree!.root.findAll(n => n.props.testID === id);
  const imageOf = (id: string) => tree!.root.findAll(n => n.type === Image && n.props.testID === id)[0];
  // Every piece the server sells or starts an account with (Prayers::MyRoomCatalog, 14-10).
  const SERVER_IDS = ['Armchair', 'Bed', 'Bookshelf', 'CoffeeTable', 'Curtains', 'Desk', 'DeskChair', 'DiaryBook',
    'FramedArt_Botanical', 'FramedArt_Moon', 'FramedArt_Sun', 'GlobeLamp', 'HangingIvy', 'Nightstand', 'Plant_Floor',
    'Plant_Pot', 'Pouf', 'RoundRug', 'SideTable', 'Sofa', 'TableLamp', 'TeaSet'];

  it('every catalog piece has a picture — and the one without (DeskChair) gets its category’s placeholder', async () => {
    for (const id of CATALOG.items.map(i => i.id)) expect([id, !!ITEM_THUMB[id]]).toEqual([id, true]);
    expect(SERVER_IDS.filter(id => !ITEM_THUMB[id])).toEqual(['DeskChair']);
    expect(placeholderIcon('seat')).toBe('armchair');
    expect(placeholderIcon('nope')).toBe('box');
    expect(Object.keys(SKIN_THUMB).sort()).toEqual(['basic', 'fantasy', 'modern']);

    // On screen: a placeholder tile, not an empty space, for a piece with no render.
    server.owned = { ...OWNED, items: { ...OWNED.items, DeskChair: 1 } };
    const withChair = { ...CATALOG, items: [...CATALOG.items, { id: 'DeskChair', kind: 'floor', category: 'seat', size: 'small', price: 50, starter: 0, owned: 1 }] };
    authedFetch.mockImplementation(async (url: string, init?: { method?: string }) => {
      if (url.endsWith('/myroom/catalog')) return reply(200, withChair);
      if (url.endsWith('/myroom') && !init?.method) return reply(200, { success: true, ...ROOM, version: 3, owned: server.owned, coin_balance: 1000 });
      return undefined;
    });
    await intoEditMode();
    expect(byId('myroom-owned-thumb-Sofa-image')).toHaveLength(0); // placed, so not in storage
    expect(imageOf('myroom-owned-thumb-Pouf-image').props.source).toEqual(ITEM_THUMB.Pouf);
    const ph = tree!.root.findAll(n => n.type === Icon && n.props.testID === 'myroom-owned-thumb-DeskChair-placeholder');
    expect(ph[0].props.name).toBe('armchair');
  });

  it('a shop row leads with the piece’s picture; a tap on the row (not the price) opens the preview, whose Buy is the purchase path', async () => {
    server.purchaseReply = body => reply(200, { success: true, sku: body.sku, charged: 50, coin_balance: 950, owned: { ...OWNED, items: { ...OWNED.items, Pouf: 3 } } });
    await intoEditMode();
    await tap('myroom-decor-tab-shop');
    expect(imageOf('myroom-shop-thumb-Sofa-image').props.source).toEqual(ITEM_THUMB.Sofa);
    expect(imageOf('myroom-shop-thumb-Pouf-image').props.style).toMatchObject({ width: 52, height: 52 });

    await tap('myroom-shop-open-item:Pouf');
    expect(byId('myroom-preview-item:Pouf').length).toBeGreaterThan(0);
    expect(imageOf('myroom-preview-thumb-image').props.source).toEqual(ITEM_THUMB.Pouf);
    expect(texts()).toContain('소형 · 의자');
    expect(texts()).toContain('2개 보유');
    expect(server.purchases).toHaveLength(0);

    await tap('myroom-preview-buy');
    expect(server.purchases).toHaveLength(1);
    expect(server.purchases[0].sku).toBe('item:Pouf');
    expect(server.purchases[0].idem_key).toMatch(/^[0-9a-f-]{36}$/);
    expect(texts()).toContain('3개 보유');
    expect(useMyRoomStore.getState().current()?.owned.items.Pouf).toBe(3);

    // Short of coins: the coin shop, the preview gone, nothing spent.
    useCoins.setState({ balance: 10 });
    await tap('myroom-preview-buy');
    expect(server.purchases).toHaveLength(1);
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(byId('myroom-preview-item:Pouf')).toHaveLength(0);
  });

  it('skins show the room in that skin, or the swatch when there is no render; the In use ring stays', async () => {
    // Nature has no render yet (an owned skin, off sale): the swatch case.
    server.owned = { ...OWNED, themes: ['basic', 'nature'] };
    await intoEditMode();
    await tap('myroom-decor-tab-skins');
    expect(imageOf('myroom-skin-thumb-basic-image').props.source).toEqual(SKIN_THUMB.basic);
    expect(imageOf('myroom-skin-thumb-modern-image').props.source).toEqual(SKIN_THUMB.modern);
    expect(imageOf('myroom-skin-thumb-fantasy-image').props.source).toEqual(SKIN_THUMB.fantasy);
    expect(byId('myroom-skin-thumb-nature-swatch').length).toBeGreaterThan(0);
    expect(byId('myroom-skin-thumb-nature-image')).toHaveLength(0);
    // 16:10
    const st = StyleSheet.flatten(imageOf('myroom-skin-thumb-basic-image').props.style);
    expect((st.width as number) / (st.height as number)).toBeCloseTo(1.6, 1);
    const basic = tree!.root.findAll(n => n.props.testID === 'myroom-skin-basic' && typeof n.props.onPress === 'function')[0];
    expect(basic.props.accessibilityState).toEqual({ selected: true });
  });

  it('the selected piece shows its picture by its name', async () => {
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    expect(imageOf('myroom-decorate-selection-thumb-image').props.source).toEqual(ITEM_THUMB.Sofa);
  });

  it('with pictures, the tray keeps its caps and three cards fit across an iPhone 17', async () => {
    await intoEditMode();
    const tray = () => StyleSheet.flatten(tree!.root.findAll(n => n.props.testID === 'myroom-decorate-tray' && typeof n.type === 'string')[0].props.style);
    expect(tray().maxHeight).toBe(trayCap(800, false));
    const card = tree!.root.findAll(n => n.props.testID === 'myroom-owned-Pouf' && typeof n.type === 'string')[0];
    const w = StyleSheet.flatten(card.props.style).width as number;
    // 402 pt, the strip's side padding (12 each) and two gaps (8): three whole cards and part of a fourth.
    expect(3 * w + 2 * 8 + 2 * 12).toBeLessThanOrEqual(402);
    await act(async () => { tree!.root.findAll(n => n.props.testID === 'myroom-decorate-handle' && typeof n.props.onAccessibilityTap === 'function')[0].props.onAccessibilityTap(); });
    expect(tray().maxHeight).toBe(trayCap(800, true));
  });
});

/* ---- sections (14-10: "Rèm cửa nên để trong mục decor không?") -------------------------------- */

describe('sections', () => {
  const { SECTION_ORDER, bySection, sectionOf } = jest.requireActual('../src/features/myroom/sections') as typeof import('../src/features/myroom/sections');
  // The server's pieces and categories (Prayers::MyRoomCatalog, 14-10).
  const SERVER: [string, string][] = [
    ['Bed', 'bed'], ['Sofa', 'seat'], ['Armchair', 'seat'], ['Pouf', 'seat'], ['DeskChair', 'seat'],
    ['CoffeeTable', 'table'], ['Nightstand', 'table'], ['SideTable', 'table'], ['Desk', 'table'], ['Bookshelf', 'shelf'],
    ['GlobeLamp', 'lamp'], ['TableLamp', 'lamp'],
    ['Curtains', 'curtain'], ['HangingIvy', 'plant'], ['Plant_Floor', 'plant'], ['Plant_Pot', 'plant'],
    ['FramedArt_Botanical', 'art'], ['FramedArt_Moon', 'art'], ['FramedArt_Sun', 'art'], ['RoundRug', 'rug'], ['TeaSet', 'decor'],
  ];
  const sectionOfPiece = (id: string) => sectionOf(SERVER.find(([p]) => p === id)![1]);

  it('curtains, the ivy and the art are Decor; the lamps are Lighting; beds, seats, tables and shelves are Furniture', () => {
    for (const id of ['Curtains', 'HangingIvy', 'FramedArt_Botanical', 'FramedArt_Moon', 'FramedArt_Sun', 'Plant_Floor', 'Plant_Pot', 'RoundRug', 'TeaSet'])
      expect([id, sectionOfPiece(id)]).toEqual([id, 'decor']);
    for (const id of ['GlobeLamp', 'TableLamp']) expect([id, sectionOfPiece(id)]).toEqual([id, 'lighting']);
    for (const id of ['Bed', 'Sofa', 'Armchair', 'Pouf', 'DeskChair', 'CoffeeTable', 'Nightstand', 'SideTable', 'Desk', 'Bookshelf'])
      expect([id, sectionOfPiece(id)]).toEqual([id, 'furniture']);
  });

  it('an unknown or missing category is Decor', () => {
    expect(sectionOf('spaceship')).toBe('decor');
    expect(sectionOf(undefined)).toBe('decor');
    expect(sectionOf(null)).toBe('decor');
  });

  it('sections come Furniture, Lighting, Decor — whatever order the list arrives in — each keeping its own order', () => {
    expect(SECTION_ORDER).toEqual(['furniture', 'lighting', 'decor']);
    const mixed: [string, string][] = [['Curtains', 'curtain'], ['TableLamp', 'lamp'], ['Bed', 'bed'], ['TeaSet', 'decor'], ['Sofa', 'seat']];
    expect(bySection(mixed, ([, c]) => c).map(g => [g.section, g.items.map(([id]) => id)])).toEqual([
      ['furniture', ['Bed', 'Sofa']],
      ['lighting', ['TableLamp']],
      ['decor', ['Curtains', 'TeaSet']],
    ]);
    expect(bySection([['Lamp', 'lamp']] as [string, string][], ([, c]) => c).map(g => g.section)).toEqual(['lighting']);
  });

  it('the Shop and the Storage strip both show the sections, under their words', async () => {
    await intoEditMode();
    const sectionIds = (prefix: string) => tree!.root.findAll(n => typeof n.type === 'string' && typeof n.props.testID === 'string' && n.props.testID.startsWith(prefix)).map(n => n.props.testID);
    // Storage (collapsed strip): Pouf, Bed | GlobeLamp.
    expect(sectionIds('myroom-owned-section-')).toEqual(['myroom-owned-section-furniture', 'myroom-owned-section-lighting']);
    const lighting = tree!.root.findAll(n => n.props.testID === 'myroom-owned-section-lighting' && typeof n.type === 'string')[0];
    expect(lighting.findAll(n => n.props.testID === 'myroom-owned-GlobeLamp' && typeof n.type === 'string')).toHaveLength(1);
    expect(texts()).toContain('가구');
    expect(texts()).toContain('조명');

    await tap('myroom-decor-tab-shop');
    expect(sectionIds('myroom-shop-section-')).toEqual(['myroom-shop-section-furniture', 'myroom-shop-section-lighting']);
    const shopLighting = tree!.root.findAll(n => n.props.testID === 'myroom-shop-section-lighting' && typeof n.type === 'string')[0];
    expect(shopLighting.findAll(n => typeof n.type === 'string' && /^myroom-shop-item:/.test(n.props.testID ?? '')).map(n => n.props.testID))
      .toEqual(['myroom-shop-item:TableLamp', 'myroom-shop-item:GlobeLamp']);
  });
});

/* ---- sim QA run4 ------------------------------------------------------------------------------ */

describe('sim QA run4', () => {
  const sofaAt = (base: MyRoomLayout, patch: Partial<MyRoomItem>): MyRoomLayout =>
    ({ ...base, items: base.items!.map(i => (i.uid === 's1' ? { ...i, ...patch } : i)) });

  it('Undo after a drag puts the piece back where the drag began — mid-drag reports are not steps — and a second Undo reverts the turn', async () => {
    jest.useFakeTimers();
    type Cfg = Required<Parameters<typeof PanResponder.create>[0]>;
    const configs: Cfg[] = [];
    const real = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(c => { configs.push(c as Cfg); return real(c); });
    const ev = (x: number, y: number) => ({ nativeEvent: { touches: [{ pageX: x, pageY: y }], pageX: x, pageY: y } }) as never;
    const g = (dx: number, dy: number) => ({ dx, dy }) as never;
    const start = sofaAt(ROOM, { pos: { x: 1, z: 2.95 }, rot: 0 });
    const turned = sofaAt(start, { rot: 15 });
    const mid = sofaAt(turned, { pos: { x: 1, z: 2.75 } });
    const dropped = sofaAt(turned, { pos: { x: 1, z: 2.55 } });

    await render();
    fromUnity({ type: 'MYROOM_READY' });
    await tap('myroom-edit');
    changed(start);
    select('s1', 'Sofa', 'floor', true);
    await tap('myroom-decorate-rotate-right');
    changed(turned);

    // The drag, as the simulator showed it: Unity reports while the sofa moves (overlap and bounds
    // checks), and once more after the finger lifts — that last one equal to the last mid-drag frame.
    const look = configs.filter(c => c.onPanResponderTerminationRequest?.(ev(0, 0), g(0, 0)) === true).pop()!;
    act(() => look.onPanResponderGrant(ev(200, 400), g(0, 0)));
    act(() => look.onPanResponderMove(ev(200, 420), g(0, 20)));
    changed(mid, false, 'overlap', 's1');
    act(() => look.onPanResponderMove(ev(200, 440), g(0, 40)));
    changed(dropped);
    act(() => look.onPanResponderRelease(ev(200, 440), g(0, 40)));
    act(() => { jest.advanceTimersByTime(50); });
    changed(dropped);

    mockPosted.length = 0;
    await tap('myroom-decorate-undo');
    expect(posts('MYROOM_LAYOUT').map(p => p.payload)).toEqual([{ layout: turned }]);
    changed(turned); // Unity's echo
    await tap('myroom-decorate-undo');
    expect(posts('MYROOM_LAYOUT').map(p => p.payload)).toEqual([{ layout: turned }, { layout: start }]);
    changed(start);
    expect(node('myroom-decorate-undo').props.disabled).toBe(true);
  });

  it('a storage card reads as two things: the count, and the action on its own line', async () => {
    await intoEditMode();
    const card = tree!.root.findAll(n => n.props.testID === 'myroom-owned-Pouf' && typeof n.type === 'string')[0];
    const lines = card.findAll(n => typeof n.type === 'string' && typeof n.props.children === 'string').map(n => n.props.children);
    expect(lines).toEqual(['푸프', '×2', '방에 놓기']);
    const action = card.findAll(n => n.props.children === '방에 놓기' && typeof n.type === 'string')[0];
    const count = card.findAll(n => n.props.children === '×2' && typeof n.type === 'string')[0];
    expect(action.parent).not.toBe(count.parent);
  });

  it('the tab row fits at 402 pt: the tabs scroll, the coin pill keeps its own room', async () => {
    await intoEditMode();
    const tabs = tree!.root.findAll(n => typeof n.type === 'string' && n.props.horizontal === true
      && n.findAll(x => x.props.testID === 'myroom-decor-tab-owned').length > 0)[0];
    expect(tabs).toBeDefined();
    expect(StyleSheet.flatten(tabs.props.style)).toMatchObject({ flexShrink: 1 });
    // The pill is a sibling of the scroller, not inside it.
    expect(tabs.findAll(x => x.props.accessibilityLabel === '1,000' || x.props.accessibilityLabel === '1000')).toHaveLength(0);
  });
});

/* ---- drawn icons, no glyphs (14-10: "VẼ LẠI CÁC ICON NÀY LUÔN ĐI") --------------------------- */

describe('decorate mode draws its icons', () => {
  // Arrows, ticks, crosses, boxes, stars, hearts, and "?" / "+" standing alone as a button.
  const GLYPH = /[←→↑↓↺↻↰↱↶↷⟲⟳⤺⤻✕✖✗✓✔☐☑★☆♥♡⇄⇆›‹»«▶◀×]|^\s*[?+]\s*$/u;
  const COUNT = /^×\d+$/;
  const glyphTexts = () => tree!.root
    .findAll(n => typeof n.type === 'string' && typeof n.props.children === 'string')
    .map(n => n.props.children as string)
    .filter(s => !COUNT.test(s) && GLYPH.test(s));

  it('bar, selection, tray, shop, preview and coach render no glyph-icon text — only the ×N counts', async () => {
    useMyRoomStore.setState({ coachSeen: {} });
    await intoEditMode();
    expect(has('myroom-coach')).toBe(true);
    expect(glyphTexts()).toEqual([]);
    await tap('myroom-coach-next');
    await tap('myroom-coach-next');
    await tap('myroom-coach-next');
    select('s1', 'Sofa', 'floor', true);
    await tap('myroom-decorate-swap');
    changed(ROOM, false, 'overlap', 's1');
    expect(glyphTexts()).toEqual([]);
    for (const tab of ['owned', 'skins', 'shop']) {
      await tap(`myroom-decor-tab-${tab}`);
      expect([tab, glyphTexts()]).toEqual([tab, []]);
    }
    await tap('myroom-shop-open-item:Pouf');
    expect(has('myroom-preview-item:Pouf')).toBe(true);
    expect(glyphTexts()).toEqual([]);
  });

  it('the controls are drawn: help alone in a 36 pt round button, Undo and Done with icon and word, the four actions icon over label', async () => {
    const { Icon } = jest.requireActual('../src/shared/components/Icon') as typeof import('../src/shared/components/Icon');
    const iconIn = (testID: string) => {
      const host = tree!.root.findAll(n => n.props.testID === testID && typeof n.type === 'string')[0];
      return host.findAll(n => n.type === Icon).map(n => n.props.name);
    };
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    expect(iconIn('myroom-decorate-help')).toEqual(['help']);
    const help = tree!.root.findAll(n => n.props.testID === 'myroom-decorate-help' && typeof n.type === 'string')[0];
    expect(StyleSheet.flatten(help.props.style)).toMatchObject({ width: 36, height: 36, borderRadius: 18 });
    expect(help.props.accessibilityLabel).toBe('도움말');
    expect(iconIn('myroom-decorate-undo')).toEqual(['undo']);
    expect(iconIn('myroom-decorate-done')).toEqual(['check']);
    expect(iconIn('myroom-decorate-rotate-left')).toEqual(['rotateLeft']);
    expect(iconIn('myroom-decorate-rotate-right')).toEqual(['rotateRight']);
    expect(iconIn('myroom-decorate-swap')).toEqual(['swap']);
    expect(iconIn('myroom-decorate-store')).toEqual(['storeAway']);
  });
});


/* ---- stage 1: arrange what you have, skins are the shop (14-10) ------------------------------ */

describe('stage 1 flow', () => {
  const tabIds = () => [...new Set(tree!.root.findAll(n => /^myroom-decor-tab-/.test(n.props.testID ?? '') && typeof n.props.onPress === 'function').map(n => n.props.testID as string))];
  const back = () => {
    const e = { preventDefault: jest.fn(), data: { action: { type: 'GO_BACK' } } };
    act(() => mockNavListeners.beforeRemove?.forEach(fn => fn(e)));
    return e;
  };

  it('the Shop tab follows the server: hidden while furniture is not for sale, back when it is', async () => {
    server.forSale = false;
    await intoEditMode();
    expect(tabIds()).toEqual(['myroom-decor-tab-owned', 'myroom-decor-tab-skins']);
    // Skins still sell, and the wallet stays in sight there.
    await tap('myroom-decor-tab-skins');
    expect(has('myroom-skin-modern')).toBe(true);
    expect(tree!.root.findAll(n => n.props.accessibilityLabel === '1000' || n.props.accessibilityLabel === '1,000').length).toBeGreaterThan(0);
    await tap('myroom-decorate-cancel');
    backToWalk();
    act(() => tree!.unmount());
    tree = null;

    server.forSale = true;
    await intoEditMode();
    expect(tabIds()).toEqual(['myroom-decor-tab-owned', 'myroom-decor-tab-skins', 'myroom-decor-tab-shop']);
  });

  it('Storage never offers to buy while pieces are not sold: the empty state says how to fill it, no shop link', async () => {
    server.forSale = false;
    server.owned = { items: { Sofa: 1, Armchair: 1, TableLamp: 1 }, themes: ['basic'] };
    await intoEditMode();
    expect(has('myroom-decor-owned-empty')).toBe(true);
    expect(texts()).toContain('보관함이 비었어요. 방에서 가구를 고른 뒤 “보관함에 넣기”를 누르면 여기에 보관돼요.');
    expect(has('myroom-decor-to-shop')).toBe(false);
  });

  it('a stale Shop gets 403 NOT_FOR_SALE: a note, the catalog re-read, and the Shop tab goes', async () => {
    server.purchaseReply = () => {
      server.forSale = false; // the server flipped while this client had the old catalog
      return reply(403, { success: false, error_code: 'NOT_FOR_SALE' });
    };
    await intoEditMode();
    await tap('myroom-decor-tab-shop');
    await tap('myroom-buy-item:Pouf');
    await tap('myroom-buy-item:Pouf');
    await act(async () => {});
    expect(server.purchases).toHaveLength(1);
    expect(texts()).toContain('지금은 스킨만 판매해요. 목록을 새로 불러왔어요');
    expect(tabIds()).toEqual(['myroom-decor-tab-owned', 'myroom-decor-tab-skins']);
  });

  it('the entry button says Decorate in the player’s language, with an icon', async () => {
    const { Icon } = jest.requireActual('../src/shared/components/Icon') as typeof import('../src/shared/components/Icon');
    for (const [lang, word] of [['en', 'Decorate'], ['ko', '꾸미기'], ['vi', 'Trang trí phòng'], ['ja', '模様替え'], ['zh-CN', '装饰房间'], ['zh-TW', '裝飾房間']] as const) {
      useLanguageStore.setState({ lang });
      await render();
      const pill = tree!.root.findAll(n => n.props.testID === 'myroom-edit' && typeof n.type === 'string')[0];
      expect([lang, pill.props.accessibilityLabel]).toEqual([lang, word]);
      expect(pill.findAll(n => n.type === Icon).map(n => n.props.name)).toEqual(['armchair']);
      act(() => tree!.unmount());
      tree = null;
    }
  });

  it('back (Android, or any navigation away) while decorating is Cancel: asks when changed, leaves edit mode — never the room with a half edit', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    expect(mockNavListeners.beforeRemove?.size ?? 0).toBe(0); // walking: back leaves the room as ever
    await tap('myroom-edit');
    changed(ROOM);
    // Nothing changed: back cancels at once, stays in the room.
    let e = back();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(posts('MYROOM_EDIT').pop()!.payload).toEqual({ on: false, cancel: true });
    expect(has('myroom-decorate-bar')).toBe(false);
    backToWalk();
    expect(mockNavListeners.beforeRemove?.size ?? 0).toBe(0);

    // Changed: back asks first, and the edit stays until the answer.
    await tap('myroom-edit');
    changed(ROOM);
    changed(EDITED);
    e = back();
    expect(e.preventDefault).toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    expect(has('myroom-decorate-bar')).toBe(true);
  });

  it('after Done the walk HUD waits for Unity to have the room back (MYROOM_LAYOUT_APPLIED) — or 300 ms', async () => {
    server.putReply = () => reply(200, { success: true, ...EDITED, version: 4, owned: OWNED, dropped: [] });
    await intoEditMode();
    changed(EDITED);
    await tap('myroom-decorate-done');
    expect(has('myroom-decorate-bar')).toBe(false);
    expect(has('myroom-top')).toBe(false);
    expect(has('myroom-bottom')).toBe(false);
    expect(has('world-joystick')).toBe(false);
    expect(texts()).toContain('방을 저장했어요');
    backToWalk();
    expect(has('myroom-top')).toBe(true);
    expect(has('world-joystick')).toBe(true);

    // No word from Unity (nothing changed, no layout sent): the HUD returns on its own, soon.
    jest.useFakeTimers();
    await tap('myroom-edit');
    changed(EDITED);
    await tap('myroom-decorate-done');
    expect(server.put).toHaveLength(1); // no change, no PUT
    expect(has('myroom-top')).toBe(false);
    act(() => { jest.advanceTimersByTime(299); });
    expect(has('myroom-top')).toBe(false);
    act(() => { jest.advanceTimersByTime(2); });
    expect(has('myroom-top')).toBe(true);
  });

  it('a piece with nothing to swap says so', async () => {
    await intoEditMode();
    select('b1', 'Bed', 'floor', true);
    await tap('myroom-decorate-swap');
    expect(texts()).toContain('바꿀 다른 가구가 없어요');
  });
});

/* ---- stage 1: no Storage (14-10: "Hiện tại bỏ cái trong kho luôn đi") ----------------------- */

describe('stage 1 without Storage', () => {
  const status = () => tree!.root.findAll(n => n.props.testID === 'myroom-decorate-status' && typeof n.type === 'string')[0].props.children;
  beforeEach(() => { MYROOM_FEATURES.storage = false; server.forSale = false; });

  it('the tray is Skins only: a title and the coin pill, no tabs, no handle, no storage summary', async () => {
    await intoEditMode();
    expect(tree!.root.findAll(n => /^myroom-decor-tab-/.test(n.props.testID ?? ''))).toHaveLength(0);
    expect(has('myroom-decorate-handle')).toBe(false);
    expect(has('myroom-decor-owned')).toBe(false);
    expect(has('myroom-decor-summary')).toBe(false);
    expect(tree!.root.findAll(n => n.props.testID === 'myroom-decor-title' && typeof n.type === 'string')[0].props.children).toBe('스킨');
    expect(has('myroom-decor-skins')).toBe(true);
    expect(has('myroom-skin-modern')).toBe(true);
    expect(tree!.root.findAll(n => n.props.accessibilityLabel === '1000' || n.props.accessibilityLabel === '1,000').length).toBeGreaterThan(0);
  });

  it('the selection bar has no Put away: turns and Swap for a movable piece, Fixed and Swap for a slotted one', async () => {
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    expect(has('myroom-decorate-rotate-left')).toBe(true);
    expect(has('myroom-decorate-swap')).toBe(true);
    expect(has('myroom-decorate-store')).toBe(false);
    expect(texts()).not.toContain('보관함에 넣기');
    select('l1', 'TableLamp', 'surface', false);
    expect(has('myroom-decorate-rotate-left')).toBe(false);
    expect(has('myroom-decorate-fixed')).toBe(true);
    expect(has('myroom-decorate-swap')).toBe(true);
    expect(has('myroom-decorate-store')).toBe(false);
  });

  it('the fixed-piece hint offers only the swap, in every language', async () => {
    const { translations } = jest.requireActual('../src/shared/i18n/translations');
    await intoEditMode();
    select('l1', 'TableLamp', 'surface', false);
    expect(status()).toBe('고정된 가구예요 — 다른 가구로 바꿀 수 있어요');
    useLanguageStore.setState({ lang: 'vi' });
    await act(async () => {});
    expect(status()).toBe('Món này gắn cố định — có thể đổi kiểu');
    expect(status()).not.toMatch(/cất/i);
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'])
      expect([lang, typeof translations[lang]['myroom.edit.hint.fixedSwapOnly']]).toEqual([lang, 'string']);
    expect(translations.en['myroom.edit.hint.fixedSwapOnly']).not.toMatch(/put/i);
  });

  it('swap, undo, preview a skin and Done all still work with Storage off', async () => {
    server.purchaseReply = body => reply(200, { success: true, sku: body.sku, charged: 500, coin_balance: 500, owned: { ...OWNED, themes: ['basic', 'modern'] } });
    const swapped: MyRoomLayout = { ...ROOM, items: ROOM.items!.map(i => (i.uid === 's1' ? { ...i, item: 'Pouf' } : i)) };
    server.putReply = () => reply(200, { success: true, ...swapped, theme: 'modern', version: 4, owned: OWNED, dropped: [] });
    await intoEditMode();
    select('s1', 'Sofa', 'floor', true);
    await tap('myroom-decorate-swap');
    await tap('myroom-decorate-swap-Pouf');
    changed(swapped);
    expect(node('myroom-decorate-undo').props.disabled).toBe(false);
    await tap('myroom-decorate-undo');
    expect(posts('MYROOM_LAYOUT').pop()!.payload).toEqual({ layout: ROOM });
    changed(ROOM);
    // Again, then a skin: buy it, keep it.
    await tap('myroom-decorate-swap');
    await tap('myroom-decorate-swap-Pouf');
    changed(swapped);
    await act(async () => { tree!.root.findAll(n => n.props.testID === 'myroom-skin-modern' && typeof n.props.onPress === 'function')[0].props.onPress(); });
    changed({ ...swapped, theme: 'modern' });
    expect(has('myroom-skin-buy')).toBe(true);
    await tap('myroom-skin-buy');
    expect(node('myroom-decorate-done').props.disabled).toBe(false);
    await tap('myroom-decorate-done');
    expect(server.put).toEqual([{ ...swapped, theme: 'modern', version: 3 }]);
  });

  it('the tray is shorter, inside its cap', async () => {
    await intoEditMode();
    const tray = StyleSheet.flatten(tree!.root.findAll(n => n.props.testID === 'myroom-decorate-tray' && typeof n.type === 'string')[0].props.style);
    expect(tray.maxHeight).toBe(trayCap(800, false));
    expect(tray.height).toBeUndefined();
  });
});
