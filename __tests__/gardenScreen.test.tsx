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

const mockApi = {
  fetchGarden: jest.fn(), startSession: jest.fn(), finishSession: jest.fn(),
  buyPlot: jest.fn(), buySeed: jest.fn(), plantSeed: jest.fn(), buyDecor: jest.fn(), saveLayout: jest.fn(),
};
jest.mock('../src/features/garden/api/gardenApi', () => ({
  ...jest.requireActual('../src/features/garden/api/gardenApi'),
  fetchGarden: (...a: unknown[]) => mockApi.fetchGarden(...a),
  startSession: (...a: unknown[]) => mockApi.startSession(...a),
  finishSession: (...a: unknown[]) => mockApi.finishSession(...a),
  buyPlot: (...a: unknown[]) => mockApi.buyPlot(...a),
  buySeed: (...a: unknown[]) => mockApi.buySeed(...a),
  plantSeed: (...a: unknown[]) => mockApi.plantSeed(...a),
  buyDecor: (...a: unknown[]) => mockApi.buyDecor(...a),
  saveLayout: (...a: unknown[]) => mockApi.saveLayout(...a),
}));

import { GardenScreen } from '../src/features/garden/screens/GardenScreen';
import { getGardenBridge, MockUnityBridge } from '../src/features/counseling/bridge';
import { useLanguageStore } from '../src/shared/i18n';

const PLOT_LEVELS = [2, 3, 4, 5, 6, 7, 8, 9];
const PLOT_PRICES = [100, 200, 350, 500, 750, 1000, 1300, 1800];
const plots = (level: number, owned: Record<number, string> = {}) =>
  PLOT_LEVELS.map((l, i) => ({ index: i + 1, level: l, price: PLOT_PRICES[i], owned: !!owned[i + 1], element: owned[i + 1] ?? null, unlocked: level >= l }));
const NO_UNLOCKS = { time_of_day: false, rain: false, fireflies: false, companion: false, seasons: false };
const garden = (over: any = {}) => ({
  level: 1, stem: '癸', element: 'water', xp: 0, levelXp: 0, levelSpan: 150, maxLevel: 10, gold: 0, energyTotal: 0,
  today: { localDate: '2026-10-22', finished: 0, energy: 0, nextPercent: 100 }, variant: null,
  plots: plots(over.level ?? 1), seeds: [], collection: [], unlocks: NO_UNLOCKS, ...over,
});
const DURATIONS = [{ minutes: 3, xp: 30, gold: 15, energy: 30 }, { minutes: 5, xp: 60, gold: 30, energy: 60 }, { minutes: 10, xp: 150, gold: 75, energy: 150 }];
const CATALOG = {
  seeds: [{ id: 'lotus', element: 'water', level: 2, price: 60, energy: 300, drop: 0.1 }, { id: 'birch', element: 'metal', level: 4, price: 90, energy: 450, drop: 0.08 }],
  decor: [
    { id: 'pebble_ring', element: 'water', level: 1, tier: 'S', kind: 'place', price: 100, on_sale: true },
    { id: 'orb_moonlight', element: 'water', level: 1, tier: 'S', kind: 'orb', price: 100, on_sale: true },
    { id: 'myroom_planter', element: 'wood', level: 3, tier: 'MR', kind: 'myroom', price: 250, on_sale: false },
  ],
  seedsPerPlot: 3, matchBonusPercent: 25,
};
const state = (g: object) => ({ garden: g, durations: DURATIONS, layout: { items: null, orb: null, music: null, version: 0 }, ownedDecor: {}, catalog: CATALOG });

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
  mockApi.fetchGarden.mockResolvedValue(state(garden()));
  mockApi.startSession.mockResolvedValue({ ok: true, session: { id: 42, minutes: 3, status: 'started', seconds: 180 } });
  mockApi.finishSession.mockResolvedValue({
    ok: true, levelUp: true, levelBefore: 1,
    reward: { xp: 30, gold: 15, energy: 30, percent: 100, dayIndex: 1 },
    garden: garden({ level: 2, stem: '壬', xp: 150, levelXp: 0, levelSpan: 300, gold: 15, today: { localDate: '2026-10-22', finished: 1, energy: 30, nextPercent: 100 } }),
    drop: { id: 5, species: 'lotus', source: 'drop', status: 'packet', plot: null, grown: 0, need: 300, element: 'water' },
    matured: [],
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
  expect(text(tree)).toContain('A seed fell: Lotus');

  // The level-up plays when asked for, then the new level is named.
  act(() => byId(tree, 'garden-grow').props.onPress());
  expect(bridge.gardenCalls.filter(c => c.type === 'GARDEN_GROW').map(c => c.payload)).toEqual([{ level: 2, progress: 0, energy: 0.1, levelUp: true }]);
  await act(async () => { jest.advanceTimersByTime(0); });
  expect(text(tree)).toContain('Your tree has grown');
  expect(text(tree)).toContain('Seedling');

  act(() => byId(tree, 'garden-home').props.onPress());
  expect(text(tree)).toContain('Sit and meditate');
  expect(text(tree)).toContain('15 Gold');
  // The island followed the server's garden: level 2 opens plot 1's rim.
  const islands = bridge.gardenCalls.filter(c => c.type === 'GARDEN_ISLAND').map(c => c.payload as any);
  expect(islands[islands.length - 1].plots[0]).toMatchObject({ index: 1, unlocked: true, owned: false });
  const states = bridge.gardenCalls.filter(c => c.type === 'GARDEN_STATE').map(c => (c.payload as any).state);
  expect(states).toEqual(['sitting', 'breathing', 'done', 'garden']);
  act(() => tree.unmount());
});

it('does not start the clock until the server has answered start', async () => {
  mockApi.fetchGarden.mockResolvedValue(state(garden()));
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
  mockApi.fetchGarden.mockResolvedValue(state(garden({ today: { localDate: '', finished: 3, energy: 90, nextPercent: 0 } })));
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
  mockApi.fetchGarden.mockResolvedValueOnce(null).mockResolvedValueOnce(state(garden()));
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<GardenScreen />); });
  await settle();
  expect(text(tree)).toContain("The garden couldn't be reached.");
  await act(async () => { byId(tree, 'garden-retry').props.onPress(); });
  await settle();
  expect(text(tree)).toContain('Sit and meditate');
  act(() => tree.unmount());
});

describe('the island (phase 2)', () => {
  const open = async (g: object, extra: object = {}) => {
    mockApi.fetchGarden.mockResolvedValue({ ...state(g), ...extra });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => { tree = ReactTestRenderer.create(<GardenScreen />); });
    await settle();
    return tree;
  };

  it('opens a plot tapped in Unity, picks its biome and buys it with Gold', async () => {
    const g = garden({ level: 2, gold: 150 });
    const tree = await open(g);
    const bridge = getGardenBridge() as MockUnityBridge;
    expect(bridge.gardenCalls.some(c => c.type === 'GARDEN_LAYOUT')).toBe(true);
    // The tap layer forwards a tap; Unity answers with the plot under it.
    act(() => byId(tree, 'garden-island-tap').props.onPress({ nativeEvent: { pageX: 100, pageY: 400 } }));
    expect(bridge.gardenCalls.find(c => c.type === 'GARDEN_TAP')).toBeTruthy();
    act(() => bridge.emitToRN({ type: 'GARDEN_PLOT_TAP', payload: { index: 1 } }));
    expect(text(tree)).toContain('Plot 1');
    act(() => byId(tree, 'garden-biome-fire').props.onPress());
    mockApi.buyPlot.mockResolvedValue({ ok: true, gold: 50, plot: { index: 1, element: 'fire' },
      garden: garden({ level: 2, gold: 50, plots: plots(2, { 1: 'fire' }) }) });
    await act(async () => { byId(tree, 'garden-plot-buy').props.onPress(); });
    expect(mockApi.buyPlot).toHaveBeenCalledWith(1, 'fire');
    expect(text(tree)).toContain('Lanterns · Fire');
    const island = bridge.gardenCalls.filter(c => c.type === 'GARDEN_ISLAND').pop()!.payload as any;
    expect(island.plots[0]).toMatchObject({ owned: true, element: 'fire' });
    act(() => tree.unmount());
  });

  it('says a locked plot needs a level, and a refusal in words', async () => {
    const tree = await open(garden({ level: 1 }));
    act(() => (getGardenBridge() as MockUnityBridge).emitToRN({ type: 'GARDEN_PLOT_TAP', payload: { index: 3 } }));
    expect(text(tree)).toContain('Opens when your tree reaches level 4.');
    act(() => tree.unmount());
  });

  it('buys a seed in the shop and plants it in an owned plot', async () => {
    const g = garden({ level: 2, gold: 300, plots: plots(2, { 1: 'water' }) });
    const packet = { id: 9, species: 'lotus', source: 'shop', status: 'packet', plot: null, grown: 0, need: 300, element: 'water' };
    const tree = await open(g);
    act(() => byId(tree, 'garden-open-shop').props.onPress());
    expect(text(tree)).toContain('Lotus · Water');
    expect(text(tree)).toContain('Level 4');   // birch is not open yet
    mockApi.buySeed.mockResolvedValue({ ok: true, gold: 240, seed: packet, garden: { ...g, gold: 240, seeds: [packet] } });
    await act(async () => { byId(tree, 'garden-seed-buy-lotus').props.onPress(); });
    expect(mockApi.buySeed).toHaveBeenCalledWith('lotus', expect.any(String));
    act(() => byId(tree, 'garden-packet-plant-9').props.onPress());
    const planted = { ...packet, status: 'growing', plot: 1 };
    mockApi.plantSeed.mockResolvedValue({ ok: true, gold: null, seed: planted, garden: { ...g, gold: 240, seeds: [planted] } });
    await act(async () => { byId(tree, 'garden-plant-plot-1').props.onPress(); });
    expect(mockApi.plantSeed).toHaveBeenCalledWith(9, 1);
    const island = (getGardenBridge() as MockUnityBridge).gardenCalls.filter(c => c.type === 'GARDEN_ISLAND').pop()!.payload as any;
    expect(island.seeds).toEqual([{ id: 9, species: 'lotus', element: 'water', status: 'growing', plot: 1, progress: 0 }]);

    mockApi.buySeed.mockResolvedValue({ ok: false, kind: 'insufficientGold', price: 60, gold: 10 });
    await act(async () => { byId(tree, 'garden-seed-buy-lotus').props.onPress(); });
    expect(text(tree)).toContain('Not enough Gold.');
    act(() => tree.unmount());
  });

  it('keeps the My Room tier out of the shop, sells decor, and saves an edit like My Room', async () => {
    const tree = await open(garden({ level: 3, gold: 500 }));
    const bridge = getGardenBridge() as MockUnityBridge;
    act(() => byId(tree, 'garden-open-shop').props.onPress());
    act(() => byId(tree, 'garden-shop-tab-decor').props.onPress());
    expect(text(tree)).toContain('Pebble ring');
    expect(text(tree)).not.toContain('Planter');
    mockApi.buyDecor.mockResolvedValue({ ok: true, gold: 400, garden: null, ownedDecor: { pebble_ring: 1 } });
    await act(async () => { byId(tree, 'garden-decor-buy-pebble_ring').props.onPress(); });
    expect(text(tree)).toContain('Owned ×1');
    act(() => byId(tree, 'garden-panel-close').props.onPress());

    act(() => byId(tree, 'garden-open-decorate').props.onPress());
    expect(bridge.gardenCalls.filter(c => c.type === 'GARDEN_EDIT').pop()!.payload).toEqual({ on: true });
    act(() => byId(tree, 'garden-tray-pebble_ring').props.onPress());
    expect(bridge.gardenCalls.filter(c => c.type === 'GARDEN_ADD').pop()!.payload).toEqual({ item: 'pebble_ring' });
    const items = [{ uid: 'pebble_ring', item: 'pebble_ring', pos: { x: 1, z: -1 }, rot: 0, slot: null }];
    act(() => bridge.emitToRN({ type: 'GARDEN_LAYOUT_CHANGED', payload: { layout: { items }, valid: false, reason: 'overlap', uid: 'pebble_ring' } }));
    expect(text(tree)).toContain('Two pieces are overlapping.');
    expect(byId(tree, 'garden-edit-done').props.disabled).toBe(true);
    act(() => bridge.emitToRN({ type: 'GARDEN_LAYOUT_CHANGED', payload: { layout: { items }, valid: true, reason: '', uid: '' } }));
    mockApi.saveLayout.mockResolvedValue({ kind: 'saved', layout: { items, orb: null, music: null, version: 1 }, ownedDecor: { pebble_ring: 1 }, dropped: [] });
    await act(async () => { byId(tree, 'garden-edit-done').props.onPress(); });
    expect(mockApi.saveLayout).toHaveBeenCalledWith({ items, orb: null, music: null }, 0);
    expect(bridge.gardenCalls.filter(c => c.type === 'GARDEN_EDIT').pop()!.payload).toEqual({ on: false });
    expect(bridge.gardenCalls.filter(c => c.type === 'GARDEN_LAYOUT').pop()!.payload).toEqual({ layout: { items } });
    expect(text(tree)).toContain('Sit and meditate');
    act(() => tree.unmount());
  });

  it('offers the sky and the rain once the level has unlocked them', async () => {
    const tree = await open(garden({ level: 6, unlocks: { ...NO_UNLOCKS, time_of_day: true, rain: true } }));
    act(() => byId(tree, 'garden-sky-dusk').props.onPress());
    act(() => byId(tree, 'garden-rain').props.onPress());
    const island = (getGardenBridge() as MockUnityBridge).gardenCalls.filter(c => c.type === 'GARDEN_ISLAND').pop()!.payload as any;
    expect(island.env).toEqual({ sky: 'dusk', rain: true });
    act(() => tree.unmount());
  });
});
