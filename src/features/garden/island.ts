import type { TranslationKey } from '../../shared/i18n';
import { meditationBed, type Bed } from '../../shared/audio/backgroundMusic';
import type { GardenIslandPayload, MyRoomItem } from '../counseling/types';
import { copiesLeft } from '../myroom/edit/decorate';
import type { DecorSpec, Element, Garden, GardenCatalog, SeedSpec, ShopFailure } from './api/gardenApi';

/**
 * Tree of Mind phase 2 (TreeOfMind-Growth.html §3.3–3.6): the island's small decisions, out of the
 * screen so they can be pinned. Every number comes from the server (garden + catalog); nothing here
 * prices, levels or grows anything — it only says what the screen may offer and how to word a refusal.
 */

export const ELEMENTS: readonly Element[] = ['water', 'metal', 'earth', 'fire', 'wood'];

export type Sky = 'night' | 'dusk' | 'day';
export const SKIES: readonly Sky[] = ['night', 'dusk', 'day'];

/** The garden as Unity's GARDEN_ISLAND wants it: seeds in the ground only, growth as 0..1. */
export function islandPayload(g: Garden, env: { sky: Sky; rain: boolean }, orb: string | null): GardenIslandPayload {
  return {
    plots: g.plots.map(p => ({ index: p.index, level: p.level, owned: p.owned, unlocked: p.unlocked, element: p.element })),
    seeds: g.seeds
      .filter(s => s.status !== 'packet' && s.plot != null)
      .map(s => ({ id: s.id, species: s.species, element: s.element, status: s.status as 'growing' | 'mature', plot: s.plot!,
                   progress: Math.max(0, Math.min(1, s.grown / s.need)) })),
    unlocks: { ...g.unlocks },
    env: { sky: g.unlocks.time_of_day ? env.sky : 'day', rain: g.unlocks.rain && env.rain },
    orb,
  };
}

export interface ForSale<T> { spec: T; open: boolean }

/** Seeds in the catalog's order, each marked open (the tree's level is there) or not. */
export const seedsForSale = (c: GardenCatalog, level: number): ForSale<SeedSpec>[] =>
  c.seeds.map(spec => ({ spec, open: level >= spec.level }));

/** Decor on sale (the My Room tier is listed by the server but off sale — not shown here). */
export const decorForSale = (c: GardenCatalog, level: number): ForSale<DecorSpec>[] =>
  c.decor.filter(d => d.on_sale).map(spec => ({ spec, open: level >= spec.level }));

/** Owned plots that can take one more seed, with how many slots are left. */
export function plantablePlots(g: Garden, seedsPerPlot: number): { index: number; element: Element | null; free: number }[] {
  return g.plots
    .filter(p => p.owned)
    .map(p => ({ index: p.index, element: p.element, free: seedsPerPlot - g.seeds.filter(s => s.status === 'growing' && s.plot === p.index).length }))
    .filter(p => p.free > 0);
}

/** Seed packets waiting to be planted. */
export const packets = (g: Garden) => g.seeds.filter(s => s.status === 'packet');

/** Placeable decor the account owns and has not placed: My Room's arithmetic on the garden's counts. */
export function decorLeft(owned: Record<string, number>, items: MyRoomItem[] | null, catalog: GardenCatalog): Record<string, number> {
  const placeable = new Set(catalog.decor.filter(d => d.kind === 'place').map(d => d.id));
  const left = copiesLeft({ items: owned, themes: [] }, { theme: '', items });
  return Object.fromEntries(Object.entries(left).filter(([id]) => placeable.has(id)));
}

/** True when the account owns `id` (effects: orb colour, music). */
export const ownsEffect = (owned: Record<string, number>, id: string) => (owned[id] ?? 0) > 0;

/** The bed a sitting plays (T070): the layout's music decor when one is chosen, the meditation
 *  bed otherwise. An id this build does not know falls back to the bed too — a server that later
 *  sells `music_stream` must not silence older apps. */
export function musicBed(music: string | null, lang: string): Bed {
  if (music === 'music_rain') return 'gardenRain';
  if (music === 'music_campfire') return 'gardenCampfire';
  return meditationBed(lang);
}

export function shopErrorKey(f: ShopFailure): TranslationKey {
  switch (f.kind) {
    case 'insufficientGold': return 'garden.error.gold';
    case 'levelLocked': return 'garden.error.level';
    case 'failed': return 'garden.error.offline';
    case 'refused':
      if (f.code === 'PLOT_FULL') return 'garden.error.plotFull';
      if (f.code === 'ALREADY_OWNED') return 'garden.error.owned';
      return 'garden.error.refused';
  }
}

/** Why Done is disabled in decor edit mode. */
export function layoutReasonKey(reason: string): TranslationKey | null {
  switch (reason) {
    case 'bounds': return 'garden.edit.reason.bounds';
    case 'overlap': return 'garden.edit.reason.overlap';
    case 'no_space': return 'garden.edit.reason.noSpace';
    case '': return null;
    default: return 'garden.edit.reason.other';
  }
}

export const seedKey = (id: string) => `garden.seed.${id}` as TranslationKey;
export const decorKey = (id: string) => `garden.decor.${id}` as TranslationKey;
export const biomeKey = (e: Element) => `garden.biome.${e}` as TranslationKey;
export const skyKey = (s: Sky) => `garden.sky.${s}` as TranslationKey;
