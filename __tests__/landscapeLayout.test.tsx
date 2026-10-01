/**
 * Landscape (01-10: "when user change to landscape the mobile app need to be played in landscape
 * mode").
 *
 * Held sideways a phone is 402pt tall, and the screens over the 3D rooms were one portrait column:
 * the journey's panel, the consultation's stack and the meditation ring stacked past the bottom of
 * the window. Landscape splits instead — the scene keeps the left ~60%, the UI moves into a panel
 * on the right — and Unity is told how much of its view is covered (VIEW_INSETS) so it can frame
 * the counsellor into what is left. Pinned here:
 *   · the screen metrics in both orientations (useScreen / screenOf),
 *   · the VIEW_INSETS sender: values per orientation, dedupe, replay on every room's READY,
 *   · the journey laid out with the side panel, its overlay cards able to fit their window, and the
 *     same for the consultation overlay,
 *   · a rotation mid-journey keeps the player where they were and never remounts the UnityHost —
 *     a remount reloads the cabin.
 */
import React from 'react';
import { Dimensions, ScrollView } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
// No SafeAreaProvider in a test tree: the insets come from here (zero unless a test sets them).
const mockSafe = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockSafe,
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn(), bellIn: jest.fn(), bellOut: jest.fn() },
}));
jest.mock('../src/shared/audio/backgroundMusic', () => ({
  backgroundMusic: { start: jest.fn(), pause: jest.fn(), stop: jest.fn(), release: jest.fn(), duck: jest.fn() },
}));
jest.mock('../src/features/meditation/guideVoice', () => ({ guideVoice: { play: jest.fn(), pause: jest.fn(), stop: jest.fn() } }));
jest.mock('../src/shared/device/keepAwake', () => ({ holdScreenAwake: () => () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [1, 2, 3, 5, 6, 7, 8, 9, 10],
  dropPendingBeatLines: jest.fn(),
  openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(),
  sayBeatLine: jest.fn(),
  stopBeatVoice: jest.fn(),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: () => () => {} }),
  useFocusEffect: () => {},
}));
// The embedded player as the room screens see it: present, and a real bridge to talk to. The host
// itself is a stand-in that counts its mounts — a second mount is a cabin reload on a device.
jest.mock('../src/features/counseling/bridge', () => {
  const { NativeUnityBridge } = jest.requireActual('../src/features/counseling/bridge/NativeUnityBridge');
  const bridge = new NativeUnityBridge();
  return { isNativeUnity: () => true, nativeUnityBridge: bridge, getUnityBridge: () => bridge };
});
const mockHost = { mounts: 0, unmounts: 0 };
jest.mock('../src/features/counseling/components/UnityHost', () => {
  const R = jest.requireActual('react');
  return {
    UnityHost: () => {
      R.useEffect(() => {
        mockHost.mounts += 1;
        return () => {
          mockHost.unmounts += 1;
        };
      }, []);
      return null;
    },
  };
});

import { screenOf, COLUMN_MAX } from '../src/shared/device/screen';
import { INSETS_SETTLE_MS, viewInsetsOf } from '../src/features/counseling/bridge/viewInsets';
import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import { MockUnityBridge } from '../src/features/counseling/bridge/MockUnityBridge';
import { nativeUnityBridge } from '../src/features/counseling/bridge';
import { JourneyScreen, journeyCoveredPx } from '../src/features/journey/screens/JourneyScreen';
import { JourneyStageOverlay } from '../src/features/journey/components/JourneyStageOverlay';
import { lookFromDrag } from '../src/features/journey/components/useCabinCamera';
import { ConsultationOverlay } from '../src/features/counseling/components/ConsultationOverlay';
import { roomCoveredPx } from '../src/features/counseling/screens/CounselingRoomScreen';
import { MeditationRoomScreen, meditationCoveredPx } from '../src/features/meditation/screens/MeditationRoomScreen';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';
import { useLanguageStore } from '../src/shared/i18n';
import type { FlowState } from '../src/features/counseling/flow/engine';
import type { JourneyContent, JourneyPart } from '../src/features/journey/types';
import type { ViewInsetsPayload } from '../src/features/counseling/types';

const IPHONE_17 = { width: 402, height: 874, scale: 3, fontScale: 1 };
const IPHONE_17_SIDE = { width: 874, height: 402, scale: 3, fontScale: 1 };
const SE = { width: 375, height: 667, scale: 2, fontScale: 1 };
const SE_SIDE = { width: 667, height: 375, scale: 2, fontScale: 1 };

/* ---- the window, and turning it ------------------------------------------------------------ */

type Win = typeof IPHONE_17;
let win: Win = IPHONE_17;
const dimensionListeners = new Set<(e: { window: Win; screen: Win }) => void>();
beforeEach(() => {
  win = IPHONE_17;
  dimensionListeners.clear();
  jest.spyOn(Dimensions, 'get').mockImplementation(() => win as never);
  jest.spyOn(Dimensions, 'addEventListener').mockImplementation(((_type: string, handler: never) => {
    dimensionListeners.add(handler);
    return { remove: () => dimensionListeners.delete(handler) };
  }) as never);
});
afterEach(() => jest.restoreAllMocks());

/** The phone turns: every useWindowDimensions hears it, the way the native event reaches them. */
function rotate(to: Win) {
  win = to;
  act(() => dimensionListeners.forEach(h => h({ window: to, screen: to })));
}

/* ---- screen metrics -------------------------------------------------------------------------- */

describe('useScreen follows the orientation', () => {
  it('portrait is unchanged: no side panel, the column is the window', () => {
    const s = screenOf(IPHONE_17.width, IPHONE_17.height);
    expect(s).toMatchObject({ landscape: false, sidePanel: 0, column: 402, short: 402, long: 874, isCompact: false });
    expect(s.vh(0.38, 180, 320)).toBe(320);
  });

  it('iPhone 17 sideways (874×402): a ~39% side panel, a capped column, heights of 402', () => {
    const s = screenOf(IPHONE_17_SIDE.width, IPHONE_17_SIDE.height);
    expect(s.landscape).toBe(true);
    expect(s.sidePanel).toBe(341);
    expect(s.sidePanel / s.width).toBeGreaterThanOrEqual(0.38);
    expect(s.sidePanel / s.width).toBeLessThanOrEqual(0.4);
    expect(s.column).toBe(COLUMN_MAX);
    expect(s.short).toBe(402);
    // Vertical room is tight held sideways, whatever the phone.
    expect(s.isCompact).toBe(true);
    expect(s.vh(0.38, 120, 320)).toBe(153);
    expect(s.vw(0.5, 0, 1000)).toBe(437);
  });

  it('SE sideways (667×375): the panel keeps a usable floor and the scene still keeps the most', () => {
    const s = screenOf(SE_SIDE.width, SE_SIDE.height);
    expect(s.sidePanel).toBe(260);
    expect(s.width - s.sidePanel).toBeGreaterThan(s.width * 0.55);
    expect(s.column).toBe(560);
    expect(screenOf(SE.width, SE.height).landscape).toBe(false);
  });
});

describe('the cabin camera drag feels the same either way up', () => {
  it('the same thumb movement turns the camera the same amount in portrait and landscape', () => {
    const start = { yaw: 0, pitch: 0 };
    expect(lookFromDrag(start, -100, 50, IPHONE_17)).toEqual(lookFromDrag(start, -100, 50, IPHONE_17_SIDE));
    expect(lookFromDrag(start, -1000, 1000, IPHONE_17_SIDE)).toEqual({ yaw: 1, pitch: 1 });
  });
});

/* ---- VIEW_INSETS ------------------------------------------------------------------------------- */

function bridgeWithView() {
  const posted: { type: string; payload?: unknown }[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
  return { bridge, posted, insets: () => posted.filter(p => p.type === 'VIEW_INSETS').map(p => p.payload as ViewInsetsPayload) };
}

describe('VIEW_INSETS values per orientation', () => {
  it('portrait journey: the header across the top, the panel ≈ 0.40 along the bottom', () => {
    const host = { x: 0, y: 0, width: 402, height: 874 };
    const covered = journeyCoveredPx({
      host,
      header: { x: 0, y: 62, width: 402, height: 44 },
      body: { x: 0, y: 106, width: 402, height: 734 },
      panel: { x: 0, y: 418, width: 402, height: 316 },
    }, false);
    expect(viewInsetsOf(host, covered!, false)).toEqual({ top: 0.12, right: 0, bottom: 0.4, left: 0, landscape: false });
  });

  it('landscape journey: the panel ≈ 0.39 down the right, nothing along the bottom', () => {
    const host = { x: 0, y: 0, width: 874, height: 402 };
    const covered = journeyCoveredPx({
      host,
      header: { x: 0, y: 0, width: 874, height: 44 },
      body: { x: 0, y: 44, width: 874, height: 337 },
      panel: { x: 533, y: 0, width: 341, height: 337 },
    }, true);
    expect(viewInsetsOf(host, covered!, true)).toEqual({ top: 0.11, right: 0.39, bottom: 0, left: 0, landscape: true });
  });

  it('the room and the meditation report the same way, and a missing panel covers nothing', () => {
    const host = { x: 0, y: 0, width: 874, height: 402 };
    expect(roomCoveredPx({ host, topBar: { x: 0, y: 0, width: 874, height: 48 }, panel: { x: 533, y: 48, width: 341, height: 354 } }, true))
      .toEqual({ top: 48, right: 341 });
    expect(roomCoveredPx({ host, topBar: { x: 0, y: 0, width: 874, height: 48 } }, true)).toEqual({ top: 48 });
    expect(meditationCoveredPx({
      host,
      header: { x: 0, y: 0, width: 874, height: 56 },
      body: { x: 24, y: 56, width: 826, height: 325 },
      panel: { x: 485, y: 0, width: 341, height: 325 },
    }, true)).toEqual({ top: 56, right: 365 });
  });

  it('clamps to 0..1 and never sends a non-number', () => {
    expect(viewInsetsOf({ width: 400, height: 800 }, { top: -5, right: 900, bottom: NaN }, false))
      .toEqual({ top: 0, right: 1, bottom: 0, left: 0, landscape: false });
  });
});

describe('the VIEW_INSETS sender', () => {
  const portrait: ViewInsetsPayload = { top: 0.12, right: 0, bottom: 0.4, left: 0, landscape: false };
  const landscape: ViewInsetsPayload = { top: 0.11, right: 0.39, bottom: 0, left: 0, landscape: true };

  it('posts straight through, and drops a repeat of what was last said', () => {
    const { bridge, insets } = bridgeWithView();
    bridge.sendViewInsets(portrait);
    bridge.sendViewInsets({ ...portrait });
    expect(insets()).toEqual([portrait]);
    bridge.sendViewInsets(landscape);
    bridge.sendViewInsets(landscape);
    expect(insets()).toEqual([portrait, landscape]);
  });

  it.each(['JOURNEY_READY', 'MEDITATION_READY', 'UNITY_READY'])('replays the latest on %s, even unchanged', ready => {
    const { bridge, insets } = bridgeWithView();
    bridge.sendViewInsets(portrait);
    bridge.sendViewInsets(landscape);
    bridge.receiveFromUnity(JSON.stringify({ type: ready }));
    expect(insets()).toEqual([portrait, landscape, landscape]);
  });

  it('remembers what was reported before there was a view, and says it when the room comes up', () => {
    const posted: { type: string; payload?: unknown }[] = [];
    const bridge = new NativeUnityBridge();
    bridge.sendViewInsets(landscape);
    bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
    expect(posted.filter(p => p.type === 'VIEW_INSETS')).toHaveLength(0);
    bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
    expect(posted.filter(p => p.type === 'VIEW_INSETS').map(p => p.payload)).toEqual([landscape]);
  });

  it('a new view is told again, not deduplicated against the old one', () => {
    const { bridge, insets } = bridgeWithView();
    bridge.sendViewInsets(portrait);
    const view = { postMessage: jest.fn() };
    bridge.registerView(view);
    bridge.sendViewInsets(portrait);
    expect(insets()).toHaveLength(1);
    expect(view.postMessage).toHaveBeenCalledWith('RNBridge', 'OnMessage', JSON.stringify({ type: 'VIEW_INSETS', payload: portrait }));
  });

  it('the mock bridge accepts it', () => {
    const mock = new MockUnityBridge();
    mock.sendViewInsets(landscape);
    expect(mock.lastViewInsets).toEqual(landscape);
  });
});

/* ---- the journey, held sideways ---------------------------------------------------------------- */

const locked = (id: string): JourneyPart => ({ momentId: id, unlocked: false, label: `L ${id}`, teaser: `Offer ${id}`, text: null, cards: [] });
const free = (): JourneyPart => ({ momentId: null, unlocked: true, label: null, teaser: null, text: 'A short line.', cards: [] });
function content(): JourneyContent {
  return {
    journey: 'newyear-2027', year: 2027, counselor: 'theo', momentPrice: 100,
    chapters: NEWYEAR_2027.chapters.map(c => ({
      id: c.id, narration: 'A short line.', cards: [],
      parts: c.id === 'monthly' ? [free(), locked('monthly#0'), locked('monthly#1'), locked('monthly#2'), locked('monthly#3')] : [free(), locked(`${c.id}#0`)],
      card: null,
    })),
    summary: { bestMonths: [], cautionMonths: [], keywords: ['k'], months: [] },
  };
}
const CAREER = NEWYEAR_2027.chapters.findIndex(c => c.id === 'career');

/** Mid-journey at career's lock: the paid moment's offer is on screen. */
function atLock() {
  useJourneyPlayer.setState({
    journeyId: NEWYEAR_2027.id, counselorId: 'theo', tone: 'theo', lang: 'en', content: content(),
    chapterIndex: CAREER, partIndex: 1, status: 'paused', stage: '', moment: 'locked', momentId: 'career#0',
    position: 12, duration: 40, transitionTo: null, activeCard: null, unlocking: false, unlockError: null,
  });
}

/** Every host node whose style (flattened) matches. */
function nodesWithStyle(tree: ReactTestRenderer.ReactTestRenderer, match: (s: Record<string, unknown>) => boolean) {
  return tree.root.findAll(n => {
    if (typeof n.type !== 'string') return false;
    const flat = [n.props.style].flat(Infinity).filter(Boolean).reduce((a: object, b: object) => ({ ...a, ...b }), {});
    return match(flat as Record<string, unknown>);
  });
}
const layout = (x: number, y: number, width: number, height: number) => ({ nativeEvent: { layout: { x, y, width, height } }, persist: () => {} });

describe('the journey in landscape', () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  beforeEach(async () => {
    await useLanguageStore.persist.rehydrate();
    useLanguageStore.setState({ lang: 'en' });
    mockHost.mounts = 0;
    mockHost.unmounts = 0;
    atLock();
  });
  afterEach(() => {
    act(() => tree?.unmount());
    useJourneyPlayer.getState().stop();
  });

  it('puts the panel down the right at the side-panel width, beside the window', () => {
    win = IPHONE_17_SIDE;
    act(() => {
      tree = ReactTestRenderer.create(<JourneyScreen />);
    });
    expect(nodesWithStyle(tree, s => s.flexDirection === 'row' && s.flex === 1)).not.toHaveLength(0);
    expect(nodesWithStyle(tree, s => s.width === 341 && s.borderLeftWidth === 1)).toHaveLength(1);
  });

  it('runs the panel to the screen edge past the Dynamic Island, its content kept clear of it', () => {
    // iPhone 17 on its side: the island side and the far side both report 62 pt, the home bar 21.
    Object.assign(mockSafe, { left: 62, right: 62, bottom: 21 });
    win = IPHONE_17_SIDE;
    act(() => {
      tree = ReactTestRenderer.create(<JourneyScreen />);
    });
    // The panel's box reaches the edge (341 for content + 62), and pads its content back in.
    expect(nodesWithStyle(tree, s => s.width === 341 + 62 && s.paddingRight === 62 && s.paddingBottom === 21)).toHaveLength(1);
    // The window stays clear of the island on its own side, not by a whole-screen safe area.
    expect(nodesWithStyle(tree, s => s.marginLeft === 62 + 4)).not.toHaveLength(0);
    Object.assign(mockSafe, { left: 0, right: 0, bottom: 0 });
  });

  it('reports what the panel covers to the cabin, and says it again when the cabin comes up', () => {
    const sent = jest.spyOn(nativeUnityBridge, 'sendViewInsets');
    win = IPHONE_17_SIDE;
    act(() => {
      tree = ReactTestRenderer.create(<JourneyScreen />);
    });
    const byLayoutOrder = tree.root.findAll(n => typeof n.type === 'string' && typeof n.props.onLayout === 'function');
    // stage (host) → header → body → panel, in render order.
    const [host, header, body, panel] = byLayoutOrder;
    jest.useFakeTimers();
    act(() => {
      host.props.onLayout(layout(0, 0, 874, 402));
      header.props.onLayout(layout(0, 0, 874, 44));
      // A rotation lays out in passes: a half-laid-out panel first (sim 01-10), then the real one.
      body.props.onLayout(layout(0, 44, 874, 337));
      panel.props.onLayout(layout(80, 0, 794, 337));
      panel.props.onLayout(layout(533, 0, 341, 337));
    });
    expect(sent).not.toHaveBeenCalledWith(expect.objectContaining({ right: 0.91 }));
    act(() => jest.advanceTimersByTime(INSETS_SETTLE_MS));
    jest.useRealTimers();
    expect(sent).toHaveBeenCalledTimes(1);
    expect(sent).toHaveBeenLastCalledWith({ top: 0.11, right: 0.39, bottom: 0, left: 0, landscape: true });

    // The cabin answers: it is told again, before anything frames a shot.
    const posted: { type: string; payload?: unknown }[] = [];
    const view = { postMessage: (_g: string, _m: string, message: string) => posted.push(JSON.parse(message)) };
    nativeUnityBridge.registerView(view);
    act(() => nativeUnityBridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' })));
    expect(posted.filter(p => p.type === 'VIEW_INSETS').map(p => p.payload))
      .toEqual([{ top: 0.11, right: 0.39, bottom: 0, left: 0, landscape: true }]);
    nativeUnityBridge.unregisterView(view);
  });

  it('a rotation mid-journey keeps the lock on screen and the player where it was, and never remounts the cabin', () => {
    act(() => {
      tree = ReactTestRenderer.create(<JourneyScreen />);
    });
    const before = useJourneyPlayer.getState();
    expect(tree.root.findAllByProps({ children: 'Offer career#0' }).length).toBeGreaterThan(0);

    rotate(IPHONE_17_SIDE);
    expect(nodesWithStyle(tree, s => s.width === 341 && s.borderLeftWidth === 1)).toHaveLength(1);
    rotate(IPHONE_17);
    rotate(SE_SIDE);

    const after = useJourneyPlayer.getState();
    expect(after).toMatchObject({
      chapterIndex: before.chapterIndex, partIndex: before.partIndex, status: before.status,
      moment: 'locked', momentId: 'career#0', position: before.position,
    });
    expect(tree.root.findAllByProps({ children: 'Offer career#0' }).length).toBeGreaterThan(0);
    expect(mockHost).toEqual({ mounts: 1, unmounts: 0 });
  });
});

describe('the journey overlays fit a short window', () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  beforeEach(async () => {
    await useLanguageStore.persist.rehydrate();
    useLanguageStore.setState({ lang: 'en' });
    win = IPHONE_17_SIDE;
    atLock();
  });
  afterEach(() => {
    act(() => tree?.unmount());
    useJourneyPlayer.getState().stop();
  });
  const render = () => act(() => {
    tree = ReactTestRenderer.create(<JourneyStageOverlay journey={NEWYEAR_2027} />);
  });
  /** A button's text is never inside a ScrollView: a scroll can be pushed past the window's
   *  bottom, and a touch outside the overlay's bounds reaches nothing (sim QA 01-10). */
  const buttonOutsideScroll = (label: string) => {
    const text = tree.root.findAll(n => n.props.children === label && typeof n.type !== 'string')[0];
    expect(text).toBeDefined();
    let n: ReactTestRenderer.ReactTestInstance | null = text;
    while (n) {
      expect(n.type).not.toBe(ScrollView);
      n = n.parent;
    }
  };

  it('the lock: the offer scrolls, unlock and later never do', () => {
    render();
    buttonOutsideScroll('Maybe later');
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(1);
  });

  it('the reveal card lies on its side, capped at the window, with Continue outside the scroll', () => {
    useJourneyPlayer.setState({ moment: 'premium', stage: 'reveal', reveal: { at: 0, title: 'The turn', months: [5], description: 'A door opens.', stars: 4 } });
    render();
    expect(nodesWithStyle(tree, s => s.flexDirection === 'row' && s.maxHeight === '100%')).toHaveLength(1);
    buttonOutsideScroll('Continue →');
  });

  it('the title card and the quarter list are capped at the window; their buttons stay outside the scroll', () => {
    useJourneyPlayer.setState({ moment: '', stage: 'title' });
    render();
    expect(nodesWithStyle(tree, s => s.maxHeight === '100%' && s.borderRadius !== undefined).length).toBeGreaterThan(0);
    act(() => tree.unmount());
    const monthly = NEWYEAR_2027.chapters.findIndex(c => c.id === 'monthly');
    useJourneyPlayer.setState({ chapterIndex: monthly, stage: 'quarters' });
    render();
    // The list is the only thing that scrolls, and it is what gives way.
    const lists = tree.root.findAllByType(ScrollView);
    expect(lists).toHaveLength(1);
    expect([lists[0].props.style].flat()).toEqual(expect.arrayContaining([expect.objectContaining({ flexShrink: 1 })]));
  });
});

/* ---- the consultation overlay, held sideways ----------------------------------------------------- */

const loop: FlowState = {
  phaseId: 'PLOOP', screen: 'loop', speaker: '상담사', line: '', choices: [], canTap: false, inputEnabled: true,
  notice: null, report: null, tone: '', emotion: 'neutral',
  transcript: [{ role: 'counselor', text: '어서 오세요.' }, { role: 'user', text: '안녕하세요.' }],
  suggestion: '', topic: '', finished: false, pending: false, speaking: false,
  mic: { state: 'idle', level: 0, error: '', offered: true },
};

describe('the consultation overlay in landscape', () => {
  it('becomes a right-hand panel under the top bar, and its panels fit the height', async () => {
    win = IPHONE_17_SIDE;
    const reported: unknown[] = [];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <ConsultationOverlay state={loop} onTap={() => {}} onChoose={() => {}} onSubmit={() => {}} onRetry={() => {}}
          onLeave={() => {}} panelTop={48} onPanelLayout={r => reported.push(r)} />,
      );
    });
    const panel = nodesWithStyle(tree, s => s.position === 'absolute' && s.right === 0 && s.width === 341);
    expect(panel).toHaveLength(1);
    expect([panel[0].props.style].flat(Infinity)).toEqual(expect.arrayContaining([expect.objectContaining({ top: 48 })]));
    const heights = nodesWithStyle(tree, s => typeof s.maxHeight === 'number').map(n =>
      [n.props.style].flat(Infinity).reduce((a: number, s: { maxHeight?: number } | null) => s?.maxHeight ?? a, 0));
    expect(heights.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(IPHONE_17_SIDE.height - 48);
    // KeyboardAvoidingView measures itself first and hands the event on after an await.
    await act(async () => panel[0].props.onLayout(layout(533, 48, 341, 354)));
    expect(reported).toEqual([{ x: 533, y: 48, width: 341, height: 354 }]);
    act(() => tree.unmount());
  });
});

/* ---- the meditation room, turned mid-breath ------------------------------------------------------ */

describe('the meditation room in landscape', () => {
  beforeEach(async () => {
    await useLanguageStore.persist.rehydrate();
    useLanguageStore.setState({ lang: 'en' });
    mockHost.mounts = 0;
    mockHost.unmounts = 0;
  });

  it('a session that is running keeps running through a rotation, on the same room', () => {
    jest.useFakeTimers();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(<MeditationRoomScreen />);
    });
    const begin = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === 'Begin').length > 0);
    expect(begin.length).toBeGreaterThan(0);
    act(() => begin[0].props.onPress());
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    expect(tree.root.findAll(n => n.props.children === 'Pause').length).toBeGreaterThan(0);

    rotate(IPHONE_17_SIDE);
    // The ring, the clock and the button moved into the right-hand panel…
    expect(nodesWithStyle(tree, s => s.width === 341 && s.flex === 0)).toHaveLength(1);
    act(() => {
      jest.advanceTimersByTime(3000);
    });
    rotate(IPHONE_17);

    // …and the session never noticed.
    expect(tree.root.findAll(n => n.props.children === 'Pause').length).toBeGreaterThan(0);
    expect(mockHost).toEqual({ mounts: 1, unmounts: 0 });
    act(() => tree.unmount());
    jest.useRealTimers();
  });
});
