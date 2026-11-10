import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

/**
 * The Snow Mountain (spec 010 US2) on screen, with Unity DEAD (the mock bridge): the duration
 * sheet renders the SERVER's rewards (including the 20-minute row), a sitting runs to its end
 * with ZERO touches and pays, TOO_EARLY is waited out, and the screen is held awake for the whole
 * sitting — the garden's keep-awake treatment (GardenScreen holds it through
 * sitting/breathing/finishing; verified there, copied here).
 */
const mockNav = { goBack: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => () => {}), isFocused: () => true };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav, NavigationContext: undefined }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), back: jest.fn(), select: jest.fn(), bellIn: jest.fn(), bellOut: jest.fn(), moktakHit: jest.fn(), moktakBell: jest.fn() },
}));
const mockMusic = { start: jest.fn(), stop: jest.fn(), pause: jest.fn() };
jest.mock('../src/shared/audio/backgroundMusic', () => ({
  backgroundMusic: { start: (b: string) => mockMusic.start(b), stop: () => mockMusic.stop(), pause: () => mockMusic.pause() },
}));
jest.mock('../src/shared/device/keepAwake', () => ({
  holdScreenAwake: jest.fn(() => jest.fn()),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

const mockApi = { fetchMeditations: jest.fn(), startMeditation: jest.fn(), finishMeditation: jest.fn() };
jest.mock('../src/features/meditations/api/meditationsApi', () => ({
  ...jest.requireActual('../src/features/meditations/api/meditationsApi'),
  fetchMeditations: (...a: unknown[]) => mockApi.fetchMeditations(...a),
  startMeditation: (...a: unknown[]) => mockApi.startMeditation(...a),
  finishMeditation: (...a: unknown[]) => mockApi.finishMeditation(...a),
}));

import { holdScreenAwake } from '../src/shared/device/keepAwake';
import { SnowMountainScreen } from '../src/features/meditations/screens/SnowMountainScreen';
import { getMeditationsBridge, MockUnityBridge } from '../src/features/counseling/bridge';
import { useLanguageStore } from '../src/shared/i18n';

const MENU = (nextPercent = 100) => ({
  moktak: null,
  snow: {
    breath: { inMs: 4000, holdMs: 4000, outMs: 6000 },
    durations: [
      { minutes: 3, xp: 30, gold: 15, energy: 30 },
      { minutes: 5, xp: 60, gold: 30, energy: 60 },
      { minutes: 10, xp: 150, gold: 75, energy: 150 },
      { minutes: 20, xp: 330, gold: 165, energy: 330 },
    ],
  },
  today: { localDate: '2026-11-09', finished: 0, nextPercent },
  garden: null,
  session: null,
});

const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(require('react-native').Text).map(n => [].concat(n.props.children).join('')).join(' | ');
const byId = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const settle = async () => { await act(async () => { await Promise.resolve(); }); };

beforeEach(() => {
  jest.useFakeTimers();
  useLanguageStore.setState({ lang: 'en' } as any);
  Object.values(mockApi).forEach(f => f.mockReset());
  mockMusic.start.mockReset();
  (holdScreenAwake as jest.Mock).mockClear();
  (getMeditationsBridge() as MockUnityBridge).mediCalls.length = 0;
});
afterEach(() => jest.useRealTimers());

async function open(nextPercent = 100) {
  mockApi.fetchMeditations.mockResolvedValue(MENU(nextPercent));
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<SnowMountainScreen />); });
  await settle();
  return tree;
}

it('renders the server-sent durations — the 20-minute row included — and the breath config goes to Unity', async () => {
  const tree = await open();
  expect(text(tree)).toContain('+30 XP · +15 Gold');
  expect(text(tree)).toContain('+330 XP · +165 Gold');
  const bridge = getMeditationsBridge() as MockUnityBridge;
  expect(bridge.lastMediInit).toMatchObject({
    experience: 'snow_mountain',
    breath: { inMs: 4000, holdMs: 4000, outMs: 6000 },
  });
  act(() => tree.unmount());
});

it('completes and pays with zero touches, held awake the whole sitting', async () => {
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 9, kind: 'snow_mountain', minutes: 3, status: 'started' } });
  mockApi.finishMeditation.mockResolvedValue({
    ok: true,
    reward: { xp: 30, gold: 15, energy: 30, percent: 100, dayIndex: 1 },
    levelUp: false,
    levelBefore: 1,
    garden: null,
  });
  const tree = await open();
  act(() => byId(tree, 'snow-duration-3').props.onPress());
  await act(async () => { byId(tree, 'snow-begin').props.onPress(); });
  await settle();
  expect(mockApi.startMeditation).toHaveBeenCalledWith(expect.objectContaining({ kind: 'snow_mountain', minutes: 3 }));
  // No Unity: the settle fallback is 0 ms — running starts on the server's answer alone.
  await act(async () => { jest.advanceTimersByTime(0); });
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(text(tree)).toContain('3:00');
  await act(async () => { jest.advanceTimersByTime(10_000); });
  expect(text(tree)).toContain('2:50'); // the countdown is live
  expect(mockMusic.start).toHaveBeenCalledWith('snowWind');
  expect(holdScreenAwake).toHaveBeenCalled();

  // Three minutes pass; nothing is touched.
  await act(async () => { jest.advanceTimersByTime(3 * 60 * 1000); });
  await settle();
  expect(mockApi.finishMeditation).toHaveBeenCalledWith({ id: 9 });
  expect(text(tree)).toContain('Well done');
  expect(text(tree)).toContain('+30 XP');
  const states = (getMeditationsBridge() as MockUnityBridge).mediCalls
    .filter(c => c.type === 'MEDI_STATE').map(c => (c.payload as any).state);
  expect(states).toEqual(['intro', 'running', 'finishing', 'done']);
  act(() => tree.unmount());
});

it('waits out a TOO_EARLY and gets paid on the retry', async () => {
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 10, kind: 'snow_mountain', minutes: 3, status: 'started' } });
  mockApi.finishMeditation
    .mockResolvedValueOnce({ ok: false, kind: 'tooEarly', secondsLeft: 2 })
    .mockResolvedValue({ ok: true, reward: { xp: 30, gold: 15, energy: 30, percent: 100, dayIndex: 1 }, levelUp: false, levelBefore: 1, garden: null });
  const tree = await open();
  await act(async () => { byId(tree, 'snow-begin').props.onPress(); });
  await settle();
  await act(async () => { jest.advanceTimersByTime(0); });
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000 + 250); });
  await settle();
  expect(text(tree)).toContain('Gathering the energy…');
  await act(async () => { jest.advanceTimersByTime(2000); });
  await settle();
  expect(mockApi.finishMeditation).toHaveBeenCalledTimes(2);
  expect(text(tree)).toContain('Well done');
  act(() => tree.unmount());
});

it('Stop leaves without asking the server, back to the duration sheet', async () => {
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 11, kind: 'snow_mountain', minutes: 5, status: 'started' } });
  const tree = await open();
  await act(async () => { byId(tree, 'snow-begin').props.onPress(); });
  await settle();
  await act(async () => { jest.advanceTimersByTime(0); });
  await act(async () => { jest.advanceTimersByTime(30_000); });
  act(() => byId(tree, 'snow-stop').props.onPress());
  expect(text(tree)).toContain('Begin breathing');
  await act(async () => { jest.advanceTimersByTime(10 * 60 * 1000); });
  expect(mockApi.finishMeditation).not.toHaveBeenCalled();
  act(() => tree.unmount());
});

it('shows the cap notice from the server before starting', async () => {
  const tree = await open(0);
  expect(text(tree)).toContain("Today's XP and Gold are gathered");
  act(() => tree.unmount());
});
