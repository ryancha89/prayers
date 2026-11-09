import { breathsIn, phaseAt, rhythmCycle, type GardenPhase } from './breath';

/**
 * One sitting under the tree, without a screen: the clock and the touches. Injectable clock, so a ten
 * minute session is walked in a millisecond of fake time (meditation/session.ts's rule).
 *
 * NO PAUSE. The server pays a session that has really lasted its minutes since `start` answered, and
 * Stop simply leaves (nothing is paid, the open session is abandoned by the next start). A pause would
 * only be a way to make the clock on screen disagree with the one on the server.
 */
export interface Clock {
  now(): number;
}

export const realClock: Clock = { now: () => Date.now() };

export interface GardenSessionState {
  status: 'idle' | 'running' | 'done';
  phase: GardenPhase;
  phaseProgress: number;
  /** Whole seconds left, rounded UP so the clock never shows 0:00 with time still to run. */
  remainingSeconds: number;
  /** Guide breaths completed. */
  breaths: number;
  /** Distinct breaths the player took with the guide (held on the in-breath, let go on the out). */
  inRhythm: number;
}

export class GardenSession {
  private clock: Clock;
  private startedAt = 0;
  private lengthMs = 0;
  private running = false;
  private downAt: number | null = null;
  private matched = new Set<number>();

  constructor(clock: Clock = realClock) {
    this.clock = clock;
  }

  /** Starts the clock for `minutes`. Call it when the server has answered `start` (and the figure has
   *  sat down) — never before, or an honest finish could reach the server early. */
  start(minutes: number): void {
    this.lengthMs = Math.max(0, minutes) * 60 * 1000;
    this.startedAt = this.clock.now();
    this.running = true;
    this.downAt = null;
    this.matched.clear();
  }

  stop(): void {
    this.running = false;
    this.downAt = null;
  }

  get minutes(): number {
    return this.lengthMs / 60000;
  }

  elapsed(): number {
    if (!this.running) return 0;
    return Math.min(this.lengthMs, this.clock.now() - this.startedAt);
  }

  /** The finger went down (the in-breath). */
  press(): void {
    if (this.running) this.downAt = this.elapsed();
  }

  /** The finger lifted (the out-breath). True when that breath followed the guide. */
  release(): boolean {
    if (!this.running || this.downAt == null) return false;
    const cycle = rhythmCycle(this.downAt, this.elapsed());
    this.downAt = null;
    if (cycle < 0) return false;
    this.matched.add(cycle);
    return true;
  }

  read(): GardenSessionState {
    if (!this.running) {
      return { status: 'idle', phase: 'in', phaseProgress: 0, remainingSeconds: 0, breaths: 0, inRhythm: 0 };
    }
    const elapsed = this.elapsed();
    const { phase, phaseProgress } = phaseAt(elapsed);
    return {
      status: elapsed >= this.lengthMs ? 'done' : 'running',
      phase,
      phaseProgress,
      remainingSeconds: Math.ceil((this.lengthMs - elapsed) / 1000),
      breaths: breathsIn(elapsed),
      inRhythm: this.matched.size,
    };
  }
}
