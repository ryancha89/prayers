/**
 * Meditation experiences (spec 010): the breath an experience is paced by, parameterised.
 *
 * The garden's `features/garden/breath.ts` hard-codes 4/0/6 and the breathing room's
 * `meditation/session.ts` hard-codes 4-4-6 — both on purpose, each room owning its own numbers.
 * This engine is the generalisation for the NEW experiences only: the config comes from the
 * server (contract.md §1 `breath`), the maths is the garden's, and neither existing file changes
 * (US3: shared pieces exist once, additions are configs).
 */
export type BreathPhase = 'in' | 'hold' | 'out';

export interface BreathConfig {
  inMs: number;
  holdMs: number;
  outMs: number;
}

/** What snow mountain breathes when the server did not say (its own answer is 4-4-6 too). */
export const DEFAULT_BREATH: BreathConfig = { inMs: 4000, holdMs: 4000, outMs: 6000 };

export const cycleMs = (c: BreathConfig): number => c.inMs + c.holdMs + c.outMs;

/** Where `elapsedMs` into a session falls in the guide's breath. A zero-length phase is skipped,
 *  so a hold-less config degrades to in/out without a flicker frame of 'hold'. */
export function phaseAt(c: BreathConfig, elapsedMs: number): { phase: BreathPhase; phaseProgress: number; cycle: number } {
  const t = Math.max(0, elapsedMs);
  const total = Math.max(1, cycleMs(c));
  const cycle = Math.floor(t / total);
  const into = t - cycle * total;
  if (into < c.inMs) return { phase: 'in', phaseProgress: c.inMs > 0 ? into / c.inMs : 0, cycle };
  if (into < c.inMs + c.holdMs) return { phase: 'hold', phaseProgress: c.holdMs > 0 ? (into - c.inMs) / c.holdMs : 0, cycle };
  return { phase: 'out', phaseProgress: c.outMs > 0 ? (into - c.inMs - c.holdMs) / c.outMs : 0, cycle };
}

/** The guide's breath as a ring size, 0 (empty) → 1 (full), eased like lungs; held full on the hold. */
export function guideFullness(c: BreathConfig, elapsedMs: number): number {
  const { phase, phaseProgress } = phaseAt(c, elapsedMs);
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (phase === 'in') return smooth(phaseProgress);
  if (phase === 'hold') return 1;
  return 1 - smooth(phaseProgress);
}

/** Whole guide breaths in `elapsedMs` — the result card's "N breaths". */
export const breathsIn = (c: BreathConfig, elapsedMs: number): number =>
  Math.floor(Math.max(0, elapsedMs) / Math.max(1, cycleMs(c)));
