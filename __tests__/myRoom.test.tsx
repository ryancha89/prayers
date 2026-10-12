/**
 * My Room (개인실, 02-10) as the app sees it, with the embedded player present.
 *
 * Pinned here:
 *  · the bridge: MYROOM_INIT repeated until MYROOM_READY (and again when the player boots underneath
 *    it or a new view arrives), the insets then the orbit replayed on READY, MYROOM_END once,
 *  · the camera: the world's follow-camera fingers on a layer over the UnityView (drag → yaw + pitch
 *    past a slop, pinch → zoom, double-tap → back behind the player), sent as MYROOM_CAMERA,
 *  · the walk: the world's stick bottom-left once the room is up, sending WALK_INPUT, hidden (and
 *    released) when the coin shop covers the room,
 *  · the way in: the world's 개인실 card takes the world's UnityView down FIRST, then navigates to
 *    MyRoom, remembering the door; the way back: the world re-opens at that door,
 *  · the screen: MYROOM_INIT with the language, the picture until READY, back to World / 2D,
 *  · the door: MYROOM_NEAR shows Leave (the world's Enter, over the stick), the back button's way
 *    out; hidden when NEAR goes false, before READY and while the coin shop is open,
 *  · landscape: the picture follows the orientation, VIEW_INSETS say landscape, the stick stays
 *    bottom-left inside the safe area, and a rotation never remounts the host,
 *  · the HUD (07-10 mockup): the badge shows the derived level and title and opens the profile sheet,
 *    mail is the app's own inbox (dot = unread, rows link inside the room), the gift's dot is the
 *    daily check-in and checks in where the player stands, 편집 opens the decorate sheet (owned / the
 *    server's shop), run toggles MYROOM_RUN (never WORLD_RUN), share opens the system sheet, and the
 *    menu sheet holds back / 2D / coins.
 */
import React from 'react';
import { Dimensions, PanResponder, Share, StyleSheet } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
// The gift is the daily check-in; null = not known (signed out, offline), the default here.
const mockAttendance = { status: null as unknown, checkIn: jest.fn() };
jest.mock('../src/features/tickets/api/attendance', () => ({
  fetchAttendance: async () => mockAttendance.status,
  checkIn: (...a: unknown[]) => mockAttendance.checkIn(...a),
}));
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [], dropPendingBeatLines: jest.fn(), openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(), sayBeatLine: jest.fn(), stopBeatVoice: jest.fn(),
}));

// Navigation: every navigate is recorded with how many times a UnityView had been unmounted then.
const mockNav = {
  calls: [] as { args: unknown[]; hostUnmounts: number }[],
  listeners: {} as Record<string, Set<(e?: unknown) => void>>,
};
const mockNavigate = jest.fn((...args: unknown[]) => mockNav.calls.push({ args, hostUnmounts: mockHost.unmounts }));
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    addListener: (event: string, fn: (e?: unknown) => void) => {
      (mockNav.listeners[event] ??= new Set()).add(fn);
      return () => mockNav.listeners[event].delete(fn);
    },
  }),
  useFocusEffect: () => {},
}));
const fire = (event: string, e?: unknown) => act(() => mockNav.listeners[event]?.forEach(fn => fn(e)));

// The player as the screens see it: present, a real bridge, and a view that records posts.
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
const mockHost = { mounts: 0, unmounts: 0 };
jest.mock('../src/features/counseling/components/UnityHost', () => {
  const R = jest.requireActual('react');
  return {
    UnityHost: () => {
      R.useEffect(() => {
        mockHost.mounts += 1;
        return () => { mockHost.unmounts += 1; };
      }, []);
      return null;
    },
  };
});

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import { nativeUnityBridge } from '../src/features/counseling/bridge';
import { INSETS_SETTLE_MS } from '../src/features/counseling/bridge/viewInsets';
import { MYROOM_STALL_MS, MyRoomScreen, myRoomActLabel, myRoomCoveredPx } from '../src/features/myroom/screens/MyRoomScreen';
import { MYROOM_PICTURE } from '../src/features/myroom/picture';
import { MYROOM_HOME, MYROOM_START_ZOOM } from '../src/features/myroom/components/useMyRoomCamera';
import { WorldScreen, worldTiming } from '../src/features/world/screens/WorldScreen';

worldTiming.hostReleaseMs = 0;
import { useWorldStore } from '../src/features/world/store/worldStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { useLanguageStore } from '../src/shared/i18n';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { useInbox } from '../src/features/myroom/inbox/inboxStore';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { WorldJoystick } from '../src/features/world/components/WorldJoystick';
import { GoldKnob } from '../src/shared/components/Ornaments';
import type { MyRoomInitPayload, ViewInsetsPayload } from '../src/features/counseling/types';

const { mockPosted } = jest.requireMock('../src/features/counseling/bridge') as {
  mockPosted: { type: string; payload?: unknown }[];
};
const posts = (type: string) => mockPosted.filter(p => p.type === type);
const fromUnity = (event: object) => act(() => nativeUnityBridge.receiveFromUnity(JSON.stringify(event)));

/* ---- the bridge ---------------------------------------------------------------------------- */

function bridgeWithView() {
  const posted: { type: string; payload?: unknown }[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
  return { bridge, posted, of: (type: string) => posted.filter(p => p.type === type) };
}

describe('the My Room bridge', () => {
  const init: MyRoomInitPayload = { lang: 'ko' };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('repeats MYROOM_INIT until the room answers, then stops', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openMyRoom(init);
    expect(of('MYROOM_INIT').map(p => p.payload)).toEqual([init]);
    jest.advanceTimersByTime(1600);
    expect(of('MYROOM_INIT')).toHaveLength(2);
    bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
    jest.advanceTimersByTime(10000);
    expect(of('MYROOM_INIT')).toHaveLength(2);
  });

  it('gives up after four retries rather than reloading forever', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openMyRoom(init);
    jest.advanceTimersByTime(60000);
    expect(of('MYROOM_INIT')).toHaveLength(5);
  });

  it('says MYROOM_INIT again when the player boots underneath it (BRIDGE_READY) or a new view arrives', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openMyRoom(init);
    bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
    expect(of('MYROOM_INIT')).toHaveLength(2);
    const view = { postMessage: jest.fn() };
    bridge.registerView(view);
    expect(view.postMessage).toHaveBeenCalledWith('RNBridge', 'OnMessage', JSON.stringify({ type: 'MYROOM_INIT', payload: init }));
  });

  it('MYROOM_RUN goes straight out, is replayed on READY while on, and a new visit starts walking', () => {
    const { bridge, posted, of } = bridgeWithView();
    bridge.openMyRoom(init);
    bridge.sendMyRoomRun(true);
    expect(of('MYROOM_RUN').map(p => p.payload)).toEqual([{ on: true }]);
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
    expect(of('MYROOM_RUN').map(p => p.payload)).toEqual([{ on: true }]);
    bridge.closeMyRoom();
    bridge.openMyRoom(init);
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
    expect(of('MYROOM_RUN')).toHaveLength(0);
    expect(of('WORLD_RUN')).toHaveLength(0);
  });

  it('replays the insets, then the orbit, on MYROOM_READY', () => {
    const { bridge, posted } = bridgeWithView();
    const insets: ViewInsetsPayload = { top: 0.1, right: 0, bottom: 0, left: 0, landscape: true };
    bridge.sendViewInsets(insets);
    bridge.openMyRoom(init);
    bridge.sendMyRoomCamera({ zoom: 0.6, yaw: -0.4, pitch: 0.2 });
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
    expect(posted.map(p => p.type)).toEqual(['VIEW_INSETS', 'MYROOM_CAMERA']);
    expect(posted[0].payload).toEqual(insets);
    expect(posted[1].payload).toEqual({ zoom: 0.6, yaw: -0.4, pitch: 0.2 });
  });

  it('leaves Unity on its start frame when the player never touched the camera, and a new visit forgets the last one', () => {
    const { bridge, posted } = bridgeWithView();
    bridge.openMyRoom(init);
    bridge.sendMyRoomCamera({ zoom: 1, yaw: 1, pitch: 1 });
    bridge.closeMyRoom();
    bridge.openMyRoom(init);
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
    expect(posted.map(p => p.type)).not.toContain('MYROOM_CAMERA');
  });

  it('MYROOM_CAMERA goes straight out, clamped, and a NaN becomes 0', () => {
    const { bridge, of } = bridgeWithView();
    bridge.sendMyRoomCamera({ zoom: 3, yaw: -9, pitch: Number.NaN });
    expect(of('MYROOM_CAMERA')[0].payload).toEqual({ zoom: 1, yaw: -1, pitch: 0 });
  });

  it('closing sends MYROOM_END once, stops the retries, and a second close says nothing', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openMyRoom(init);
    bridge.closeMyRoom();
    bridge.closeMyRoom();
    expect(of('MYROOM_END')).toHaveLength(1);
    jest.advanceTimersByTime(10000);
    expect(of('MYROOM_INIT')).toHaveLength(1);
  });
});

/* ---- the gesture maths --------------------------------------------------------------------- */

describe('fingers on the room', () => {
  it('a visit starts straight behind the player at the room’s own zoom (Unity: MyRoomBuilder.DefaultCameraZoom)', () => {
    expect(MYROOM_HOME).toEqual({ zoom: MYROOM_START_ZOOM, yaw: 0, pitch: 0 });
    expect(MYROOM_START_ZOOM).toBe(0.6);
  });
  // The maths itself is the world's (cameraFromDrag / cameraFromTwoFingers), pinned in worldMode.test.
});

/* ---- the screens --------------------------------------------------------------------------- */

const IPHONE_17 = { width: 402, height: 874, scale: 3, fontScale: 1 };
const IPHONE_17_SIDE = { width: 874, height: 402, scale: 3, fontScale: 1 };
type Win = typeof IPHONE_17;
let win: Win = IPHONE_17;
const dimensionListeners = new Set<(e: { window: Win; screen: Win }) => void>();
function rotate(to: Win) {
  win = to;
  act(() => dimensionListeners.forEach(h => h({ window: to, screen: to })));
}

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
const byLabel = (label: string) =>
  tree!.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = (label: string) => {
  const node = byLabel(label);
  if (!node) throw new Error(`no button "${label}"`);
  act(() => node.props.onPress());
};
const pictureShown = () => tree!.root.findAll(n => n.props.testID === 'myroom-picture').length > 0;

beforeEach(async () => {
  await useWorldStore.persist.rehydrate();
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'ko' });
  useWorldStore.setState({ position: { x: 5, z: 6, yaw: 30 }, returnZone: null });
  useCoins.setState({ balance: 100, shopOpen: false });
  useAuthStore.setState({ displayName: null });
  useInbox.setState({ items: [] });
  useArchiveStore.setState({ memories: [] });
  mockAttendance.status = null;
  mockAttendance.checkIn.mockReset();
  useJourneyPlayer.setState({ journeyId: null, status: 'idle' } as never);
  mockPosted.length = 0;
  mockNav.calls.length = 0;
  mockNav.listeners = {};
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockHost.mounts = 0;
  mockHost.unmounts = 0;
  win = IPHONE_17;
  dimensionListeners.clear();
  jest.spyOn(Dimensions, 'get').mockImplementation(() => win as never);
  jest.spyOn(Dimensions, 'addEventListener').mockImplementation(((_type: string, handler: never) => {
    dimensionListeners.add(handler);
    return { remove: () => dimensionListeners.delete(handler) };
  }) as never);
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('the world’s 개인실 door', () => {
  it('shows the room’s card; 들어가기 takes the world’s host down, THEN opens My Room, remembering the door', async () => {
    await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
    // The card is what a door Unity never opened shows (06-10: through the door goes straight in).
    const was = worldTiming.enterFallbackMs;
    worldTiming.enterFallbackMs = 10;
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'myroom' } });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    worldTiming.enterFallbackMs = was;
    const overlay = tree!.root.findAll(n => n.props.testID === 'world-overlay-myroom')[0];
    expect(overlay).toBeDefined();
    expect(overlay.findAll(n => n.props.children === '개인실 · My Room').length).toBeGreaterThan(0);
    expect(overlay.findAll(n => n.props.children === '나만을 위한 특별한 공간').length).toBeGreaterThan(0);
    expect(overlay.findAll(n => n.props.source === MYROOM_PICTURE.landscape).length).toBeGreaterThan(0);
    // No "coming soon" on the door any more.
    expect(overlay.findAll(n => n.props.children === '곧 만나요')).toHaveLength(0);

    press('들어가기 →');
    expect(mockNav.calls).toHaveLength(1);
    expect(mockNav.calls[0].args).toEqual(['MyRoom']);
    expect(mockNav.calls[0].hostUnmounts).toBe(1);
    expect(posts('WORLD_END')).toHaveLength(1);
    expect(useWorldStore.getState().returnZone).toBe('myroom');
  });

  it('back from My Room: the world waits for the room to go, then opens at the 개인실 door', async () => {
    await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
    // Through the door (06-10): Unity walked him in, ENTERED goes straight into the room.
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'myroom' } });
    fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'myroom' } });
    expect(mockNav.calls.map(c => c.args)).toEqual([['MyRoom']]);
    fire('blur');
    mockPosted.length = 0;
    fire('focus');
    expect(mockHost.mounts).toBe(1);
    fire('transitionEnd', { data: { closing: false } });
    expect(mockHost.mounts).toBe(2);
    await act(async () => {});
    expect(posts('WORLD_INIT')[0].payload).toEqual({ lang: 'ko', spawn: { x: 5, z: 6, yaw: 30 }, zone: 'myroom' });
    fromUnity({ type: 'WORLD_READY' });
    expect(useWorldStore.getState().returnZone).toBeNull();
  });
});

describe('the My Room screen', () => {
  const render = async () => {
    await act(async () => { tree = ReactTestRenderer.create(<MyRoomScreen />); });
    return tree!;
  };
  // Depth-first: the first View with a layout handler is the stage itself.
  const stage = () => tree!.root.findAll(n => typeof n.props.onLayout === 'function')[0];
  const has = (testID: string) => tree!.root.findAll(n => n.props.testID === testID).length > 0;

  it('asks for the room in the player’s language, and shows its picture until the room answers', async () => {
    useLanguageStore.setState({ lang: 'vi' });
    await render();
    expect(mockHost.mounts).toBe(1);
    expect(posts('MYROOM_INIT')[0].payload).toEqual({ lang: 'vi', book: null });
    expect(pictureShown()).toBe(true);
    fromUnity({ type: 'MYROOM_READY' });
    expect(pictureShown()).toBe(false);
  });

  it('a room that never answers says so after MYROOM_STALL_MS and offers a retry that asks again', async () => {
    jest.useFakeTimers();
    await render();
    const texts = () => tree!.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
    expect(texts()).toContain('방을 불러오는 중…');
    expect(has('myroom-retry')).toBe(false);
    act(() => { jest.advanceTimersByTime(MYROOM_STALL_MS); });
    expect(texts()).toContain('방을 불러오지 못했어요');
    const before = posts('MYROOM_INIT').length;
    act(() => { tree!.root.findAll(n => n.props.testID === 'myroom-retry')[0].props.onPress(); });
    expect(posts('MYROOM_INIT').length).toBe(before + 1);
    expect(has('myroom-retry')).toBe(false);
    expect(texts()).toContain('방을 불러오는 중…');
    fromUnity({ type: 'MYROOM_READY' });
    act(() => { jest.advanceTimersByTime(MYROOM_STALL_MS); });
    expect(has('myroom-retry')).toBe(false);
    expect(pictureShown()).toBe(false);
  });

  const texts = () => tree!.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
  const tap = (testID: string) => {
    const node = tree!.root.findAll(n => n.props.testID === testID && typeof n.props.onPress === 'function')[0];
    if (!node) throw new Error(`no ${testID}`);
    return act(async () => { await node.props.onPress(); });
  };

  it('the badge shows the level and title the player has earned, and opens the profile sheet', async () => {
    useAuthStore.setState({ displayName: '하늘' });
    // Four check-ins ever (the server's days_total) = 40 XP = level 2.
    mockAttendance.status = { checkedToday: true, dailyTickets: 2, freeBalance: 3, freeCap: 10, tickets: 3, daysTotal: 4 };
    await render();
    // The pressable, not the ProfileBadge element that hands it the testID (shared/components/hud).
    const badge = tree!.root.findAll(n => n.props.testID === 'myroom-profile' && n.props.accessibilityLabel != null)[0];
    expect(badge.findAll(n => n.props.children === '새내기 여행자').length).toBeGreaterThan(0);
    expect(badge.findAll(n => Array.isArray(n.props.children) && n.props.children.join('') === 'Lv. 2').length).toBeGreaterThan(0);
    expect(badge.props.accessibilityLabel).toBe('하늘 · Lv. 2 · 새내기 여행자');
    expect(texts()).toContain('A BRIGHTER TOMORROW');
    // The old title bar is gone; the room's name is on the world's door, not over the room.
    expect(texts()).not.toContain('개인실 · My Room');

    fromUnity({ type: 'MYROOM_READY' });
    await tap('myroom-profile');
    expect(has('myroom-sheet-profile')).toBe(true);
    // A sheet covers the room: the stick and the look layer go.
    expect(has('world-joystick')).toBe(false);
    expect(texts()).toContain('하늘');
    expect(texts()).toContain('Lv. 2 · 새내기 여행자');
    expect(texts()).toContain('0 / 50 XP · 다음 레벨까지 50 XP');
    expect(texts()).toContain('출석 4일');
    expect(texts()).toContain('+40 XP');
    expect(texts()).toContain('Lv. 5부터 「별을 찾는 이」');
  });

  it('a new player is level 1 and the sheet says how to grow', async () => {
    await render();
    await tap('myroom-profile');
    expect(texts()).toContain('Lv. 1 · 새내기 여행자');
    expect(texts()).toContain('출석하고, 일기를 쓰고, 상담을 받으면 레벨이 올라요');
  });

  it('run toggles MYROOM_RUN on and off, lit while on, and never sends WORLD_RUN', async () => {
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    mockPosted.length = 0;
    const run = () => tree!.root.findAll(n => n.props.testID === 'myroom-run' && n.props.accessibilityRole === 'button')[0];
    expect(run().props.accessibilityState).toEqual({ selected: false });
    await tap('myroom-run');
    expect(run().props.accessibilityState).toEqual({ selected: true });
    await tap('myroom-run');
    expect(posts('MYROOM_RUN').map(p => p.payload)).toEqual([{ on: true }, { on: false }]);
    // WORLD_RUN would set the world's run for the way back.
    expect(posts('WORLD_RUN')).toHaveLength(0);
  });

  it('mail is the inbox: a dot only while something is unread; a row links inside the room', async () => {
    await render();
    expect(has('myroom-mail-badge')).toBe(false);
    await tap('myroom-mail');
    expect(has('myroom-sheet-inbox')).toBe(true);
    expect(texts()).toContain('아직 도착한 소식이 없어요');
    act(() => tree!.unmount());

    act(() => {
      useInbox.getState().push({ id: 'coins:1', kind: 'coins', data: { coins: 500, balance: 600 } });
    });
    await render();
    expect(has('myroom-mail-badge')).toBe(true);
    await tap('myroom-mail');
    expect(texts()).toContain('코인 500개가 충전됐어요');
    await tap('myroom-inbox-coins:1');
    // Read, and the coin shop opens over the room (the sheet makes way).
    expect(useInbox.getState().items[0].read).toBe(true);
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(has('myroom-sheet-inbox')).toBe(false);
    expect(has('myroom-mail-badge')).toBe(false);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("the check-in mail checks in where the player stands; the diary mail opens the entry", async () => {
    mockAttendance.status = { checkedToday: false, dailyTickets: 2, freeBalance: 3, freeCap: 10, tickets: 3, daysTotal: 0 };
    mockAttendance.checkIn.mockResolvedValue({ ok: true, alreadyChecked: false, granted: 2, capReached: false, freeBalance: 5, freeCap: 10, tickets: 5, daysTotal: 1 });
    const memory = useArchiveStore.getState().add({ category: 'diary', content: '비 오는 날의 일기' });
    act(() => {
      useInbox.getState().push({ id: 'checkin:today', kind: 'checkin', data: { date: 'today', claimed: false } });
      useInbox.getState().push({ id: `reflection:${memory.id}`, kind: 'reflection', data: { memoryId: memory.id, tone: 'metal' } });
    });
    await render();
    await tap('myroom-mail');
    await tap('myroom-inbox-checkin:today');
    expect(mockAttendance.checkIn).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('무료 티켓 2장을 받았어요!');
    // The badge counted the new check-in: 10 XP.
    await tap('myroom-profile');
    expect(texts()).toContain('출석 1일');
    await tap('myroom-mail');
    expect(texts()).toContain('비 오는 날의 일기');
    await tap(`myroom-inbox-reflection:${memory.id}`);
    expect(has('myroom-sheet-inbox')).toBe(false);
    expect(tree!.root.findAll(n => n.props.testID === 'diary-detail').length).toBeGreaterThan(0);
  });

  it('편집 opens the decorate sheet: what you own (and that arranging is coming), and the shop with coins', async () => {
    const { authedFetch } = jest.requireMock('../src/features/auth/api/headers') as { authedFetch: jest.Mock };
    const reply = (status: number, body: object) => ({ ok: status < 300, status, json: async () => body });
    const bought: string[] = [];
    authedFetch.mockImplementation(async (url: string, init?: { method?: string; body?: string }) => {
      if (url.endsWith('/myroom/catalog')) {
        return reply(200, {
          success: true, coin_balance: 100,
          items: [
            { id: 'Sofa', kind: 'floor', category: 'seat', size: 'large', theme: 'basic', price: 150, starter: 1, owned: 1 },
            { id: 'Pouf', kind: 'floor', category: 'seat', size: 'small', theme: 'basic', price: 50, starter: 1, owned: 1 },
            // An id this build has no name for: left out (spec 005 edge case).
            { id: 'Teapot', kind: 'surface', category: 'decor', size: 'small', theme: 'basic', price: 50, starter: 0, owned: 0 },
          ],
          themes: [{ id: 'basic', price: 0, starter: true, owned: true }, { id: 'modern', price: 500, starter: false, owned: false }],
        });
      }
      if (url.endsWith('/myroom/purchase')) {
        const { sku, idem_key } = JSON.parse(init!.body!);
        expect(idem_key).toMatch(/^[A-Za-z0-9_-]{8,64}$/);
        bought.push(sku);
        return reply(200, { success: true, sku, charged: 50, coin_balance: 50, owned: { items: { Sofa: 1, Pouf: 2, DiaryBook: 1 }, themes: ['basic'] } });
      }
      if (url.endsWith('/myroom')) {
        return reply(200, { success: true, coin_balance: 100, owned: { items: { Sofa: 1, Pouf: 1, DiaryBook: 1, Teapot: 1 }, themes: ['basic'] } });
      }
      return null;
    });
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    await tap('myroom-edit');
    await act(async () => {});
    expect(has('myroom-sheet-decor')).toBe(true);
    expect(has('world-joystick')).toBe(false);
    // Owned: counts, and a plain note instead of a mover that does nothing.
    expect(has('myroom-decor-arrange-soon')).toBe(true);
    expect(texts()).toContain('가구 배치는 곧 만나요 — 지금은 모아 둘 수 있어요');
    expect(has('myroom-owned-DiaryBook')).toBe(true);
    expect(has('myroom-owned-Teapot')).toBe(false);
    expect(texts()).toContain('일기장');

    await tap('myroom-decor-tab-shop');
    expect(has('myroom-shop-item:Sofa')).toBe(true);
    expect(has('myroom-shop-item:Teapot')).toBe(false);
    expect(has('myroom-buy-theme:modern')).toBe(true);
    // Buying asks once, then spends.
    await tap('myroom-buy-item:Pouf');
    expect(bought).toEqual([]);
    expect(texts()).toContain('구매');
    await tap('myroom-buy-item:Pouf');
    await act(async () => {});
    expect(bought).toEqual(['item:Pouf']);
    expect(texts()).toContain('푸프 구매 완료');
    expect(useCoins.getState().balance).toBe(50);
    expect(useInbox.getState().items[0]).toMatchObject({ kind: 'furniture', data: { sku: 'item:Pouf' } });
    // Short of coins: the coin shop, no purchase.
    await tap('myroom-buy-item:Sofa');
    expect(bought).toEqual(['item:Pouf']);
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(has('myroom-sheet-decor')).toBe(false);
    authedFetch.mockReset();
  });

  it('the gift is the daily check-in: a dot only while today is unclaimed, and it checks in where the player stands', async () => {
    jest.useFakeTimers();
    mockAttendance.status = { checkedToday: false, dailyTickets: 2, freeBalance: 3, freeCap: 10, tickets: 3 };
    mockAttendance.checkIn.mockResolvedValue({ ok: true, alreadyChecked: false, granted: 2, capReached: false, freeBalance: 5, freeCap: 10, tickets: 5 });
    await render();
    expect(has('myroom-gift-badge')).toBe(true);
    await tap('myroom-gift');
    expect(mockAttendance.checkIn).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('무료 티켓 2장을 받았어요!');
    expect(has('myroom-gift-badge')).toBe(false);
    // No route change: a non-Unity screen on top would post SESSION_END under the room.
    expect(mockNavigate).not.toHaveBeenCalled();
    await tap('myroom-gift');
    expect(mockAttendance.checkIn).toHaveBeenCalledTimes(1);
    expect(texts()).toContain('오늘 출석 완료 · 내일 또 만나요');
  });

  it('no dot when the check-in is already done, or unknown', async () => {
    await render();
    expect(has('myroom-gift-badge')).toBe(false);
    act(() => tree!.unmount());
    mockAttendance.status = { checkedToday: true, dailyTickets: 2, freeBalance: 3, freeCap: 10, tickets: 3 };
    await render();
    expect(has('myroom-gift-badge')).toBe(false);
    // Nor on mail: nothing is unread.
    expect(has('myroom-mail-badge')).toBe(false);
  });

  it('share opens the system share sheet with one line', async () => {
    const spy = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
    await render();
    await tap('myroom-share');
    expect(spy).toHaveBeenCalledWith({ message: '내 방에서 잠시 쉬어 가는 중이에요 — Prayers' });
  });

  // The book icon's way into My Diary is pinned in diaryList.test (testID myroom-diary, kept).
  it('the menu sheet covers the stick and holds the coin pill', async () => {
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    await tap('myroom-menu');
    expect(has('myroom-sheet-menu')).toBe(true);
    expect(has('world-joystick')).toBe(false);
    expect(has('myroom-look')).toBe(false);
    expect(texts()).toContain('코인 충전');
    // The coin pill opens the shop, and the sheet makes way for it.
    press('100');
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(has('myroom-sheet-menu')).toBe(false);
  });

  it('back returns to the world (goBack, where it re-opens at the door); 2D goes to Home; leaving says MYROOM_END', async () => {
    await render();
    await tap('myroom-menu');
    press('월드로 돌아가기');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(has('myroom-sheet-menu')).toBe(false);
    await tap('myroom-menu');
    press('2D 화면으로 돌아가기');
    expect(mockNavigate).toHaveBeenLastCalledWith('Tabs', { screen: 'Home' });
    act(() => tree!.unmount());
    tree = null;
    expect(posts('MYROOM_END')).toHaveLength(1);
  });

  // The responder plumbing is React Native's; what is pinned is what the hooks do with it. The
  // look layer's config is the one that lets go when asked (the stick's never does).
  type Cfg = Required<Parameters<typeof PanResponder.create>[0]>;
  const ev = (touches: { pageX: number; pageY: number }[]) => ({ nativeEvent: { touches, pageX: touches[0]?.pageX ?? 0, pageY: touches[0]?.pageY ?? 0 } }) as never;
  const one = (x: number, y: number) => ev([{ pageX: x, pageY: y }]);
  const two = (d: number) => ev([{ pageX: 0, pageY: 0 }, { pageX: d, pageY: 0 }]);
  const g = (dx: number, dy: number) => ({ dx, dy }) as never;
  // NativeUnityBridge coalesces a moving finger's messages (33 ms windows, latest wins): every
  // reading below lets the window close first.
  const settle = () => act(() => { jest.advanceTimersByTime(40); });
  const spyResponders = () => {
    const configs: Cfg[] = [];
    const real = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(c => { configs.push(c as Cfg); return real(c); });
    return {
      look: () => configs.filter(c => c.onPanResponderTerminationRequest(one(0, 0), g(0, 0)) === true).pop()!,
      stick: () => configs.filter(c => c.onPanResponderTerminationRequest(one(0, 0), g(0, 0)) === false).pop()!,
    };
  };

  it('the look layer and the stick wait for the room, and sit over it once it is up', async () => {
    await render();
    expect(has('myroom-look')).toBe(false);
    expect(has('world-joystick')).toBe(false);
    fromUnity({ type: 'MYROOM_READY' });
    expect(has('myroom-look')).toBe(true);
    expect(has('world-joystick')).toBe(true);
    // Over the UnityView, under the controls: the layer comes after the host and before the top bar.
    const host = tree!.root.findAll(n => typeof n.type === 'string' && typeof n.props.onLayout === 'function')[0];
    const kids = host.children as ReactTestRenderer.ReactTestInstance[];
    const at = (pred: (n: ReactTestRenderer.ReactTestInstance) => boolean) => kids.findIndex(k => pred(k) || k.findAll(pred).length > 0);
    const look = at(n => n.props.testID === 'myroom-look');
    expect(look).toBeGreaterThan(0); // the stage's first child is the UnityHost
    expect(look).toBeLessThan(at(n => n.props.testID === 'myroom-top'));
    expect(look).toBeLessThan(at(n => n.props.testID === 'world-joystick'));
  });

  it('a drag past the slop looks around (yaw + pitch), a pinch zooms, a tap does nothing, a double-tap goes back behind the player', async () => {
    jest.useFakeTimers();
    const r = spyResponders();
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    const cfg = r.look();
    const camera = () => posts('MYROOM_CAMERA').pop()?.payload as { zoom: number; yaw: number; pitch: number };
    mockPosted.length = 0;

    // The layer claims every touch (nothing under it is RN's), but a short unmoved one is a tap.
    expect(cfg.onStartShouldSetPanResponder(one(0, 0), g(0, 0))).toBe(true);
    act(() => cfg.onPanResponderGrant(one(200, 400), g(0, 0)));
    act(() => cfg.onPanResponderMove(one(204, 403), g(4, 3)));
    act(() => cfg.onPanResponderRelease(one(204, 403), g(4, 3)));
    expect(posts('MYROOM_CAMERA')).toHaveLength(0);

    // Past the slop, then half the window's width to the left: the view swings half round (yaw +0.5);
    // half its height down: the camera rises all the way (pitch +1). The world's numbers.
    act(() => cfg.onPanResponderGrant(one(300, 200), g(0, 0)));
    act(() => cfg.onPanResponderMove(one(320, 200), g(20, 0)));
    act(() => cfg.onPanResponderMove(one(119, 637), g(20 - 201, 437)));
    settle();
    expect(camera().yaw).toBeCloseTo(0.5, 2);
    expect(camera().pitch).toBeCloseTo(1, 2);
    expect(camera().zoom).toBe(MYROOM_START_ZOOM);
    act(() => cfg.onPanResponderRelease(one(119, 637), g(-181, 437)));

    // Two fingers closing to 0.8x: zoom 0.2 in from the start, the look kept.
    act(() => cfg.onPanResponderGrant(two(100), g(0, 0)));
    act(() => cfg.onPanResponderMove(two(80), g(0, 0)));
    settle();
    expect(camera().zoom).toBeCloseTo(MYROOM_START_ZOOM - 0.2);
    expect(camera().yaw).toBeCloseTo(0.5, 2);
    act(() => cfg.onPanResponderRelease(two(80), g(0, 0)));

    // Two quick taps: back behind the player at the start zoom.
    mockPosted.length = 0;
    for (let i = 0; i < 2; i++) {
      act(() => cfg.onPanResponderGrant(one(200, 400), g(0, 0)));
      act(() => cfg.onPanResponderRelease(one(200, 400), g(0, 0)));
    }
    settle();
    expect(posts('MYROOM_CAMERA').map(p => p.payload)).toEqual([MYROOM_HOME]);
    // No WORLD_TAP in the room: there is nothing in it to tap.
    expect(posts('WORLD_TAP')).toHaveLength(0);
  });

  it('the stick walks: WALK_INPUT forward under the thumb, {0,0} on release and when the coin shop covers the room', async () => {
    jest.useFakeTimers();
    const r = spyResponders();
    await render();
    fromUnity({ type: 'MYROOM_READY' });
    const stick = r.stick();
    mockPosted.length = 0;
    act(() => stick.onPanResponderGrant({ nativeEvent: { locationX: 80, locationY: 140 } } as never, g(0, 0)));
    act(() => stick.onPanResponderMove(one(80, 80), g(0, -60)));
    settle();
    const walk = posts('WALK_INPUT').pop()?.payload as { x: number; y: number };
    expect(walk.x).toBe(0);
    expect(walk.y).toBeGreaterThan(0.9);
    act(() => stick.onPanResponderRelease(one(80, 80), g(0, -60)));
    settle();
    expect(posts('WALK_INPUT').pop()?.payload).toEqual({ x: 0, y: 0 });

    act(() => stick.onPanResponderGrant({ nativeEvent: { locationX: 80, locationY: 140 } } as never, g(0, 0)));
    act(() => stick.onPanResponderMove(one(120, 140), g(40, 0)));
    settle();
    expect((posts('WALK_INPUT').pop()?.payload as { x: number }).x).toBeGreaterThan(0.3);
    act(() => useCoins.setState({ shopOpen: true }));
    settle();
    expect(has('world-joystick')).toBe(false);
    expect(has('myroom-look')).toBe(false);
    expect(posts('WALK_INPUT').pop()?.payload).toEqual({ x: 0, y: 0 });
  });

  describe('the door (MYROOM_NEAR → Leave)', () => {
    const leave = () => byLabel('나가기');

    it('walking up to the door shows Leave where the world puts Enter; walking away hides it', async () => {
      await render();
      fromUnity({ type: 'MYROOM_READY' });
      expect(leave()).toBeUndefined();
      fromUnity({ type: 'MYROOM_NEAR', payload: { near: true } });
      expect(leave()).toBeDefined();
      expect(has('myroom-leave')).toBe(true);
      // Over the stick area, centred, as WorldScreen's Enter (bottom 250 portrait, 150 landscape).
      const wrap = StyleSheet.flatten(tree!.root.findAll(n => n.props.testID === 'myroom-leave')[0].props.style);
      expect(wrap.position).toBe('absolute');
      expect(wrap.bottom).toBe(250);
      expect(wrap.alignItems).toBe('center');
      expect(tree!.root.findAll(n => n.props.children === '나가기').length).toBeGreaterThan(0);
      fromUnity({ type: 'MYROOM_NEAR', payload: { near: false } });
      expect(leave()).toBeUndefined();
    });

    it('Leave takes the back button’s way out: a sound, goBack to the world’s 개인실 door, MYROOM_END', async () => {
      const { sfx } = jest.requireMock('../src/shared/audio/sfx') as { sfx: { back: jest.Mock } };
      sfx.back.mockClear();
      // As the world left it on the way in (WorldScreen.leaveTo): the door it re-opens at.
      useWorldStore.setState({ returnZone: 'myroom' });
      await render();
      fromUnity({ type: 'MYROOM_READY' });
      fromUnity({ type: 'MYROOM_NEAR', payload: { near: true } });
      press('나가기');
      expect(sfx.back).toHaveBeenCalledTimes(1);
      expect(mockGoBack).toHaveBeenCalledTimes(1);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(useWorldStore.getState().returnZone).toBe('myroom');
      act(() => tree!.unmount());
      tree = null;
      expect(posts('MYROOM_END')).toHaveLength(1);
    });

    it('is hidden while the coin shop is open, and before the room is up', async () => {
      await render();
      fromUnity({ type: 'MYROOM_NEAR', payload: { near: true } });
      expect(leave()).toBeUndefined();
      fromUnity({ type: 'MYROOM_READY' });
      expect(leave()).toBeDefined();
      act(() => useCoins.setState({ shopOpen: true }));
      expect(leave()).toBeUndefined();
      act(() => useCoins.setState({ shopOpen: false }));
      expect(leave()).toBeDefined();
    });

    it('speaks the player’s language', async () => {
      useLanguageStore.setState({ lang: 'en' });
      await render();
      fromUnity({ type: 'MYROOM_READY' });
      fromUnity({ type: 'MYROOM_NEAR', payload: { near: true } });
      expect(byLabel('Leave')).toBeDefined();
    });
  });

  it('a stick pushed while the room loaded is dropped on READY, never flushed into a later scene', async () => {
    await render();
    nativeUnityBridge.sendEvent({ type: 'WALK_INPUT', payload: { x: 0, y: 1 } });
    mockPosted.length = 0;
    fromUnity({ type: 'MYROOM_READY' });
    // The outbox is flushed on UNITY_READY (the next consultation): the old thumb must not be in it.
    fromUnity({ type: 'UNITY_READY' });
    expect(posts('WALK_INPUT')).toHaveLength(0);
  });

  it('landscape: the picture turns with the phone, VIEW_INSETS say landscape, and the host is never remounted', async () => {
    await render();
    const pic = () => tree!.root.findAll(n => n.props.testID === 'myroom-picture')[0].findAll(n => n.props.source != null)[0].props.source;
    expect(pic()).toBe(MYROOM_PICTURE.portrait);
    // Lay out the host and the top and bottom rows, as RN would.
    const host = stage();
    const row = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.props.onLayout === 'function')[0];
    rotate(IPHONE_17_SIDE);
    act(() => {
      host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 874, height: 402 } } });
      row('myroom-top').props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 874, height: 52 } } });
      row('myroom-bottom').props.onLayout({ nativeEvent: { layout: { x: 0, y: 342, width: 874, height: 60 } } });
    });
    await act(async () => { await new Promise(r => setTimeout(r, INSETS_SETTLE_MS + 30)); });
    expect(pic()).toBe(MYROOM_PICTURE.landscape);
    expect(posts('VIEW_INSETS').pop()?.payload).toEqual({ top: 0.13, right: 0, bottom: 0.15, left: 0, landscape: true });
    // The stick, bottom-left in landscape too, on the safe-area inset.
    fromUnity({ type: 'MYROOM_READY' });
    const wrap = tree!.root.findAll(n => n.props.pointerEvents === 'box-none' && n.findAll(c => c.props.testID === 'world-joystick').length > 0)[0];
    expect(wrap).toBeDefined();
    const st = StyleSheet.flatten(wrap.props.style);
    expect(st.position).toBe('absolute');
    expect(st.left).toBeLessThan(40);
    // On the 편집 row, not under it.
    expect(st.bottom).toBeGreaterThanOrEqual(40);
    expect(st.bottom).toBeLessThan(80);
    expect(st.top).toBeUndefined();
    rotate(IPHONE_17);
    expect(mockHost.mounts).toBe(1);
    expect(mockHost.unmounts).toBe(0);
  });
});

describe('the stick has one look', () => {
  it('the ornate ring and gold knob, at rest, wherever it is mounted (07-10: the plain puck is gone)', async () => {
    let r!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { r = ReactTestRenderer.create(<WorldJoystick visible />); });
    expect(r.root.findAllByType(GoldKnob)).toHaveLength(1);
    act(() => r.unmount());
  });
});

describe('VIEW_INSETS over the room', () => {
  it('the top and bottom rows, in either orientation; nothing without a host', () => {
    expect(myRoomCoveredPx({
      host: { x: 0, y: 0, width: 402, height: 874 },
      top: { x: 0, y: 0, width: 402, height: 96 },
      bottom: { x: 0, y: 792, width: 402, height: 82 },
    })).toEqual({ top: 96, bottom: 82 });
    expect(myRoomCoveredPx({ host: { x: 0, y: 0, width: 874, height: 402 } })).toEqual({ top: 0, bottom: 0 });
    expect(myRoomCoveredPx({})).toBeNull();
  });
});

/* ---- the furniture (spec 005 US1: MYROOM_NEAR_ITEM → one action button → MYROOM_ACT) ------------ */

describe('the furniture', () => {
  const render = async () => {
    await act(async () => { tree = ReactTestRenderer.create(<MyRoomScreen />); });
    fromUnity({ type: 'MYROOM_READY' });
    return tree!;
  };
  const near = (uid: string, action: string, active = false) =>
    fromUnity({ type: 'MYROOM_NEAR_ITEM', payload: { uid, item: uid.split('#')[0], action, near: true, active } });
  const state = (uid: string, action: string, active: boolean) =>
    fromUnity({ type: 'MYROOM_ACT_STATE', payload: { uid, action, active } });
  const actBtn = () => tree!.root.findAll(n => n.props.testID === 'myroom-act' && typeof n.props.onPress === 'function')[0];
  const has = (testID: string) => tree!.root.findAll(n => n.props.testID === testID).length > 0;

  it('the bridge posts MYROOM_ACT with the piece and its action, and MYROOM_ACT_END bare', () => {
    const { bridge, of } = bridgeWithView();
    bridge.sendMyRoomAct('Sofa', 'sit');
    bridge.endMyRoomAct();
    expect(of('MYROOM_ACT')).toEqual([{ type: 'MYROOM_ACT', payload: { uid: 'Sofa', action: 'sit' } }]);
    expect(of('MYROOM_ACT_END')).toEqual([{ type: 'MYROOM_ACT_END' }]);
  });

  it('no piece in reach, no button; walking up to the sofa shows Sit where the world puts Enter', async () => {
    await render();
    expect(actBtn()).toBeUndefined();
    near('Sofa', 'sit');
    expect(byLabel('앉기')).toBeDefined();
    fromUnity({ type: 'MYROOM_NEAR_ITEM', payload: { uid: '', item: '', action: '', near: false, active: false } });
    expect(actBtn()).toBeUndefined();
  });

  it('Sit sends MYROOM_ACT; seated, the button reads Stand and sends MYROOM_ACT_END; standing, Sit again', async () => {
    await render();
    near('Sofa', 'sit');
    mockPosted.length = 0;
    press('앉기');
    expect(posts('MYROOM_ACT')).toEqual([{ type: 'MYROOM_ACT', payload: { uid: 'Sofa', action: 'sit' } }]);
    state('Sofa', 'sit', true);
    press('일어서기');
    expect(posts('MYROOM_ACT_END')).toHaveLength(1);
    state('Sofa', 'sit', false);
    expect(byLabel('앉기')).toBeDefined();
  });

  // 07-10 mockup: the prompt hangs on the piece — its name in a chip, the action under it.
  const anchorAt = (uid: string, x: number, y: number, onScreen = true) =>
    fromUnity({ type: 'MYROOM_ITEM_ANCHOR', payload: { uid, x, y, onScreen } });
  const texts = () => tree!.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);

  it('with an anchor the prompt hangs on the piece: its name, then the action; pressing it acts', async () => {
    await render();
    near('Sofa', 'sit');
    anchorAt('Sofa', 0.6, 0.45);
    expect(texts()).toContain('소파');
    mockPosted.length = 0;
    press('소파 · 앉기');
    expect(posts('MYROOM_ACT')).toEqual([{ type: 'MYROOM_ACT', payload: { uid: 'Sofa', action: 'sit' } }]);
  });

  it('in use, the button docks at the bottom (hung on the chair it sat on his chest)', async () => {
    await render();
    near('Sofa', 'sit');
    anchorAt('Sofa', 0.6, 0.45);
    state('Sofa', 'sit', true);
    expect(texts()).not.toContain('소파');
    expect(byLabel('일어서기')).toBeDefined();
  });

  it('an anchor off screen, or for another piece, leaves the button at the bottom without a name', async () => {
    await render();
    near('Sofa', 'sit');
    anchorAt('Sofa', 0.6, 0.45, false);
    expect(texts()).not.toContain('소파');
    expect(byLabel('앉기')).toBeDefined();
    anchorAt('Armchair', 0.3, 0.4);
    expect(texts()).not.toContain('소파');
    expect(byLabel('앉기')).toBeDefined();
  });

  it('Rest / Get up on the bed, Look / Back at the bookshelf', async () => {
    await render();
    near('Bed', 'rest');
    expect(byLabel('쉬기')).toBeDefined();
    state('Bed', 'rest', true);
    expect(byLabel('일어나기')).toBeDefined();
    state('Bed', 'rest', false);
    near('Bookshelf', 'look');
    expect(byLabel('둘러보기')).toBeDefined();
    state('Bookshelf', 'look', true);
    expect(byLabel('돌아가기')).toBeDefined();
  });

  it('a lamp is labelled by its state: Lamp off when on, Lamp on after it went out; every tap is MYROOM_ACT lamp', async () => {
    await render();
    near('GlobeLamp', 'lamp', true);
    mockPosted.length = 0;
    press('조명 끄기');
    state('GlobeLamp', 'lamp', false);
    press('조명 켜기');
    expect(posts('MYROOM_ACT')).toEqual([
      { type: 'MYROOM_ACT', payload: { uid: 'GlobeLamp', action: 'lamp' } },
      { type: 'MYROOM_ACT', payload: { uid: 'GlobeLamp', action: 'lamp' } },
    ]);
    expect(posts('MYROOM_ACT_END')).toHaveLength(0);
  });

  it('Leave wins at the door, and the button hides with the stick while the coin shop is open', async () => {
    await render();
    near('Sofa', 'sit');
    fromUnity({ type: 'MYROOM_NEAR', payload: { near: true } });
    expect(actBtn()).toBeUndefined();
    expect(byLabel('나가기')).toBeDefined();
    fromUnity({ type: 'MYROOM_NEAR', payload: { near: false } });
    expect(actBtn()).toBeDefined();
    act(() => useCoins.setState({ shopOpen: true }));
    expect(actBtn()).toBeUndefined();
  });

  // Unity (07-10): ACT_STATE write active:true lands ~0.5 s after MYROOM_ACT, once the camera is on
  // the page; an ACT_END before that yields only active:false.
  it('the book opens on its page when the camera has landed (no sheet by itself); an early ACT_END opens nothing', async () => {
    await render();
    near('Desk#1', 'write');
    press('일기장 펴기');
    expect(has('diary-book-bar')).toBe(false);
    state('Desk#1', 'write', true);
    expect(has('diary-book-bar')).toBe(true);
    expect(has('diary-write')).toBe(false);
    act(() => tree!.unmount());

    await render();
    near('Desk#1', 'write');
    press('일기장 펴기');
    state('Desk#1', 'write', false);
    expect(has('diary-book-bar')).toBe(false);
    expect(byLabel('일기장 펴기')).toBeDefined();
    // Book glyph reports are logged only, whenever they come.
    fromUnity({ type: 'MYROOM_BOOK_STATE', payload: { id: 'x', shown: true, missing: [] } });
    expect(byLabel('일기장 펴기')).toBeDefined();
  });

  it('speaks the player’s language', async () => {
    useLanguageStore.setState({ lang: 'en' });
    await render();
    near('Armchair', 'sit');
    expect(byLabel('Sit')).toBeDefined();
    state('Armchair', 'sit', true);
    expect(byLabel('Stand')).toBeDefined();
  });

  it('every label is in all six tables, and myRoomActLabel names only keys that exist', () => {
    const { translations } = jest.requireActual('../src/shared/i18n/translations');
    const keys = ['sit', 'stand', 'rest', 'getUp', 'lampOn', 'lampOff', 'look', 'back'].map(k => `myroom.act.${k}`);
    for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'])
      for (const k of keys) expect([lang, k, typeof translations[lang][k]]).toEqual([lang, k, 'string']);
    for (const a of ['sit', 'rest', 'lamp', 'look'] as const)
      for (const on of [true, false]) expect(keys).toContain(myRoomActLabel(a, on, on));
  });
});
