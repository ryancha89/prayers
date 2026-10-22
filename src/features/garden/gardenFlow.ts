import type { TranslationKey } from '../../shared/i18n';
import type { Element, Garden } from './api/gardenApi';
import { levelProgress } from './api/gardenApi';
import type { GardenInitPayload } from '../counseling/types';

/**
 * Tree of Mind (spec 008): the screen's small decisions, out of the component so they can be tested.
 *
 * The garden screen is a short loop — garden → sitting → breathing → finishing → result (→ growing →
 * level up) → garden — and every step of it waits on something outside the app: the server's start,
 * the figure sitting down in Unity, the server's finish, the growth playing out. Each wait has a
 * fallback here, so a garden without the player (or a player that never answers) still runs the loop.
 */
export type GardenStep = 'loading' | 'error' | 'garden' | 'sitting' | 'breathing' | 'finishing' | 'result' | 'growing' | 'levelUp';

/** No GARDEN_READY after this: stay on the drawn garden, as every room does. */
export const READY_FALLBACK_MS = 8000;
/** No GARDEN_SEATED after this (Unity silent, or absent): start the clock anyway. */
export const SEATED_FALLBACK_MS = 4500;
/** No GARDEN_GROWN after this: show the new level anyway. */
export const GROWN_FALLBACK_MS = 9000;

/** Today's energy that makes the canopy glow fully — two ten-minute sittings. Visual only. */
export const ENERGY_GLOW_FULL = 300;

export const energyGlow = (todayEnergy: number): number => Math.max(0, Math.min(1, todayEnergy / ENERGY_GLOW_FULL));

export function gardenInit(lang: string, g: Garden): GardenInitPayload {
  return { lang, level: g.level, progress: levelProgress(g), energy: energyGlow(g.today.energy), variant: g.variant ?? '' };
}

export const stageKey = (level: number): TranslationKey =>
  `garden.stage.${Math.max(1, Math.min(10, Math.round(level)))}` as TranslationKey;

export const elementKey = (e: Element): TranslationKey => `garden.element.${e}` as TranslationKey;

/** The line under Sit about today's cap, or null when the next sitting pays in full. */
export function nextNoteKey(nextPercent: number): TranslationKey | null {
  if (nextPercent >= 100) return null;
  return nextPercent > 0 ? 'garden.next.half' : 'garden.next.energy';
}

/** The result card's line about the cap, or null when the sitting was paid in full. */
export function resultNoteKey(percent: number): TranslationKey | null {
  if (percent >= 100) return null;
  return percent > 0 ? 'garden.result.half' : 'garden.result.energyOnly';
}

/** XP still needed for the next level, or null at the top. */
export const xpToNext = (g: Pick<Garden, 'levelXp' | 'levelSpan'>): number | null =>
  g.levelSpan == null ? null : Math.max(0, g.levelSpan - g.levelXp);

export function clock(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
