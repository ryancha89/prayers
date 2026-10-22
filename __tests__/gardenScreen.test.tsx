import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

/**
 * Tree of Mind (spec 008) on screen, without the embedded player (the mock bridge), over a faked
 * server: the whole phase-1 loop runs — garden → pick 3 min → sit → breathe → the server's reward →
 * the tree grows → back to the garden — and the clock only starts once the server has answered
 * `start`, so an honest finish can never be refused as early.
 */
const mockNav = { goBack: jest.fn(), addListener: jest.fn(() => () => {}), isFocused: () => true };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav, NavigationContext: undefined }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), back: jest.fn(), select: jest.fn(), bellIn: jest.fn(), bellOut: jest.fn() } }));
const mockMusic = { start: jest.fn(), stop: jest.fn(), pause: jest.fn() };
jest.mock('../src/shared/audio/backgroundMusic', () => ({
  backgroundMusic: { start: (b: string) => mockMusic.start(b), stop: () => mockMusic.stop(), pause: () => mockMusic.pause() },
  meditationBed: () => 'meditation',
}));
jest.mock('../src/shared/device/keepAwake', () => ({ holdScreenAwake: () => () => {} }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

const mockApi = { fetchGarden: jest.fn(), startSession: jest.fn(), finishSession: jest.fn() };
jest.mock('../src/features/garden/api/gardenApi', () => ({
  ...jest.requireActual('../src/features/garden/api/gardenApi'),
  fetchGarden: (...a: unknown[]) => mockApi.fetchGarden(...a),
  startSession: (...a: unknown[]) => mockApi.startSession(...a),
  finishSession: (...a: unknown[]) => mockApi.finishSession(...a),
}));

import { GardenScreen } from '../src/features/garden/screens/GardenScreen';
import { getGardenBridge, MockUnityBridge } from '../src/features/counseling/bridge';
import { useLanguageStore } from '../src/shared/i18n';

const garden = (over: object = {}) => ({
  level: 1, stem: '癸', element: 'water', xp: 0, levelXp: 0, levelSpan: 150, maxLevel: 10, gold: 0, energyTotal: 0,
  today: { localDate: '2026-10-22', finished: 0, energy: 0, nextPercent: 100 }, variant: null, ...over,
});
const DURATIONS = [{ minutes: 3, xp: 30, gold: 15, energy: 30 }, { minutes: 5, xp: 60, gold: 30, energy: 60 }, { minutes: 10, xp: 150, gold: 75, energy: 150 }];

const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(require('react-native').Text).map(n => [].concat(n.props.children).join('')).join(' | ');
const byId = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => n.props.testID === id && (typeof n.props.onPress === 'function' || typeof n.props.onPressIn === 'function'))[0];
const settle = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  jest.useFakeTimers();
  useLanguageStore.setState({ lang: 'en' } as any);
  Object.values(mockApi).forEach(f => f.mockReset());
  mockMusic.start.mockReset();
  (getGardenBridge() as MockUnityBridge).gardenCalls.length = 0;
});
afterEach(() => jest.useRealTimers());

it('runs the whole loop: sit for 3 minutes, get the server reward, see the tree grow, back to the garden', async () => {
  mockApi.fetchGarden.mockResolvedValue({ garden: garden(), durations: DURATIONS });
  mockApi.startSession.mockResolvedValue({ ok: true, session: { id: 42, minutes: 3, status: 'started', seconds: 180 } });
  mockApi.finishSession.mockResolvedValue({
    ok: true, levelUp: true, levelBefore: 1,
    reward: { xp: 30, gold: 15, energy: 30, percent: 100, dayIndex: 1 },
    garden: garden({ level: 2, stem: '壬', xp: 150, levelXp: 0, levelSpan: 300, gold: 15, today: { localDate: '2026-10-22', finished: 1, energy: 30, nextPercent: 100 } }),
  });

  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<GardenScreen />); });
  await settle();
  const bridge = getGardenBridge() as MockUnityBridge;
  expect(bridge.lastGardenInit).toMatchObject({ lang: 'en', level: 1, progress: 0 });
  expect(text(tree)).toContain('Level 1 · 癸 · Water');
  expect(text(tree)).toContain('Little sprout');
  expect(text(tree)).toContain('+30 XP · +15 Gold');

  act(() => byId(tree, 'garden-duration-3').props.onPress());
  await act(async () => { byId(tree, 'garden-sit').props.onPress(); });
  await settle();
  expect(mockApi.startSession).toHaveBeenCalledWith(expect.objectContaining({ minutes: 3 }));
  // No Unity to say GARDEN_SEATED: the fallback seats at once and the clock starts.
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(text(tree)).toContain('Breathe in');
  expect(text(tree)).toContain('3:00');
  expect(mockMusic.start).toHaveBeenCalledWith('meditation');

  // A breath with the guide: hold for the in-breath, let go on the out-breath.
  act(() => byId(tree, 'garden-touch').props.onPressIn());
  await act(async () => { jest.advanceTimersByTime(4000); });
  act(() => byId(tree, 'garden-touch').props.onPressOut());
  expect(text(tree)).toContain('Breathe out');
  const touches = bridge.gardenCalls.filter(c => c.type === 'GARDEN_TOUCH').map(c => c.payload);
  expect(touches).toEqual([{ down: true }, { down: false, inRhythm: true }]);

  await act(async () => { jest.advanceTimersByTime(176_250); });
  await settle();
  expect(mockApi.finishSession).toHaveBeenCalledWith({ id: 42, breaths: 18, inRhythm: 1 });
  expect(text(tree)).toContain('Well done');
  expect(text(tree)).toContain('+30 XP');
  expect(text(tree)).toContain('+15 Gold');
  expect(text(tree)).toContain('+30 energy');

  // The level-up plays when asked for, then the new level is named.
  act(() => byId(tree, 'garden-grow').props.onPress());
  expect(bridge.gardenCalls.filter(c => c.type === 'GARDEN_GROW').map(c => c.payload)).toEqual([{ level: 2, progress: 0, energy: 0.1, levelUp: true }]);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(text(tree)).toContain('Your tree has grown');
  expect(text(tree)).toContain('Seedling');

  act(() => byId(tree, 'garden-home').props.onPress());
  expect(text(tree)).toContain('Sit and meditate');
  expect(text(tree)).toContain('15 Gold');
  const states = bridge.gardenCalls.filter(c => c.type === 'GARDEN_STATE').map(c => (c.payload as any).state);
  expect(states).toEqual(['sitting', 'breathing', 'done', 'garden']);
  act(() => tree.unmount());
});

it('does not start the clock until the server has answered start', async () => {
  mockApi.fetchGarden.mockResolvedValue({ garden: garden(), durations: DURATIONS });
  let answer!: (v: unknown) => void;
  mockApi.startSession.mockReturnValue(new Promise(r => { answer = r; }));

  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<GardenScreen />); });
  await settle();
  await act(async () => { byId(tree, 'garden-sit').props.onPress(); });
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(text(tree)).toContain('Settle in under the tree');
  expect(text(tree)).not.toContain('Breathe in');

  await act(async () => { answer({ ok: true, session: { id: 1, minutes: 5, status: 'started', seconds: 300 } }); });
  await settle();
  expect(text(tree)).toContain('5:00');
  act(() => tree.unmount());
});

it('stops without asking the server for anything, and says so when a start fails', async () => {
  mockApi.fetchGarden.mockResolvedValue({ garden: garden({ today: { localDate: '', finished: 3, energy: 90, nextPercent: 0 } }), durations: DURATIONS });
  mockApi.startSession.mockResolvedValueOnce({ ok: true, session: { id: 9, minutes: 5, status: 'started', seconds: 300 } });
  mockApi.startSession.mockResolvedValueOnce({ ok: false, kind: 'failed' });

  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<GardenScreen />); });
  await settle();
  expect(text(tree)).toContain("Today's XP and Gold are gathered");

  await act(async () => { byId(tree, 'garden-sit').props.onPress(); });
  await act(async () => { jest.advanceTimersByTime(30_000); });
  act(() => byId(tree, 'garden-stop').props.onPress());
  expect(text(tree)).toContain('Sit and meditate');
  expect(mockApi.finishSession).not.toHaveBeenCalled();

  await act(async () => { byId(tree, 'garden-sit').props.onPress(); });
  await settle();
  expect(text(tree)).toContain("Couldn't begin");
  act(() => tree.unmount());
});

it('offers a retry when the garden cannot be reached', async () => {
  mockApi.fetchGarden.mockResolvedValueOnce(null).mockResolvedValueOnce({ garden: garden(), durations: DURATIONS });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<GardenScreen />); });
  await settle();
  expect(text(tree)).toContain("The garden couldn't be reached.");
  await act(async () => { byId(tree, 'garden-retry').props.onPress(); });
  await settle();
  expect(text(tree)).toContain('Sit and meditate');
  act(() => tree.unmount());
});
