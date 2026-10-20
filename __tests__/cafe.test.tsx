/**
 * The coffee shop (Afterglow, the world's sixth door, 16-10) as the app sees it, with the embedded
 * player present.
 *
 * Pinned here:
 *  · the zones: six doors, `cafe` among them with its copy in every language, and the drawn hub's
 *    labels in the hall's left→right order with no two of a row touching on a 375 pt phone,
 *  · the bridge: CAFE_INIT repeated until CAFE_READY (and again when the player boots underneath it
 *    or a new view arrives), insets then the orbit replayed on READY, a stick queued while loading
 *    dropped, CAFE_END once,
 *  · the way in: through the cafe door the world's host goes down FIRST, then the Cafe route opens,
 *    remembering the door,
 *  · the screen: CAFE_INIT carries the language, the host and the account; the veil until READY;
 *    CAFE_NEAR offers the seats Unity named; seated, a message goes out as CAFE_SAY and the answer
 *    (or the worded error) comes back in the panel; a seat that failed says why; back goes back.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

// Whole-flow tests render the cafe many times over; under a parallel run they pass 5 s.
jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: jest.fn() }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
// The cafe mints the Game-Token (shared rooms) before it opens; here it is already at hand.
jest.mock('../src/features/auth/api/session', () => ({ ensureGameToken: async () => 'pgt_test' }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('../src/features/tickets/api/attendance', () => ({ fetchAttendance: async () => null, checkIn: jest.fn() }));
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [], dropPendingBeatLines: jest.fn(), openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(), sayBeatLine: jest.fn(), stopBeatVoice: jest.fn(),
}));

const mockNav = {
  calls: [] as { args: unknown[]; hostUnmounts: number }[],
  listeners: {} as Record<string, Set<(e?: unknown) => void>>,
};
const mockNavigate = jest.fn((...args: unknown[]) => mockNav.calls.push({ args, hostUnmounts: mockHost.unmounts }));
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useRoute: () => ({ params: undefined }),
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
    getCafeBridge: () => bridge,
    unityApiBase: 'http://localhost:4000',
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
import { CAFE_HOME, CafeScreen, cafeCoveredPx, guestName, replyErrorKey, spotLabel } from '../src/features/cafe/screens/CafeScreen';
import { WorldScreen, worldTiming } from '../src/features/world/screens/WorldScreen';
import { WORLD_ZONES, isWorldZone } from '../src/features/world/data/zones';
import { LABEL_AT, LABEL_W } from '../src/features/world/components/WorldHubArt';
import { useWorldStore } from '../src/features/world/store/worldStore';
import { useLanguageStore } from '../src/shared/i18n';
import { translations } from '../src/shared/i18n/translations';
import { useAuthStore } from '../src/features/auth/store/authStore';
import type { CafeInitPayload, ViewInsetsPayload } from '../src/features/counseling/types';

worldTiming.hostReleaseMs = 0;

const { mockPosted } = jest.requireMock('../src/features/counseling/bridge') as {
  mockPosted: { type: string; payload?: unknown }[];
};
const posts = (type: string) => mockPosted.filter(p => p.type === type);
const fromUnity = (event: object) => act(() => nativeUnityBridge.receiveFromUnity(JSON.stringify(event)));

/* ---- the zones ----------------------------------------------------------------------------- */

describe('the sixth door', () => {
  it('is a zone, with a label and a line in every language', () => {
    expect(WORLD_ZONES.map(z => z.id)).toEqual(['counseling', 'meditation', 'journey', 'shop', 'myroom', 'cafe']);
    expect(isWorldZone('cafe')).toBe(true);
    for (const lang of Object.keys(translations) as (keyof typeof translations)[]) {
      const table = translations[lang] as Record<string, string>;
      expect([lang, table['world.zone.cafe']?.length > 0, table['world.zone.cafe.sub']?.length > 0]).toEqual([lang, true, true]);
    }
    expect((translations.en as Record<string, string>)['world.zone.myroom']).toBe('Personal Room');
    expect((translations.en as Record<string, string>)['world.zone.cafe']).toBe('Coffee Shop');
  });

  it('puts the drawn hub’s six labels in the hall’s order, none touching on a 375 pt phone', () => {
    const order = Object.entries(LABEL_AT).sort((a, b) => a[1].x - b[1].x).map(([id]) => id);
    expect(order).toEqual(['journey', 'shop', 'counseling', 'meditation', 'cafe', 'myroom']);
    // Side doors low, back diagonals higher, the centre pair highest.
    expect(LABEL_AT.myroom.y).toBe(LABEL_AT.journey.y);
    expect(LABEL_AT.shop.y).toBe(LABEL_AT.cafe.y);
    expect(LABEL_AT.counseling.y).toBe(LABEL_AT.meditation.y);
    expect(LABEL_AT.counseling.y).toBeLessThan(LABEL_AT.shop.y);
    expect(LABEL_AT.shop.y).toBeLessThan(LABEL_AT.journey.y);
    const W = 375;
    const zones = Object.values(LABEL_AT);
    for (const a of zones) {
      expect(a.x * W - LABEL_W / 2).toBeGreaterThanOrEqual(0);
      expect(a.x * W + LABEL_W / 2).toBeLessThanOrEqual(W);
      for (const b of zones) {
        if (a === b || a.y !== b.y) continue;
        expect(Math.abs(a.x - b.x) * W).toBeGreaterThanOrEqual(LABEL_W);
      }
    }
  });
});

/* ---- the bridge ---------------------------------------------------------------------------- */

function bridgeWithView() {
  const posted: { type: string; payload?: unknown }[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
  return { bridge, posted, of: (type: string) => posted.filter(p => p.type === type) };
}

describe('the cafe bridge', () => {
  const init: CafeInitPayload = { lang: 'ko', apiBase: 'http://localhost:4000', auth: 'uid-1' };
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('repeats CAFE_INIT until the cafe answers, then stops; gives up after four retries', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openCafe(init);
    expect(of('CAFE_INIT').map(p => p.payload)).toEqual([init]);
    jest.advanceTimersByTime(1600);
    expect(of('CAFE_INIT')).toHaveLength(2);
    bridge.receiveFromUnity(JSON.stringify({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: ['bar'] } }));
    jest.advanceTimersByTime(10000);
    expect(of('CAFE_INIT')).toHaveLength(2);

    const other = bridgeWithView();
    other.bridge.openCafe(init);
    jest.advanceTimersByTime(60000);
    expect(other.of('CAFE_INIT')).toHaveLength(5);
  });

  it('says CAFE_INIT again when the player boots underneath it or a new view arrives', () => {
    const { bridge, of } = bridgeWithView();
    bridge.openCafe(init);
    bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
    expect(of('CAFE_INIT')).toHaveLength(2);
    const view = { postMessage: jest.fn() };
    bridge.registerView(view);
    expect(view.postMessage).toHaveBeenCalledWith('RNBridge', 'OnMessage', JSON.stringify({ type: 'CAFE_INIT', payload: init }));
  });

  it('replays the insets, then the orbit, on CAFE_READY, and drops a stick queued while loading', () => {
    const { bridge, posted } = bridgeWithView();
    const insets: ViewInsetsPayload = { top: 0.1, right: 0, bottom: 0.4, left: 0, landscape: false };
    bridge.sendViewInsets(insets);
    bridge.openCafe(init);
    bridge.sendCafeCamera({ zoom: 7, yaw: -0.4, pitch: Number.NaN });
    bridge.unregisterView(bridge as never);
    // Not ready: a stick is queued (sendEvent), and must not walk the player once the cafe is up.
    bridge.sendEvent({ type: 'WALK_INPUT', payload: { x: 0, y: 1 } });
    posted.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: [] } }));
    expect(posted.map(p => p.type)).toEqual(['VIEW_INSETS', 'CAFE_CAMERA']);
    expect(posted[1].payload).toEqual({ zoom: 1, yaw: -0.4, pitch: 0 });
    bridge.sendEvent({ type: 'WALK_INPUT', payload: { x: 1, y: 0 } });
    expect(posted.filter(p => p.type === 'WALK_INPUT').map(p => p.payload)).toEqual([{ x: 1, y: 0 }]);
  });

  it('CAFE_END once, and only for a cafe that was opened', () => {
    const { bridge, of } = bridgeWithView();
    bridge.closeCafe();
    expect(of('CAFE_END')).toHaveLength(0);
    bridge.openCafe(init);
    bridge.closeCafe();
    bridge.closeCafe();
    expect(of('CAFE_END')).toHaveLength(1);
  });
});

/* ---- the screens --------------------------------------------------------------------------- */

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
const byLabel = (label: string) =>
  tree!.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const press = (label: string) => {
  const node = byLabel(label);
  if (!node) throw new Error(`no button "${label}"`);
  act(() => node.props.onPress());
};
const byTestID = (id: string) => tree!.root.findAll(n => n.props.testID === id);
const textOf = (id: string) => {
  const node = byTestID(id)[0];
  const kids = node?.props.children;
  return Array.isArray(kids) ? kids.join('') : String(kids ?? '');
};

beforeEach(async () => {
  await useWorldStore.persist.rehydrate();
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'ko' });
  useWorldStore.setState({ position: { x: 5, z: 6, yaw: 30 }, returnZone: null });
  useAuthStore.setState({ userAuth: 'acct-42' } as never);
  mockPosted.length = 0;
  mockNav.calls.length = 0;
  mockNav.listeners = {};
  mockNavigate.mockClear();
  mockGoBack.mockClear();
  mockHost.mounts = 0;
  mockHost.unmounts = 0;
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe('the world’s cafe door', () => {
  it('through the door: coffee or a reading is chosen out here, then the world’s host goes down FIRST and the Cafe route opens with it', async () => {
    await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
    fromUnity({ type: 'WORLD_READY' });
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'cafe' } });
    fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'cafe' } });
    await act(async () => {});
    // The door opens onto the choice, not straight into the cafe (20-10).
    expect(mockNav.calls).toHaveLength(0);
    expect(byTestID('world-overlay-cafe').length).toBeGreaterThan(0);
    expect(byTestID('world-cafe-tarot').length).toBeGreaterThan(0);
    await act(async () => { byTestID('world-cafe-coffee')[0].props.onPress(); });
    await act(async () => {});
    expect(mockNav.calls.map(c => c.args)).toEqual([['Cafe', { intent: { kind: 'coffee' } }]]);
    expect(mockNav.calls[0].hostUnmounts).toBe(1);
    expect(posts('WORLD_END')).toHaveLength(1);
    expect(useWorldStore.getState().returnZone).toBe('cafe');
  });

  it('“just look around” walks in with no choice', async () => {
    await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
    fromUnity({ type: 'WORLD_READY' });
    fromUnity({ type: 'WORLD_ARRIVED', payload: { zone: 'cafe' } });
    fromUnity({ type: 'WORLD_ENTERED', payload: { zone: 'cafe' } });
    await act(async () => {});
    press('그냥 둘러볼게요');
    await act(async () => {});
    expect(mockNav.calls.map(c => c.args)).toEqual([['Cafe', undefined]]);
  });

  it('the door card names the cafe and its way in', async () => {
    await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
    fromUnity({ type: 'WORLD_READY' });
    fromUnity({ type: 'WORLD_NEAR', payload: { zone: 'cafe', near: true } });
    const card = byTestID('world-door-cafe')[0];
    expect(card).toBeDefined();
    expect(card.findAll(n => n.props.children === '커피숍').length).toBeGreaterThan(0);
    press('들어가기');
    expect(posts('WORLD_ENTER').map(p => p.payload)).toEqual([{ zone: 'cafe' }]);
  });
});

describe('the cafe screen', () => {
  const render = async () => {
    await act(async () => { tree = ReactTestRenderer.create(<CafeScreen />); });
    await act(async () => {}); // the open waits for the Game-Token
  };

  it('opens with the language, the host and the account; the veil stays until CAFE_READY', async () => {
    await render();
    expect(posts('CAFE_INIT').map(p => p.payload)).toEqual([{
      lang: 'ko', apiBase: 'http://localhost:4000', auth: 'acct-42',
      // Shared rooms: the dev presence socket, the account's Game-Token (none stored in this test)
      // and the display name.
      presenceUrl: 'ws://127.0.0.1:9090/ws', gameToken: '', name: '',
    }]);
    expect(byTestID('cafe-veil').length).toBeGreaterThan(0);
    expect(byTestID('cafe-look')).toHaveLength(0);
    fromUnity({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: ['bar', 'lounge'] } });
    expect(byTestID('cafe-veil')).toHaveLength(0);
    expect(byTestID('cafe-look').length).toBeGreaterThan(0);
  });

  it('by the guest: the seats Unity named, worded, and a tap sits there', async () => {
    await render();
    fromUnity({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: ['bar', 'lounge', 'roof'] } });
    expect(byTestID('cafe-near')).toHaveLength(0);
    fromUnity({ type: 'CAFE_NEAR', payload: { near: true } });
    const near = byTestID('cafe-near')[0];
    // Jiho, with Korean's comitative particle (지호와).
    expect(near.findAll(n => n.props.children === '지호와 커피 한 잔 할까요?').length).toBeGreaterThan(0);
    expect(byLabel('바에서 커피 마시기')).toBeDefined();
    expect(byLabel('창가 라운지에서 이야기하기')).toBeDefined();
    expect(byLabel('함께 앉기')).toBeDefined(); // an id this app has no words for
    press('창가 라운지에서 이야기하기');
    expect(posts('CAFE_SIT').map(p => p.payload)).toEqual([{ spot: 'lounge' }]);
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'seating', spot: 'lounge', reason: '' } });
    expect(byTestID('cafe-near')).toHaveLength(0);
    press('취소');
    expect(posts('CAFE_STAND')).toHaveLength(1);
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'exploring', spot: '', reason: 'blocked' } });
    expect(byTestID('cafe-note')[0].findAll(n => n.props.children === '길이 막혀 있어요. 다른 자리를 골라 보세요.').length).toBeGreaterThan(0);
    // Back on foot, the seats wait for Unity's CAFE_NEAR again.
    expect(byTestID('cafe-near')).toHaveLength(0);
  });

  it('seated: a message goes out as CAFE_SAY, the answer comes back in the panel, an error is worded', async () => {
    await render();
    fromUnity({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: ['bar'] } });
    fromUnity({ type: 'CAFE_PHASE', payload: { phase: 'talking', spot: 'bar', reason: '' } });
    expect(byTestID('cafe-panel').length).toBeGreaterThan(0);
    expect(byTestID('cafe-look')).toHaveLength(0);
    expect(textOf('cafe-reply')).toBe('천천히 해요. 무슨 생각을 하고 있어요?');
    const input = byTestID('cafe-input')[0];
    act(() => input.props.onChangeText('  요즘 잠이 안 와요  '));
    press('보내기');
    expect(posts('CAFE_SAY').map(p => p.payload)).toEqual([{ text: '요즘 잠이 안 와요' }]);
    expect(textOf('cafe-reply')).toBe('생각하는 중…');
    fromUnity({ type: 'CAFE_REPLY', payload: { ok: true, text: '따뜻한 차 한 잔 어때요?', error: '' } });
    expect(textOf('cafe-reply')).toBe('따뜻한 차 한 잔 어때요?');

    act(() => byTestID('cafe-input')[0].props.onChangeText('또'));
    press('보내기');
    fromUnity({ type: 'CAFE_REPLY', payload: { ok: false, text: 'AI conversation needs…', error: 'no_chart' } });
    expect(textOf('cafe-reply')).toBe('사주 정보를 먼저 저장하면 대화할 수 있어요.');

    press('시점 바꾸기');
    expect(posts('CAFE_SHOT')).toHaveLength(1);
    press('자리에서 일어나기');
    expect(posts('CAFE_STAND')).toHaveLength(1);
  });

  it('back to the world closes the cafe once', async () => {
    await render();
    fromUnity({ type: 'CAFE_READY', payload: { guest: 'dosa', spots: [] } });
    press('월드로 돌아가기');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
    act(() => tree!.unmount());
    tree = null;
    expect(posts('CAFE_END')).toHaveLength(1);
  });
});

describe('the cafe’s pure parts', () => {
  it('names the guest from the roster, words seats and errors, and frames the panel', () => {
    expect(guestName('dosa', 'en')).toBe('Jiho');
    expect(guestName('nobody', 'en')).toBe('nobody');
    expect(spotLabel('bar')).toBe('cafe.spot.bar');
    expect(spotLabel('roof')).toBe('cafe.spot.any');
    expect(replyErrorKey('ticket')).toBe('cafe.err.ticket');
    expect(replyErrorKey('something_new')).toBe('cafe.err.upstream');
    expect(CAFE_HOME).toEqual({ zoom: 0.5, yaw: 0, pitch: 0 });
    const host = { x: 0, y: 0, width: 400, height: 800 };
    expect(cafeCoveredPx({ host, top: { x: 0, y: 0, width: 400, height: 60 } }, false)).toEqual({ top: 60 });
    expect(cafeCoveredPx({ host, top: { x: 0, y: 0, width: 400, height: 60 }, panel: { x: 0, y: 500, width: 400, height: 300 } }, false))
      .toEqual({ top: 60, bottom: 300 });
    expect(cafeCoveredPx({ host: { x: 0, y: 0, width: 800, height: 400 }, panel: { x: 500, y: 0, width: 300, height: 400 } }, true))
      .toEqual({ top: 0, right: 300 });
    // Sideways, the reading's strip runs along the bottom: a bottom inset, not 90% of the width.
    expect(cafeCoveredPx({ host: { x: 0, y: 0, width: 800, height: 400 }, panel: { x: 40, y: 330, width: 720, height: 60 } }, true))
      .toEqual({ top: 0, bottom: 70 });
  });
});
