/**
 * The wooden fish's count (spec 010 US1), without a screen.
 *
 * RN OWNS THE FLOOR (FR-004, /speckit-analyze I1): the server never sees individual taps — it
 * records the reported total and guards elapsed time with MOKTAK_MIN_SECONDS — so the only thing
 * standing between 108 honest strikes and 108 drummed ones is this floor. It is measured from the
 * last COUNTED tap: a burst of fast touches keeps being refused until one lands a full floor after
 * the last strike that counted, instead of the burst re-arming its own window.
 *
 * A refused tap still SOUNDS (the screen plays the hit either way, acceptance #3); it just does
 * not move the count. Tapping never takes anything away.
 */
export const TAP_FLOOR_MS = 250;
export const MOKTAK_TAPS = 108;

export interface MoktakTap {
  /** This tap moved the count. */
  counted: boolean;
  /** The count after this tap (unchanged when not counted). */
  count: number;
  /** The 108th strike has landed — flipped by that strike and never unflipped. */
  done: boolean;
}

export class MoktakCount {
  private taps = 0;
  private lastCountedAt: number | null = null;

  get count(): number {
    return this.taps;
  }

  get done(): boolean {
    return this.taps >= MOKTAK_TAPS;
  }

  /** A touch at `nowMs` (any monotonic clock — the tests feed a fake one). */
  tap(nowMs: number): MoktakTap {
    if (this.done) return { counted: false, count: this.taps, done: true };
    if (this.lastCountedAt != null && nowMs - this.lastCountedAt < TAP_FLOOR_MS) {
      return { counted: false, count: this.taps, done: false };
    }
    this.lastCountedAt = nowMs;
    this.taps += 1;
    return { counted: true, count: this.taps, done: this.done };
  }

  reset(): void {
    this.taps = 0;
    this.lastCountedAt = null;
  }
}
