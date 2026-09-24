/**
 * A meditation session, without a screen.
 *
 * Ten minutes of breathing, paced by text and music — no guided voice (decided 15-09). The pacing
 * is the whole feature, so it lives here as a pure state machine with an injectable clock: a ten
 * minute session can then be walked in a millisecond of fake time, which is the only way anyone is
 * going to check that the last breath ends where the session does.
 *
 * WHY A CYCLE OF 4-4-6 AND NOT BOX BREATHING
 * A longer out-breath than in-breath is what makes the pattern calming rather than merely regular;
 * equal box breathing is a focus drill. Fourteen seconds a cycle also lands close to the six
 * breaths a minute that the research on slow breathing keeps circling, without asking a beginner to
 * hold for as long as 4-7-8 does.
 */
export type Phase = 'in' | 'hold' | 'out';

export interface PhaseStep {
  phase: Phase;
  seconds: number;
}

/** One breath. Exported so the screen can size its ring from the same numbers. */
export const BREATH: readonly PhaseStep[] = [
  { phase: 'in', seconds: 4 },
  { phase: 'hold', seconds: 4 },
  { phase: 'out', seconds: 6 },
];

export const CYCLE_MS = BREATH.reduce((ms, s) => ms + s.seconds * 1000, 0);

/** The breath pattern and where a session `elapsedMs` in sits in it — what the 3D room needs to
 *  breathe in step with the ring. The room clocks the cycle on from `intoMs` itself. */
export function breathSync(elapsedMs: number) {
  const ms = (p: Phase) => (BREATH.find(s => s.phase === p)?.seconds ?? 0) * 1000;
  return { inMs: ms('in'), holdMs: ms('hold'), outMs: ms('out'), intoMs: Math.max(0, elapsedMs) % CYCLE_MS };
}

/** The session length. One number, because the picker was cut: ten minutes, decided 15-09. */
export const SESSION_MS = 10 * 60 * 1000;

export interface SessionState {
  /** `idle` before the first start and after the player leaves; `done` when the time is up. */
  status: 'idle' | 'running' | 'paused' | 'done';
  /** Which part of the breath is being asked for now. */
  phase: Phase;
  /** 0 → 1 through the CURRENT phase. Drives the ring. */
  phaseProgress: number;
  /** 0 → 1 through the whole session. Drives the bar and the "how much is left" copy. */
  progress: number;
  /** Whole seconds left, for the clock. Rounded UP so it never shows 0:00 with time still to run. */
  remainingSeconds: number;
  /** Breaths completed. The end card says this instead of a score. */
  breaths: number;
}

const START: SessionState = {
  status: 'idle',
  phase: 'in',
  phaseProgress: 0,
  progress: 0,
  remainingSeconds: Math.ceil(SESSION_MS / 1000),
  breaths: 0,
};

/** Where in the breath cycle `elapsed` falls. Pure, so the screen and the tests agree by
 *  construction rather than by both being right. */
export function phaseAt(elapsedMs: number): { phase: Phase; phaseProgress: number } {
  const into = elapsedMs % CYCLE_MS;
  let seen = 0;
  for (const step of BREATH) {
    const len = step.seconds * 1000;
    if (into < seen + len) {
      return { phase: step.phase, phaseProgress: (into - seen) / len };
    }
    seen += len;
  }
  // Unreachable while BREATH has any length; kept total rather than asserting, because a wrong
  // frame is better than a crashed session.
  return { phase: 'out', phaseProgress: 1 };
}

export function stateAt(elapsedMs: number, status: SessionState['status']): SessionState {
  const clamped = Math.max(0, Math.min(SESSION_MS, elapsedMs));
  const { phase, phaseProgress } = phaseAt(clamped);
  const over = clamped >= SESSION_MS;
  return {
    status: over ? 'done' : status,
    phase,
    phaseProgress,
    progress: clamped / SESSION_MS,
    remainingSeconds: Math.ceil((SESSION_MS - clamped) / 1000),
    breaths: Math.floor(clamped / CYCLE_MS),
  };
}

export interface Clock {
  now(): number;
}

export const realClock: Clock = { now: () => Date.now() };

/**
 * The session itself. Owns only elapsed time — the screen owns the frames.
 *
 * Pausing keeps the elapsed time rather than the start time, so a session paused at minute four and
 * resumed tomorrow still has six minutes left rather than none.
 */
export class MeditationSession {
  private clock: Clock;
  private startedAt = 0;
  private carried = 0;
  private running = false;

  constructor(clock: Clock = realClock) {
    this.clock = clock;
  }

  start(): void {
    if (this.running) return;
    this.startedAt = this.clock.now();
    this.running = true;
  }

  pause(): void {
    if (!this.running) return;
    this.carried = this.elapsed();
    this.running = false;
  }

  reset(): void {
    this.running = false;
    this.startedAt = 0;
    this.carried = 0;
  }

  elapsed(): number {
    return this.running ? this.carried + (this.clock.now() - this.startedAt) : this.carried;
  }

  read(): SessionState {
    if (!this.running && this.carried === 0) return START;
    return stateAt(this.elapsed(), this.running ? 'running' : 'paused');
  }
}
