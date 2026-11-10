import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

/**
 * The Wooden Fish (spec 010 US1) on screen, with Unity DEAD (the mock bridge, no MEDI_READY
 * ever): the whole loop still runs — open → session starts → 108 taps on the drawn moktak, each
 * one sounding from RN → the closing bell → the server's reward. The tap floor refuses drumming,
 * the cap notice reads the server's next_percent, and leaving asks the server for nothing.
 */
const mockNav = { goBack: jest.fn(), replace: jest.fn(), addListener: jest.fn(() => () => {}), isFocused: () => true };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav, NavigationContext: undefined }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), back: jest.fn(), select: jest.fn(), moktakHit: jest.fn(), moktakBell: jest.fn(), bellIn: jest.fn(), bellOut: jest.fn() },
}));
const mockMusic = { start: jest.fn(), stop: jest.fn(), pause: jest.fn() };
jest.mock('../src/shared/audio/backgroundMusic', () => ({
  backgroundMusic: { start: (b: string) => mockMusic.start(b), stop: () => mockMusic.stop(), pause: () => mockMusic.pause() },
}));
jest.mock('../src/shared/device/keepAwake', () => ({ holdScreenAwake: () => () => {} }));
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

import { sfx } from '../src/shared/audio/sfx';
import { MoktakScreen } from '../src/features/meditations/screens/MoktakScreen';

const mockSfx = sfx as unknown as Record<string, jest.Mock>;
import { getMeditationsBridge, MockUnityBridge } from '../src/features/counseling/bridge';
import { useLanguageStore } from '../src/shared/i18n';
import { useHapticsStore } from '../src/shared/haptics';

const MENU = (nextPercent = 100) => ({
  moktak: { taps: 108, minSeconds: 240, reward: { xp: 60, gold: 30, energy: 60 } },
  snow: null,
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
  useHapticsStore.setState({ enabled: true });
  Object.values(mockApi).forEach(f => f.mockReset());
  Object.values(mockSfx).forEach(f => f.mockReset());
  mockMusic.start.mockReset();
  (getMeditationsBridge() as MockUnityBridge).mediCalls.length = 0;
});
afterEach(() => jest.useRealTimers());

async function open(nextPercent = 100) {
  mockApi.fetchMeditations.mockResolvedValue(MENU(nextPercent));
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 42, kind: 'moktak', minutes: 60, status: 'started' } });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<MoktakScreen />); });
  await settle();
  // No Unity: the settle fallback is 0 ms — the clock starts on the server's answer alone.
  await act(async () => { jest.advanceTimersByTime(0); });
  return tree;
}

it('runs the whole 108-tap sitting on the drawn moktak and shows the server reward', async () => {
  mockApi.finishMeditation.mockResolvedValue({
    ok: true,
    reward: { xp: 60, gold: 30, energy: 60, percent: 100, dayIndex: 1 },
    levelUp: false,
    levelBefore: 2,
    garden: null,
  });
  const tree = await open();
  const bridge = getMeditationsBridge() as MockUnityBridge;
  expect(bridge.lastMediInit).toMatchObject({ experience: 'moktak', lang: 'en' });
  expect(mockApi.startMeditation).toHaveBeenCalledWith(expect.objectContaining({ kind: 'moktak' }));
  expect(text(tree)).toContain('0 / 108');

  for (let i = 0; i < 108; i += 1) {
    act(() => byId(tree, 'moktak-tap').props.onPress());
    await act(async () => { jest.advanceTimersByTime(300); });
  }
  expect(mockSfx.moktakHit).toHaveBeenCalledTimes(108);
  expect(mockSfx.moktakBell).toHaveBeenCalledTimes(1);
  await settle();
  expect(mockApi.finishMeditation).toHaveBeenCalledWith({ id: 42, taps: 108 });
  expect(text(tree)).toContain('Well done');
  expect(text(tree)).toContain('+60 XP');
  expect(text(tree)).toContain('+30 Gold');
  // The strike went over the bridge counted, and the phase changes were told to the stage.
  const taps = bridge.mediCalls.filter(c => c.type === 'MEDI_TAP');
  expect(taps).toHaveLength(108);
  expect(taps[107].payload).toEqual({ count: 108, counted: true });
  const states = bridge.mediCalls.filter(c => c.type === 'MEDI_STATE').map(c => (c.payload as any).state);
  expect(states).toEqual(['intro', 'running', 'finishing', 'done']);
  act(() => tree.unmount());
});

it('a tap under the floor sounds but does not count — and is sent uncounted', async () => {
  const tree = await open();
  act(() => byId(tree, 'moktak-tap').props.onPress());
  await act(async () => { jest.advanceTimersByTime(100); });
  act(() => byId(tree, 'moktak-tap').props.onPress());
  expect(text(tree)).toContain('1 / 108');
  expect(mockSfx.moktakHit).toHaveBeenCalledTimes(2);
  const taps = (getMeditationsBridge() as MockUnityBridge).mediCalls.filter(c => c.type === 'MEDI_TAP').map(c => c.payload);
  expect(taps).toEqual([{ count: 1, counted: true }, { count: 1, counted: false }]);
  act(() => tree.unmount());
});

it('waits out TOO_EARLY behind the closing bell and retries', async () => {
  mockApi.finishMeditation
    .mockResolvedValueOnce({ ok: false, kind: 'tooEarly', secondsLeft: 3 })
    .mockResolvedValue({ ok: true, reward: { xp: 60, gold: 30, energy: 60, percent: 100, dayIndex: 1 }, levelUp: false, levelBefore: 2, garden: null });
  const tree = await open();
  for (let i = 0; i < 108; i += 1) {
    act(() => byId(tree, 'moktak-tap').props.onPress());
    await act(async () => { jest.advanceTimersByTime(300); });
  }
  await settle();
  expect(text(tree)).toContain('The bell rings out…');
  await act(async () => { jest.advanceTimersByTime(3000); });
  await settle();
  expect(mockApi.finishMeditation).toHaveBeenCalledTimes(2);
  expect(text(tree)).toContain('Well done');
  act(() => tree.unmount());
});

it('shows the cap notice from the server and a See-your-tree only on a level up', async () => {
  mockApi.finishMeditation.mockResolvedValue({
    ok: true,
    reward: { xp: 30, gold: 15, energy: 60, percent: 50, dayIndex: 3 },
    levelUp: true,
    levelBefore: 2,
    garden: null,
  });
  const tree = await open(50);
  expect(text(tree)).toContain('Your third sitting today earns half the XP and Gold.');
  for (let i = 0; i < 108; i += 1) {
    act(() => byId(tree, 'moktak-tap').props.onPress());
    await act(async () => { jest.advanceTimersByTime(300); });
  }
  await settle();
  expect(text(tree)).toContain('Third sitting today — half XP and Gold.');
  await act(async () => { byId(tree, 'moktak-see-tree').props.onPress(); });
  expect(mockNav.replace).toHaveBeenCalledWith('Garden');
  act(() => tree.unmount());
});

it('the haptics toggle flips the seam, and leaving asks the server for nothing', async () => {
  const tree = await open();
  act(() => byId(tree, 'moktak-haptics').props.onPress());
  expect(useHapticsStore.getState().enabled).toBe(false);
  act(() => byId(tree, 'moktak-back').props.onPress());
  expect(mockNav.goBack).toHaveBeenCalled();
  expect(mockApi.finishMeditation).not.toHaveBeenCalled();
  act(() => tree.unmount());
});
