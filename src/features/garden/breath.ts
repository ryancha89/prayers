/**
 * Tree of Mind (spec 008): the breath a garden session is paced by, and how a touch is read against it.
 * Pure, so the screen, the orb in Unity and the tests agree by construction.
 *
 * 4 s IN, 6 s OUT, NO HOLD. ASSUMPTION (proposal §8 Q3, its own recommendation): the brief asks for no
 * held breath, and an out-breath longer than the in-breath is the calming pattern. It is NOT the
 * meditation room's 4-4-6 (meditation/session.ts) — a different room with a different exercise, so
 * the two numbers are kept apart on purpose. Mirrored by the server's Prayers::GardenRules::BREATH.
 *
 * TOUCH NEVER COSTS ANYTHING. Holding the screen is breathing in, letting go is breathing out; a
 * player who never touches still has a full session. A press that follows the guide is only counted
 * as "in rhythm", which makes the tree's light brighter — it is reported to the server for tuning,
 * and no reward reads it.
 */
export type GardenPhase = 'in' | 'out';

export const INHALE_MS = 4000;
export const EXHALE_MS = 6000;
export const BREATH_MS = INHALE_MS + EXHALE_MS;

/** How far a press may start from the guide's in-breath, and end from its out-breath, and still be
 *  "in rhythm". Generous: this is a nudge toward the guide, not a timing game. */
export const RHYTHM_TOLERANCE_MS = 1200;

/** Where `elapsedMs` into a session falls in the guide's breath. */
export function phaseAt(elapsedMs: number): { phase: GardenPhase; phaseProgress: number; cycle: number } {
  const t = Math.max(0, elapsedMs);
  const cycle = Math.floor(t / BREATH_MS);
  const into = t - cycle * BREATH_MS;
  if (into < INHALE_MS) return { phase: 'in', phaseProgress: into / INHALE_MS, cycle };
  return { phase: 'out', phaseProgress: (into - INHALE_MS) / EXHALE_MS, cycle };
}

/** The guide's breath as an orb size, 0 (empty) → 1 (full), eased like lungs. */
export function guideFullness(elapsedMs: number): number {
  const { phase, phaseProgress } = phaseAt(elapsedMs);
  const smooth = (x: number) => x * x * (3 - 2 * x);
  return phase === 'in' ? smooth(phaseProgress) : 1 - smooth(phaseProgress);
}

/** Distance from `ms` to the nearest point of the series `offset + k·BREATH_MS`. */
function offBeat(ms: number, offset: number): number {
  const into = (((ms - offset) % BREATH_MS) + BREATH_MS) % BREATH_MS;
  return Math.min(into, BREATH_MS - into);
}

/**
 * Was this press a breath taken with the guide? `downMs` / `upMs` are session-elapsed times. In rhythm
 * = the finger went down near an in-breath's start and lifted near the following out-breath's start.
 * Returns the guide cycle it matched, or -1.
 */
export function rhythmCycle(downMs: number, upMs: number): number {
  if (!(upMs > downMs)) return -1;
  if (offBeat(downMs, 0) > RHYTHM_TOLERANCE_MS) return -1;
  // The in-breath the press belongs to (a press a moment early belongs to the next one).
  const cycle = Math.round(downMs / BREATH_MS);
  const exhaleAt = cycle * BREATH_MS + INHALE_MS;
  return Math.abs(upMs - exhaleAt) <= RHYTHM_TOLERANCE_MS ? cycle : -1;
}

/** Whole guide breaths in `elapsedMs` — the result card's "N breaths". */
export const breathsIn = (elapsedMs: number): number => Math.floor(Math.max(0, elapsedMs) / BREATH_MS);

/** What Unity needs to breathe the orb and the seated figure in step with the guide (GARDEN_STATE). */
export function breathSync(elapsedMs: number) {
  return { inMs: INHALE_MS, outMs: EXHALE_MS, intoMs: Math.max(0, elapsedMs) % BREATH_MS };
}
