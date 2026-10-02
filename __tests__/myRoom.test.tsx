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
 *    bottom-left inside the safe area, and a rotation never remounts the host.
 */
import React from 'react';
import { Dimensions, PanResponder, StyleSheet } from 'react-native';
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
import { MyRoomScreen, myRoomCoveredPx } from '../src/features/myroom/screens/MyRoomScreen';
import { MYROOM_PICTURE } from '../src/features/myroom/picture';
import { MYROOM_HOME, MYROOM_START_ZOOM } from '../src/features/myroom/components/useMyRoomCamera';
import { WorldScreen, worldTiming } from '../src/features/world/screens/WorldScreen';

worldTiming.hostReleaseMs = 0;
import { useWorldStore } from '../src/features/world/store/worldStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { useLanguageStore } from '../src/shared/i18n';
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
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'myroom' } });
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
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'myroom' } });
    press('들어가기 →');
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
    expect(posts('MYROOM_INIT')[0].payload).toEqual({ lang: 'vi' });
    expect(pictureShown()).toBe(true);
    fromUnity({ type: 'MYROOM_READY' });
    expect(pictureShown()).toBe(false);
  });

  it('the title, the coin pill and the decorating hint are on screen, in the player’s language', async () => {
    await render();
    const texts = tree!.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
    expect(texts).toContain('개인실 · My Room');
    expect(texts).toContain('꾸미기 기능은 곧 만나요');
    act(() => tree!.unmount());
    useLanguageStore.setState({ lang: 'en' });
    await render();
    const en = tree!.root.findAll(n => typeof n.props.children === 'string').map(n => n.props.children as string);
    expect(en).toContain('Decorating is coming soon');
  });

  it('back returns to the world (goBack, where it re-opens at the door); 2D goes to Home; leaving says MYROOM_END', async () => {
    await render();
    press('월드로 돌아가기');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    press('홈으로');
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
    expect(look).toBeLessThan(at(n => n.props.accessibilityLabel === '월드로 돌아가기'));
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
    // Lay out the host and the top bar, as RN would.
    const host = stage();
    const top = tree!.root.findAll(n => typeof n.props.onLayout === 'function' && n.props.onLayout !== host.props.onLayout
      && n.findAll(c => c.props.children === '개인실 · My Room').length > 0)[0];
    rotate(IPHONE_17_SIDE);
    act(() => {
      host.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 874, height: 402 } } });
      top.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 874, height: 52 } } });
    });
    await act(async () => { await new Promise(r => setTimeout(r, INSETS_SETTLE_MS + 30)); });
    expect(pic()).toBe(MYROOM_PICTURE.landscape);
    expect(posts('VIEW_INSETS').pop()?.payload).toEqual({ top: 0.13, right: 0, bottom: 0, left: 0, landscape: true });
    // The stick, bottom-left in landscape too, on the safe-area inset.
    fromUnity({ type: 'MYROOM_READY' });
    const wrap = tree!.root.findAll(n => n.props.pointerEvents === 'box-none' && n.findAll(c => c.props.testID === 'world-joystick').length > 0)[0];
    expect(wrap).toBeDefined();
    const st = StyleSheet.flatten(wrap.props.style);
    expect(st.position).toBe('absolute');
    expect(st.left).toBeLessThan(40);
    expect(st.bottom).toBeLessThan(40);
    expect(st.top).toBeUndefined();
    rotate(IPHONE_17);
    expect(mockHost.mounts).toBe(1);
    expect(mockHost.unmounts).toBe(0);
  });
});

describe('VIEW_INSETS over the room', () => {
  it('the top bar only, in either orientation; nothing without a host', () => {
    expect(myRoomCoveredPx({ host: { x: 0, y: 0, width: 402, height: 874 }, top: { x: 0, y: 0, width: 402, height: 96 } })).toEqual({ top: 96 });
    expect(myRoomCoveredPx({ host: { x: 0, y: 0, width: 874, height: 402 } })).toEqual({ top: 0 });
    expect(myRoomCoveredPx({})).toBeNull();
  });
});
