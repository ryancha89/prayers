/**
 * Tree of Mind phase 2 (TreeOfMind-Growth.html §3.3–3.6), below the screen: what Unity is told about the
 * island, what the shop may offer, the plant targets, the decor tray (My Room's arithmetic), the Gold
 * calls with an idem key per intent, and the GARDEN_* island messages on the bridge.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import { authedFetch } from '../src/features/auth/api/headers';
import { buyDecor, buyPlot, plantSeed, readGarden, saveLayout, type Garden, type GardenCatalog } from '../src/features/garden/api/gardenApi';
import { decorForSale, decorLeft, islandPayload, layoutReasonKey, musicBed, plantablePlots, seedsForSale, shopErrorKey } from '../src/features/garden/island';
import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const SERVER_GARDEN = {
  level: 4, stem: '庚', element: 'metal', xp: 900, level_xp: 0, level_span: 600, max_level: 10, gold: 500, energy_total: 0,
  today: { local_date: '2026-10-22', finished: 0, energy: 0, next_percent: 100 }, variant: null,
  plots: [1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ index: i, level: i + 1, price: 100 * i, owned: i <= 2, element: i === 1 ? 'water' : i === 2 ? 'metal' : null, unlocked: i <= 3 })),
  seeds: [
    { id: 1, species: 'lotus', source: 'shop', status: 'growing', plot: 1, grown: 150, need: 300, element: 'water' },
    { id: 2, species: 'lotus', source: 'drop', status: 'growing', plot: 1, grown: 0, need: 300, element: 'water' },
    { id: 3, species: 'water_bamboo', source: 'shop', status: 'growing', plot: 1, grown: 0, need: 300, element: 'water' },
    { id: 4, species: 'birch', source: 'shop', status: 'packet', plot: null, grown: 0, need: 450, element: 'metal' },
  ],
  collection: ['ginkgo'],
  unlocks: { time_of_day: false, rain: true, fireflies: false, companion: false, seasons: false },
};
const CATALOG: GardenCatalog = {
  seeds: [{ id: 'lotus', element: 'water', level: 2, price: 60, energy: 300, drop: 0.1 }, { id: 'wildflower', element: 'earth', level: 5, price: 60, energy: 300, drop: 0.1 }],
  decor: [
    { id: 'pebble_ring', element: 'water', level: 1, tier: 'S', kind: 'place', price: 100, on_sale: true },
    { id: 'orb_moonlight', element: 'water', level: 1, tier: 'S', kind: 'orb', price: 100, on_sale: true },
    { id: 'stone_lamp', element: 'fire', level: 8, tier: 'L', kind: 'place', price: 600, on_sale: true },
    { id: 'myroom_planter', element: 'wood', level: 3, tier: 'MR', kind: 'myroom', price: 250, on_sale: false },
  ],
  seedsPerPlot: 3, matchBonusPercent: 25,
};

beforeEach(() => fetchMock.mockReset());

const g = (): Garden => readGarden(SERVER_GARDEN)!;

it('reads the island and tells Unity only the seeds in the ground, with growth as 0..1', () => {
  const island = islandPayload(g(), { sky: 'night', rain: true }, 'orb_moonlight');
  expect(island.seeds.map(s => [s.id, s.progress])).toEqual([[1, 0.5], [2, 0], [3, 0]]);
  expect(island.plots[0]).toEqual({ index: 1, level: 2, owned: true, unlocked: true, element: 'water' });
  // Golden day until the level-5 unlock (art direction 22-10); the rain is open.
  expect(island.env).toEqual({ sky: 'day', rain: true });
  expect(island.orb).toBe('orb_moonlight');
  expect(g().collection).toEqual(['ginkgo']);
});

it('offers seeds and decor by level, never the My Room tier, and plots with a free slot', () => {
  expect(seedsForSale(CATALOG, 4).map(x => [x.spec.id, x.open])).toEqual([['lotus', true], ['wildflower', false]]);
  expect(decorForSale(CATALOG, 4).map(x => [x.spec.id, x.open])).toEqual([['pebble_ring', true], ['orb_moonlight', true], ['stone_lamp', false]]);
  // Plot 1 is full (3 growing), plot 2 is empty.
  expect(plantablePlots(g(), 3)).toEqual([{ index: 2, element: 'metal', free: 3 }]);
});

it('counts the decor left to place, placeable pieces only', () => {
  const owned = { pebble_ring: 2, orb_moonlight: 1 };
  const placed = [{ uid: 'pebble_ring', item: 'pebble_ring', pos: { x: 1, z: 1 }, rot: 0, slot: null }];
  expect(decorLeft(owned, placed, CATALOG)).toEqual({ pebble_ring: 1 });
  expect(decorLeft(owned, null, CATALOG)).toEqual({ pebble_ring: 2 });
});

it('picks the sitting bed from the music decor, falling back to the meditation bed (T070)', () => {
  expect(musicBed('music_rain', 'en')).toBe('gardenRain');
  expect(musicBed('music_campfire', 'vi')).toBe('gardenCampfire');
  expect(musicBed(null, 'en')).toBe('meditation');
  expect(musicBed(null, 'ko')).toBe('meditationKo');
  // A music id this build does not know (a later server's new track) must not silence the sitting.
  expect(musicBed('music_stream', 'en')).toBe('meditation');
});

it('words the refusals', () => {
  expect(shopErrorKey({ ok: false, kind: 'insufficientGold', price: 1, gold: 0 })).toBe('garden.error.gold');
  expect(shopErrorKey({ ok: false, kind: 'refused', code: 'PLOT_FULL' })).toBe('garden.error.plotFull');
  expect(layoutReasonKey('bounds')).toBe('garden.edit.reason.bounds');
  expect(layoutReasonKey('')).toBeNull();
});

it('keeps one idem key per purchase intent until the server answers', async () => {
  fetchMock.mockResolvedValueOnce(reply(503, null));
  expect(await buyPlot(3, 'earth')).toEqual({ ok: false, kind: 'failed' });
  fetchMock.mockResolvedValueOnce(reply(200, { plot: { index: 3, element: 'earth' }, charged: 350, gold: 150, garden: SERVER_GARDEN }));
  const ok = await buyPlot(3, 'earth');
  const [first, second] = fetchMock.mock.calls.map(c => JSON.parse(c[1].body));
  expect(second.idem_key).toBe(first.idem_key);
  expect(first).toMatchObject({ index: 3, element: 'earth' });
  expect(ok).toMatchObject({ ok: true, gold: 150, plot: { index: 3, element: 'earth' } });

  fetchMock.mockResolvedValueOnce(reply(200, { plot: { index: 3, element: 'earth' }, gold: 150, garden: SERVER_GARDEN }));
  await buyPlot(3, 'earth');
  expect(JSON.parse(fetchMock.mock.calls[2][1].body).idem_key).not.toBe(first.idem_key);
});

it('reads the island refusals and the layout save outcomes', async () => {
  fetchMock.mockResolvedValueOnce(reply(402, { error_code: 'INSUFFICIENT_GOLD', price: 250, gold: 10 }));
  expect(await buyDecor('wind_chime', '1')).toEqual({ ok: false, kind: 'insufficientGold', price: 250, gold: 10 });
  fetchMock.mockResolvedValueOnce(reply(403, { error_code: 'LEVEL_LOCKED', level: 7 }));
  expect(await buyDecor('firefly_lantern', '1')).toEqual({ ok: false, kind: 'levelLocked', level: 7 });
  fetchMock.mockResolvedValueOnce(reply(409, { error_code: 'PLOT_FULL' }));
  expect(await plantSeed(4, 1)).toEqual({ ok: false, kind: 'refused', code: 'PLOT_FULL' });

  fetchMock.mockResolvedValueOnce(reply(409, { error_code: 'VERSION_CONFLICT', items: [], orb: null, music: null, version: 4 }));
  expect(await saveLayout({ items: [], orb: null, music: null }, 3)).toEqual({ kind: 'conflict', layout: { items: [], orb: null, music: null, version: 4 } });
  expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toEqual({ items: [], orb: null, music: null, version: 3 });
  expect(fetchMock.mock.calls[3][1].method).toBe('PUT');
});

describe('the bridge', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('remembers the island and the decor and replays them on GARDEN_READY', () => {
    const sent: any[] = [];
    const bridge = new NativeUnityBridge();
    bridge.registerView({ postMessage: (_o, _m, json) => sent.push(JSON.parse(json)) });
    bridge.openGarden({ lang: 'en', level: 4, progress: 0, energy: 0, variant: '' });
    const island = islandPayload(g(), { sky: 'night', rain: false }, null);
    bridge.sendGardenIsland(island);
    bridge.sendGardenLayout(null);
    sent.length = 0;
    bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_READY' }));
    expect(sent.map(m => m.type)).toEqual(['GARDEN_ISLAND', 'GARDEN_LAYOUT']);
    expect(sent[1].payload).toEqual({ layout: { items: null } });

    sent.length = 0;
    bridge.sendGardenEdit(true);
    bridge.sendGardenTap(0.5, 1.4);
    bridge.sendGardenDrag('begin', 0.1, 0.2);
    bridge.sendGardenRotate(-1);
    bridge.sendGardenAdd('pebble_ring');
    bridge.sendGardenRemove();
    bridge.sendGardenEdit(false, true);
    expect(sent.map(m => [m.type, m.payload])).toEqual([
      ['GARDEN_EDIT', { on: true }], ['GARDEN_TAP', { x: 0.5, y: 1 }], ['GARDEN_DRAG', { phase: 'begin', x: 0.1, y: 0.2 }],
      ['GARDEN_ROTATE', { step: -1 }], ['GARDEN_ADD', { item: 'pebble_ring' }], ['GARDEN_REMOVE', {}], ['GARDEN_EDIT', { on: false, cancel: true }],
    ]);
  });
});
