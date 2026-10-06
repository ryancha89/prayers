/**
 * The 3D world (spec 004) as the app sees it, with the embedded player present.
 *
 * Pinned here:
 *  · the bridge: WORLD_INIT repeated until WORLD_READY, the camera / run / insets replayed on READY,
 *    a walk direction queued while loading never replayed, WORLD_END once,
 *  · the saved spot: WORLD_POSITION persisted, a nonsense spot refused, the door spent on READY,
 *  · the entry points: the Home header's 3D pill and the 월드 tab (2nd), both to the `World` route,
 *  · the screen: WORLD_INIT built from the store, Enter on WORLD_NEAR — WORLD_ENTER, nothing drawn
 *    until WORLD_ENTERED (or the fallback), My Room entered straight through its door — the right overlay per zone and
 *    every CTA's destination — with the world's UnityView unmounted BEFORE a room is navigated to,
 *    and mounted again (at that door) after coming back,
 *  · landscape: the sheet becomes the side panel, VIEW_INSETS follow, and a rotation never remounts
 *    the host.
 */
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => { store.set(k, v); },
      removeItem: async (k: string) => { store.delete(k); },
    },
  };
});
jest.mock('react-native-sound', () => null);
const mockSafe = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockSafe,
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

// Navigation: every navigate is recorded together with how many times the world's host had been
// unmounted at that moment — "the host goes down first" is the property under test.
const mockNav = {
  calls: [] as { args: unknown[]; hostUnmounts: number }[],
  listeners: {} as Record<string, Set<(e?: unknown) => void>>,
};
const mockNavigate = jest.fn((...args: unknown[]) => mockNav.calls.push({ args, hostUnmounts: mockHost.unmounts }));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: jest.fn(),
    addListener: (event: string, fn: (e?: unknown) => void) => {
      (mockNav.listeners[event] ??= new Set()).add(fn);
      return () => mockNav.listeners[event].delete(fn);
    },
  }),
  useFocusEffect: () => {},
}));
const fire = (event: string, e?: unknown) => act(() => mockNav.listeners[event]?.forEach(fn => fn(e)));

// The player as the world screen sees it: present, a real bridge, and a view that records posts.
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
import { useSoundStore } from '../src/shared/audio/store';
import { stickVector } from '../src/features/world/components/WorldJoystick';
import { WorldScreen, worldCoveredPx, HOST_REMOUNT_FALLBACK_MS, worldTiming } from '../src/features/world/screens/WorldScreen';

// Navigation waits for the native UnityView teardown on device; its own test sets it back.
worldTiming.hostReleaseMs = 0;
import { cameraFromDrag, cameraFromTwoFingers, wrapYaw } from '../src/features/world/components/useWorldCamera';
import { counselingRoster } from '../src/features/world/components/WorldSheets';
import { isSpot, useWorldStore } from '../src/features/world/store/worldStore';
import { koWith } from '../src/features/world/data/zones';
import { HomeHeader } from '../src/features/counselors/components/HomeHeader';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';
import { useLanguageStore } from '../src/shared/i18n';
import type { ViewInsetsPayload, WorldInitPayload } from '../src/features/counseling/types';

const { mockPosted } = jest.requireMock('../src/features/counseling/bridge') as {
  mockPosted: { type: string; payload?: unknown }[];
};
const posts = (type: string) => mockPosted.filter(p => p.type === type);
const fromUnity = (event: object) => act(() => nativeUnityBridge.receiveFromUnity(JSON.stringify(event)));
/** A door Unity opened and walked the player through (06-10): ARRIVED as he reaches it, ENTERED once
 *  he is through and the view is black. What WORLD_ARRIVED alone did before the doors moved. */
const throughDoor = (zone: string) => {
  fromUnity({ type: 'WORLD_ARRIVED', payload: { zone } });
  fromUnity({ type: 'WORLD_ENTERED', payload: { zone } });
};

/* ---- the bridge ---------------------------------------------------------------------------- */

function bridgeWithView() {
  const posted: { type: string; payload?: unknown }[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
  return { bridge, posted, of: (type: string) => posted.filter(p => p.type === type) };
}

describe('the world bridge', () => {
  const init: WorldInitPayload = { lang: 'ko', spawn: { x: 1, z: 2, yaw: 90 } };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('repeats WORLD_INIT until the hub answers, then stops', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openWorld(init);
    expect(of('WORLD_INIT').map(p => p.payload)).toEqual([init]);
    jest.advanceTimersByTime(1600);
    expect(of('WORLD_INIT')).toHaveLength(2);
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    jest.advanceTimersByTime(10000);
    expect(of('WORLD_INIT')).toHaveLength(2);
  });

  it('says WORLD_INIT again when the player boots underneath it (BRIDGE_READY) or a new view arrives', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openWorld(init);
    bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
    expect(of('WORLD_INIT')).toHaveLength(2);
    const view = { postMessage: jest.fn() };
    bridge.registerView(view);
    expect(view.postMessage).toHaveBeenCalledWith('RNBridge', 'OnMessage', JSON.stringify({ type: 'WORLD_INIT', payload: init }));
  });

  it('sends the sound switches to the world, and replays them after the camera and run on READY', () => {
    const { bridge, posted } = bridgeWithView();
    bridge.openWorld(init);
    bridge.sendWorldAudio(false, true);
    expect(posted.filter(p => p.type === 'WORLD_AUDIO').map(p => p.payload)).toEqual([{ music: false, sfx: true }]);
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    expect(posted.filter(p => p.type === 'WORLD_AUDIO').map(p => p.payload)).toEqual([{ music: false, sfx: true }]);
  });

  it('replays the insets, the camera and the run toggle on WORLD_READY — insets first', () => {
    const { bridge, posted } = bridgeWithView();
    const insets: ViewInsetsPayload = { top: 0.1, right: 0, bottom: 0, left: 0, landscape: false };
    bridge.sendViewInsets(insets);
    bridge.openWorld(init);
    bridge.sendWorldCamera(0.8, -0.25);
    bridge.sendWorldRun(true);
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    expect(posted.map(p => p.type).filter(t => t !== 'WORLD_AUDIO')).toEqual(['VIEW_INSETS', 'WORLD_CAMERA', 'WORLD_RUN']);
    expect(posted[1].payload).toEqual({ zoom: 0.8, yaw: -0.25, pitch: 0 });
    expect(posted[2].payload).toEqual({ on: true });
  });

  it('leaves Unity its own framing when the player never touched the camera', () => {
    const { bridge, posted } = bridgeWithView();
    bridge.openWorld(init);
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    expect(posted.map(p => p.type)).not.toContain('WORLD_CAMERA');
    expect(posted.map(p => p.type)).not.toContain('WORLD_RUN');
  });

  it('never replays a walk direction queued while the hub loaded, and passes walking through once up', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openWorld(init);
    bridge.sendEvent({ type: 'WALK_INPUT', payload: { x: 0, y: 1 } });
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    bridge.receiveFromUnity(JSON.stringify({ type: 'UNITY_READY' }));
    expect(of('WALK_INPUT')).toHaveLength(0);
    bridge.sendEvent({ type: 'WALK_INPUT', payload: { x: 1, y: 0 } });
    expect(of('WALK_INPUT').map(p => p.payload)).toEqual([{ x: 1, y: 0 }]);
  });

  it('WORLD_TAP hands a tap on, clamped to the view', () => {
    const { bridge, of } = bridgeWithView();
    bridge.sendWorldTap(0.25, 1.4);
    expect(of('WORLD_TAP')[0].payload).toEqual({ x: 0.25, y: 1 });
  });

  it('WORLD_GOTO and WORLD_CAMERA go straight out, clamped', () => {
    const { bridge, of } = bridgeWithView();
    bridge.sendWorldGoto('shop');
    bridge.sendWorldCamera(3, -9);
    expect(of('WORLD_GOTO')[0].payload).toEqual({ zone: 'shop' });
    expect(of('WORLD_CAMERA')[0].payload).toEqual({ zoom: 1, yaw: -1, pitch: 0 });
  });

  it('WORLD_ENTER goes straight out and is never replayed on READY (06-10)', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openWorld(init);
    bridge.sendWorldEnter('myroom');
    expect(of('WORLD_ENTER').map(p => p.payload)).toEqual([{ zone: 'myroom' }]);
    bridge.receiveFromUnity(JSON.stringify({ type: 'WORLD_READY' }));
    expect(of('WORLD_ENTER')).toHaveLength(1);
    bridge.closeWorld();
  });

  it('closing sends WORLD_END once, stops the retries, and a second close says nothing', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openWorld(init);
    bridge.closeWorld();
    bridge.closeWorld();
    expect(of('WORLD_END')).toHaveLength(1);
    jest.advanceTimersByTime(10000);
    expect(of('WORLD_INIT')).toHaveLength(1);
  });
});

describe('two fingers on the world', () => {
  const start = { zoom: 0.5, yaw: 0, dist: 100, angle: 0 };
  it('spreading to twice the distance is the whole zoom range', () => {
    expect(cameraFromTwoFingers(start, { pageX: 0, pageY: 0 }, { pageX: 200, pageY: 0 }).zoom).toBe(1);
    expect(cameraFromTwoFingers(start, { pageX: 0, pageY: 0 }, { pageX: 50, pageY: 0 }).zoom).toBe(0);
  });
  it('a quarter turn of the fingers is half the yaw range, and crossing ±180° does not flip it', () => {
    expect(cameraFromTwoFingers(start, { pageX: 0, pageY: 0 }, { pageX: 0, pageY: 100 }).yaw).toBeCloseTo(0.5);
    const nearPi = { ...start, angle: Math.PI - 0.1 };
    const r = cameraFromTwoFingers(nearPi, { pageX: 0, pageY: 0 }, { pageX: -100, pageY: -10 });
    expect(Math.abs(r.yaw)).toBeLessThan(0.1);
  });
});

describe('one finger looks around', () => {
  const screen = { width: 400, height: 800 };
  it('a full-width drag turns half way round, and the yaw wraps instead of stopping', () => {
    expect(Math.abs(cameraFromDrag({ yaw: 0, pitch: 0 }, -400, 0, screen).yaw)).toBeCloseTo(1); // ±1 = the same 180°
    expect(cameraFromDrag({ yaw: 0, pitch: 0 }, 200, 0, screen).yaw).toBeCloseTo(-0.5);
    expect(cameraFromDrag({ yaw: 0.9, pitch: 0 }, -80, 0, screen).yaw).toBeCloseTo(-0.9);
    expect(wrapYaw(2.5)).toBeCloseTo(0.5);
    expect(wrapYaw(-1.5)).toBeCloseTo(0.5);
  });
  it('dragging down raises the camera; half the height is the whole range, clamped', () => {
    expect(cameraFromDrag({ yaw: 0, pitch: 0 }, 0, 200, screen).pitch).toBeCloseTo(0.5);
    expect(cameraFromDrag({ yaw: 0, pitch: 0 }, 0, -2000, screen).pitch).toBe(-1);
    expect(cameraFromDrag({ yaw: 0, pitch: 0.5 }, 0, 2000, screen).pitch).toBe(1);
  });
});

/* ---- the saved spot ------------------------------------------------------------------------ */

describe('the world store', () => {
  beforeEach(async () => {
    await useWorldStore.persist.rehydrate();
    useWorldStore.setState({ position: null, returnZone: null });
  });

  it('keeps a real spot and refuses one Unity wrote as NaN', () => {
    useWorldStore.getState().setPosition({ x: 3, z: -4, yaw: 180 });
    useWorldStore.getState().setPosition({ x: 'NaN', z: 0, yaw: 0 } as never);
    expect(useWorldStore.getState().position).toEqual({ x: 3, z: -4, yaw: 180 });
    expect(isSpot({ x: 1, z: 1 })).toBe(false);
  });

  it('persists the spot across a restart, but never the door', async () => {
    useWorldStore.getState().setPosition({ x: 7, z: 8, yaw: 45 });
    useWorldStore.getState().setReturnZone('shop');
    await act(async () => {});
    const saved = JSON.parse((await AsyncStorage.getItem('prayers.world'))!);
    expect(saved.state).toEqual({ position: { x: 7, z: 8, yaw: 45 } });
    // A cold start reads it back; a stored value it cannot read spawns on the plaza.
    const merge = useWorldStore.persist.getOptions().merge!;
    const fresh = { ...useWorldStore.getState(), position: null, returnZone: null };
    expect((merge(saved.state, fresh) as typeof fresh).position).toEqual({ x: 7, z: 8, yaw: 45 });
    expect((merge({ position: { x: 'a' } }, fresh) as typeof fresh).position).toBeNull();
    expect((merge(undefined, fresh) as typeof fresh).position).toBeNull();
  });
});

/* ---- the entry points ---------------------------------------------------------------------- */

describe('the 3D pill on Home', () => {
  it('is beside the ticket pill and opens the world', () => {
    useLanguageStore.setState({ lang: 'ko' });
    const onPress3D = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<HomeHeader balanceLabel="x" onPressBalance={() => {}} onPress3D={onPress3D} />); });
    const pill = tree.root.findAll(n => n.props.accessibilityLabel === '3D 월드 열기' && typeof n.props.onPress === 'function')[0];
    expect(pill).toBeDefined();
    act(() => pill.props.onPress());
    expect(onPress3D).toHaveBeenCalled();
    act(() => tree.unmount());
  });
});

/* ---- the screen ---------------------------------------------------------------------------- */

const IPHONE_17 = { width: 402, height: 874, scale: 3, fontScale: 1 };
const IPHONE_17_SIDE = { width: 874, height: 402, scale: 3, fontScale: 1 };
type Win = typeof IPHONE_17;
let win: Win = IPHONE_17;
const dimensionListeners = new Set<(e: { window: Win; screen: Win }) => void>();
function rotate(to: Win) {
  win = to;
  act(() => dimensionListeners.forEach(h => h({ window: to, screen: to })));
}

describe('the World screen', () => {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;

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
  });

  const render = async () => {
    await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
    return tree!;
  };
  const byLabel = (label: string) =>
    tree!.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
  const press = (label: string) => {
    const node = byLabel(label);
    if (!node) throw new Error(`no button "${label}"`);
    act(() => node.props.onPress());
  };
  const overlayOpen = (zone: string) => tree!.root.findAll(n => n.props.testID === `world-overlay-${zone}`).length > 0;

  it('opens the world at the saved spot, and replays the insets when it answers', async () => {
    await render();
    expect(mockHost.mounts).toBe(1);
    expect(posts('WORLD_INIT')[0].payload).toEqual({ lang: 'ko', spawn: { x: 5, z: 6, yaw: 30 } });
    // The top bar's onLayout → VIEW_INSETS, which the hub hears again on READY.
    act(() => {
      tree!.root.findAll(n => n.props.onLayout && n.props.style && StyleSheet.flatten(n.props.style)?.flex === 1)[0]
        ?.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 402, height: 874 } } });
    });
    await act(async () => { await new Promise(r => setTimeout(r, INSETS_SETTLE_MS + 20)); });
    const before = posts('VIEW_INSETS').length;
    fromUnity({ type: 'WORLD_READY' });
    expect(posts('VIEW_INSETS').length).toBe(before + 1);
  });

  it('the Menu’s music switch reaches the world’s own audio', async () => {
    // Settle the persisted store first, or its late rehydrate overwrites the switch under the test.
    await useSoundStore.persist.rehydrate();
    useSoundStore.setState({ musicEnabled: true, sfxEnabled: true });
    await render();
    expect(posts('WORLD_AUDIO').pop()?.payload).toEqual({ music: true, sfx: true });
    await act(async () => { useSoundStore.getState().setMusicEnabled(false); });
    expect(posts('WORLD_AUDIO').pop()?.payload).toEqual({ music: false, sfx: true });
    await act(async () => { useSoundStore.getState().setMusicEnabled(true); });
  });

  const anyOverlay = () => tree!.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('world-overlay')).length;
  const stickShown = () => tree!.root.findAll(n => n.props.testID === 'world-joystick').length > 0;

  it('a door in reach shows Enter; Enter asks Unity to open it and shows nothing until it is through', async () => {
    await render();
    fromUnity({ type: 'WORLD_READY' });
    expect(byLabel('들어가기')).toBeUndefined();
    fromUnity({ type: 'WORLD_NEAR', payload: { zone: 'meditation', near: true } });
    expect(stickShown()).toBe(true);
    press('들어가기');
    expect(posts('WORLD_ENTER').map(p => p.payload)).toEqual([{ zone: 'meditation' }]);
    // The door is opening: no card yet, and nothing over the world — no Enter, no stick, no buttons.
    expect(overlayOpen('meditation')).toBe(false);
    expect(byLabel('들어가기')).toBeUndefined();
    expect(stickShown()).toBe(false);
    expect(byLabel('Map')).toBeUndefined();
    expect(byLabel('달리기')).toBeUndefined();
    expect(tree!.root.findAll(n => n.props.testID === 'world-look')).toHaveLength(0);
    fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'meditation' } });
    expect(overlayOpen('meditation')).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it('walking into a doorway (WORLD_ARRIVED): Unity opens the door itself, the screen waits for ENTERED', async () => {
    await render();
    fromUnity({ type: 'WORLD_READY' });
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'shop' } });
    expect(posts('WORLD_ENTER')).toHaveLength(0);
    expect(anyOverlay()).toBe(0);
    expect(stickShown()).toBe(false);
    fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'shop' } });
    expect(overlayOpen('shop')).toBe(true);
  });

  it('개인실 through its door goes straight into My Room, the host down first', async () => {
    await render();
    fromUnity({ type: 'WORLD_READY' });
    fromUnity({ type: 'WORLD_NEAR', payload: { zone: 'myroom', near: true } });
    press('들어가기');
    expect(posts('WORLD_ENTER').map(p => p.payload)).toEqual([{ zone: 'myroom' }]);
    fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'myroom' } });
    expect(overlayOpen('myroom')).toBe(false);
    expect(mockNav.calls.map(c => c.args)).toEqual([['MyRoom']]);
    expect(mockNav.calls[0].hostUnmounts).toBe(1);
    expect(posts('WORLD_END')).toHaveLength(1);
    expect(useWorldStore.getState().returnZone).toBe('myroom');
  });

  it('Unity never answers: after the fallback the door opens its card, as before the doors moved', async () => {
    const was = worldTiming.enterFallbackMs;
    worldTiming.enterFallbackMs = 40;
    try {
      await render();
      fromUnity({ type: 'WORLD_READY' });
      fromUnity({ type: 'WORLD_NEAR', payload: { zone: 'myroom', near: true } });
      press('들어가기');
      expect(anyOverlay()).toBe(0);
      await act(async () => { await new Promise(r => setTimeout(r, 70)); });
      // My Room's card too: it is what Enter opened before, and its 들어가기 still goes in.
      expect(overlayOpen('myroom')).toBe(true);
      expect(mockNavigate).not.toHaveBeenCalled();
      // A late ENTERED for a door already shown is harmless.
      press('닫기');
      fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'journey' } });
      await act(async () => { await new Promise(r => setTimeout(r, 70)); });
      expect(overlayOpen('journey')).toBe(true);
    } finally {
      worldTiming.enterFallbackMs = was;
    }
  });

  it('an ENTERED in time cancels the fallback; one for an unknown zone is ignored; leaving cancels the wait', async () => {
    const was = worldTiming.enterFallbackMs;
    worldTiming.enterFallbackMs = 40;
    try {
      await render();
      fromUnity({ type: 'WORLD_READY' });
      fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'counseling' } });
      fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'garden' } });
      expect(anyOverlay()).toBe(0);
      fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'counseling' } });
      expect(overlayOpen('counseling')).toBe(true);
      press('닫기');
      await act(async () => { await new Promise(r => setTimeout(r, 70)); });
      expect(anyOverlay()).toBe(0);                     // no second card from a stale timer
      // Out of the world mid-walk (the host goes down): no card pops over whatever comes next.
      fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'shop' } });
      fire('blur');
      await act(async () => { await new Promise(r => setTimeout(r, 70)); });
      expect(anyOverlay()).toBe(0);
    } finally {
      worldTiming.enterFallbackMs = was;
    }
  });

  it('leaving the door hides Enter, and an unknown zone is ignored', async () => {
    await render();
    fromUnity({ type: 'WORLD_NEAR', payload: { zone: 'shop', near: true } });
    fromUnity({ type: 'WORLD_NEAR', payload: { zone: 'shop', near: false } });
    expect(byLabel('들어가기')).toBeUndefined();
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'garden' } });
    expect(tree!.root.findAll(n => typeof n.props.testID === 'string' && n.props.testID.startsWith('world-overlay')).length).toBe(0);
  });

  it('상담의 방: four counsellors with rooms first; 상담하기 takes the host down, then opens the counsellor', async () => {
    await render();
    throughDoor('counseling');
    expect(overlayOpen('counseling')).toBe(true);
    const roster = counselingRoster('ko');
    press(roster[1].name);
    press('상담하기 →');
    expect(mockNav.calls).toHaveLength(1);
    expect(mockNav.calls[0].args).toEqual(['CounselorDetail', { counselorId: roster[1].id }]);
    // The UnityView was gone before the next screen was asked for.
    expect(mockNav.calls[0].hostUnmounts).toBe(1);
    expect(posts('WORLD_END')).toHaveLength(1);
    expect(useWorldStore.getState().returnZone).toBe('counseling');
  });

  it('back from the room: the host waits for the room to go, then the world opens at that door', async () => {
    await render();
    throughDoor('meditation');
    press('명상 시작하기 →');
    expect(mockNavigate).toHaveBeenCalledWith('MeditationRoom');
    fire('blur');
    mockPosted.length = 0;
    fire('focus');
    expect(mockHost.mounts).toBe(1);
    fire('transitionEnd', { data: { closing: false } });
    expect(mockHost.mounts).toBe(2);
    await act(async () => {});
    expect(posts('WORLD_INIT')[0].payload).toEqual({ lang: 'ko', spawn: { x: 5, z: 6, yaw: 30 }, zone: 'meditation' });
    // The door is used up once the world is back.
    fromUnity({ type: 'WORLD_READY' });
    expect(useWorldStore.getState().returnZone).toBeNull();
  });

  it('into a room on device: the next screen is asked for only after the native teardown window', async () => {
    jest.useFakeTimers();
    worldTiming.hostReleaseMs = 450;
    try {
      await render();
      throughDoor('meditation');
      press('명상 시작하기 →');
      expect(mockHost.unmounts).toBe(1);
      expect(mockNavigate).not.toHaveBeenCalled();
      act(() => { jest.advanceTimersByTime(460); });
      expect(mockNavigate).toHaveBeenCalledWith('MeditationRoom');
    } finally {
      worldTiming.hostReleaseMs = 0;
      jest.useRealTimers();
    }
  });

  it('back from the room with no transitionEnd: the fallback timer mounts the host', async () => {
    jest.useFakeTimers();
    try {
      await render();
      throughDoor('meditation');
      press('명상 시작하기 →');
      fire('focus');
      act(() => { jest.advanceTimersByTime(HOST_REMOUNT_FALLBACK_MS + 10); });
      expect(mockHost.mounts).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('명상의 방: the four session chips all open the one meditation room', async () => {
    await render();
    throughDoor('meditation');
    for (const chip of ['호흡 명상', '수면 명상', '마음 안정', '에너지 충전']) expect(byLabel(chip)).toBeDefined();
    press('수면 명상');
    expect(mockNavigate).toHaveBeenCalledWith('MeditationRoom');
  });

  it('운세 여행의 방: boards the 2027 journey, or resumes the one under way', async () => {
    await render();
    throughDoor('journey');
    expect(tree!.root.findAll(n => n.props.children === '이제, 2027년으로 출발할까요?').length).toBeGreaterThan(0);
    press('기차에 탑승하기 →');
    expect(mockNavigate).toHaveBeenCalledWith('JourneyCounselor', { journeyId: NEWYEAR_2027.id });

    act(() => tree!.unmount());
    tree = null;
    mockNavigate.mockClear();
    useJourneyPlayer.setState({ journeyId: NEWYEAR_2027.id, status: 'paused' } as never);
    await render();
    throughDoor('journey');
    press('여행 이어가기 →');
    expect(mockNavigate).toHaveBeenCalledWith('Journey');
  });

  it('상점: the four aisles are coming soon, and 코인 충전 opens the coin shop over the world', async () => {
    await render();
    throughDoor('shop');
    for (const tab of ['의상', '캐릭터', '배경', '아이템']) {
      expect(tree!.root.findAll(n => n.props.accessibilityLabel === tab).length).toBeGreaterThan(0);
    }
    press('코인 충전');
    expect(useCoins.getState().shopOpen).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(mockHost.unmounts).toBe(0);
  });

  it('개인실: the room’s card (what a door Unity never opened shows), and 들어가기 opens My Room with the host down first (02-10; myRoom.test.tsx has the rest)', async () => {
    const was = worldTiming.enterFallbackMs;
    worldTiming.enterFallbackMs = 10;
    await render();
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'myroom' } });
    await act(async () => { await new Promise(r => setTimeout(r, 30)); });
    worldTiming.enterFallbackMs = was;
    expect(overlayOpen('myroom')).toBe(true);
    expect(tree!.root.findAll(n => n.props.children === '개인실 · My Room').length).toBeGreaterThan(0);
    press('들어가기 →');
    expect(mockNav.calls.map(c => c.args)).toEqual([['MyRoom']]);
    expect(mockNav.calls[0].hostUnmounts).toBe(1);
  });

  it('상담사 둘러보기 and the 2D button go back to the Home tab', async () => {
    await render();
    throughDoor('counseling');
    press('상담사 둘러보기');
    expect(mockNavigate).toHaveBeenLastCalledWith('Tabs', { screen: 'Home' });
    press('홈으로');
    expect(mockNavigate).toHaveBeenLastCalledWith('Tabs', { screen: 'Home' });
  });

  it('Map lists the five doors and walks to one (WORLD_GOTO); Quest says soon; Menu goes to 2D', async () => {
    await render();
    fromUnity({ type: 'WORLD_READY' });
    press('Map');
    for (const label of ['상담의 방', '명상의 방', '운세 여행의 방', '상점', '개인실']) expect(byLabel(label)).toBeDefined();
    press('운세 여행의 방');
    expect(posts('WORLD_GOTO').map(p => p.payload)).toEqual([{ zone: 'journey' }]);
    // Unity walks there and says so.
    throughDoor('journey');
    expect(overlayOpen('journey')).toBe(true);
    press('닫기');

    press('Quest');
    expect(tree!.root.findAll(n => n.props.testID === 'world-sheet-quest').length).toBeGreaterThan(0);
    press('닫기');
    press('Menu');
    press('2D 화면으로 돌아가기');
    expect(mockNavigate).toHaveBeenLastCalledWith('Tabs', { screen: 'Home' });
  });

  it('a Map pick before the world is up opens the door at once instead of dropping it', async () => {
    await render();
    press('Map');
    // In the sheet: while loading, the drawn hub behind it carries the same labels (inert).
    const sheet = tree!.root.findAll(n => n.props.testID === 'world-sheet-map')[0];
    act(() => sheet.findAll(n => n.props.accessibilityLabel === '상점' && typeof n.props.onPress === 'function')[0].props.onPress());
    expect(posts('WORLD_GOTO')).toHaveLength(0);
    expect(overlayOpen('shop')).toBe(true);
  });

  it('run toggles WORLD_RUN; the walk keys stop when an overlay opens', async () => {
    await render();
    fromUnity({ type: 'WORLD_READY' });
    press('달리기');
    press('달리기');
    expect(posts('WORLD_RUN').map(p => p.payload)).toEqual([{ on: true }, { on: false }]);
    // The analogue stick (02-10) is on screen; its maths is pinned in 'the world stick' below.
    expect(tree!.root.findAll(n => n.props.testID === 'world-joystick').length).toBeGreaterThan(0);
    throughDoor('shop');
    // An overlay hides the stick; a stick at rest has nothing to stop, so nothing stray is sent.
    expect(tree!.root.findAll(n => n.props.testID === 'world-joystick').length).toBe(0);
  });

  it('persists WORLD_POSITION', async () => {
    await render();
    fromUnity({ type: 'WORLD_POSITION', payload: { x: -2, z: 11, yaw: 270 } });
    expect(useWorldStore.getState().position).toEqual({ x: -2, z: 11, yaw: 270 });
  });

  it('landscape: the sheet is the right-hand panel, and a rotation never remounts the host', async () => {
    await render();
    throughDoor('counseling');
    rotate(IPHONE_17_SIDE);
    const sheet = tree!.root.findAll(n => typeof n.props.onLayout === 'function' && StyleSheet.flatten(n.props.style)?.borderLeftWidth === 1)[0];
    expect(sheet).toBeDefined();
    expect(StyleSheet.flatten(sheet.props.style).width).toBe(341);
    rotate(IPHONE_17);
    expect(mockHost.mounts).toBe(1);
    expect(mockHost.unmounts).toBe(0);
  });
});

describe('VIEW_INSETS over the world', () => {
  it('portrait: the top bar, and an open sheet along the bottom', () => {
    const host = { x: 0, y: 0, width: 402, height: 874 };
    expect(worldCoveredPx({ host, top: { x: 0, y: 0, width: 402, height: 96 } }, false)).toEqual({ top: 96 });
    expect(worldCoveredPx({ host, top: { x: 0, y: 0, width: 402, height: 96 }, sheet: { x: 0, y: 474, width: 402, height: 400 } }, false))
      .toEqual({ top: 96, bottom: 400 });
  });
  it('landscape: an open sheet down the right', () => {
    const host = { x: 0, y: 0, width: 874, height: 402 };
    expect(worldCoveredPx({ host, top: { x: 0, y: 0, width: 874, height: 48 }, sheet: { x: 533, y: 0, width: 341, height: 402 } }, true))
      .toEqual({ top: 48, right: 341 });
  });
});

describe('the Korean line names the counsellor with the right particle', () => {
  it('와 after a vowel, 과 after a final consonant', () => {
    expect(koWith('테오')).toBe('테오와');
    expect(koWith('윤정')).toBe('윤정과');
    expect(koWith('Theo')).toBe('Theo와');
  });
});

describe('the world stick', () => {
  it('pushed to the rim is full speed that way; a resting thumb sends the stop', () => {
    expect(stickVector(0, -200)).toMatchObject({ x: 0, y: 1 });
    expect(stickVector(200, 0)).toMatchObject({ x: 1, y: 0 });
    const diag = stickVector(100, -100);
    expect(Math.hypot(diag.x, diag.y)).toBeCloseTo(1, 1);
    expect(stickVector(2, -3)).toMatchObject({ x: 0, y: 0 });
    // Half-way is slower than full, not 0.5 exactly (rescaled past the dead-zone).
    const half = stickVector(0, -20);
    expect(half.y).toBeGreaterThan(0);
    expect(half.y).toBeLessThan(0.6);
  });
});
