import { useCallback, useEffect, useRef, useState } from 'react';
import type { TranslationKey } from '../../shared/i18n';
import {
  finishMeditation,
  newRequestId,
  startMeditation,
  type MeditationFinish,
  type MeditationKind,
} from './api/meditationsApi';

/**
 * One meditation sitting's lifecycle (spec 010, contract.md §3), shared by every experience:
 * start → (server answered AND the scene settled) → running → finishing → result.
 *
 * THE CLOCK STARTS LATE ON PURPOSE — the garden's rule, generalised. It starts only when BOTH the
 * server's start has answered and the scene's settle event (MEDI_EVENT `settled`, or its 4.5 s
 * fallback) has arrived, so the session the player saw is always a little shorter than the one
 * the server measured, and an honest finish can never be refused as early.
 *
 * NO PAUSE, AND LEAVING ASKS NOTHING OF THE SERVER. `leave()` only clears the timers: the open
 * session pays nothing and is abandoned by the next start of any kind (the 008 rule). TOO_EARLY
 * is answered by waiting out the seconds the server names and asking again, three times.
 */

/** No MEDI_EVENT `settled` after this (Unity silent, or absent): start the clock anyway —
 *  GARDEN_SEATED's number. */
export const SETTLE_FALLBACK_MS = 4500;
export const TOO_EARLY_TRIES = 3;

export type MeditationStep = 'idle' | 'starting' | 'running' | 'finishing' | 'result';

export interface UseMeditationSession {
  step: MeditationStep;
  error: TranslationKey | null;
  result: MeditationFinish | null;
  /** The minutes of the sitting under way (0 for the moktak — it has no countdown). */
  minutes: number;
  /** ms since the clock started; 0 before `running`. */
  elapsed: () => number;
  /** Start a sitting. The request_id is kept across a failed start, so its retry is the same session. */
  begin: (minutes?: number) => Promise<void>;
  /** The scene's settle beat arrived (MEDI_EVENT `settled`). Idempotent. */
  settle: () => void;
  /** Ask the server to pay. `taps` rides along for the moktak. Retries TOO_EARLY by itself. */
  finish: (extra?: { taps?: number }) => void;
  /** Clear a finish error and ask again (the result screen's Retry). */
  retryFinish: () => void;
  /** Walk away: timers cleared, NOTHING sent to the server. Back to `idle`. */
  leave: () => void;
}

export function useMeditationSession(opts: {
  kind: MeditationKind;
  onRunning?: () => void;
  /** How long to wait for MEDI_EVENT `settled` before going on. Screens pass 0 without Unity —
   *  there is nobody to settle (the garden's `unity ? fallback : 0` rule). */
  settleFallbackMs?: number;
}): UseMeditationSession {
  const { kind, settleFallbackMs = SETTLE_FALLBACK_MS } = opts;
  const [step, setStepState] = useState<MeditationStep>('idle');
  const stepRef = useRef<MeditationStep>('idle');
  const setStep = useCallback((s: MeditationStep) => {
    stepRef.current = s;
    setStepState(s);
  }, []);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [result, setResult] = useState<MeditationFinish | null>(null);
  const [minutes, setMinutes] = useState(0);

  const sessionId = useRef<number | null>(null);
  /** One start intent's request_id: kept across a failed start so its retry is the same session. */
  const requestId = useRef<string | null>(null);
  const started = useRef(false);
  const settled = useRef(false);
  const startedAt = useRef(0);
  const finishExtra = useRef<{ taps?: number } | undefined>(undefined);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  // The settle fallback and the TOO_EARLY waits call the latest closures, not the mount's.
  const onRunning = useRef(opts.onRunning);
  onRunning.current = opts.onRunning;

  /** Both halves are in (the server's start, the scene settled): the clock starts now. */
  const maybeRun = useCallback(() => {
    if (!started.current || !settled.current || stepRef.current !== 'starting') return;
    startedAt.current = Date.now();
    setStep('running');
    onRunning.current?.();
  }, [setStep]);

  const settle = useCallback(() => {
    settled.current = true;
    maybeRun();
  }, [maybeRun]);

  const begin = useCallback(
    async (m?: number) => {
      setError(null);
      setResult(null);
      started.current = false;
      settled.current = false;
      sessionId.current = null;
      setMinutes(m ?? 0);
      setStep('starting');
      // Unity settles its establishing shot and says MEDI_EVENT `settled`; without it, go on.
      later(settle, settleFallbackMs);
      requestId.current ??= newRequestId();
      const res = await startMeditation({ requestId: requestId.current, kind, minutes: m });
      if (stepRef.current !== 'starting') return; // left meanwhile
      if (!res.ok) {
        clearTimers();
        setError('meditations.error.start');
        setStep('idle');
        return;
      }
      requestId.current = null;
      sessionId.current = res.session.id;
      started.current = true;
      maybeRun();
    },
    [kind, maybeRun, setStep, settle, settleFallbackMs],
  );

  const ask = useCallback(
    async (tries: number) => {
      const id = sessionId.current;
      if (id == null) return;
      const res = await finishMeditation({ id, ...(finishExtra.current ?? {}) });
      if (stepRef.current !== 'finishing') return;
      if (res.ok) {
        setResult(res);
        setStep('result');
        return;
      }
      if (res.kind === 'tooEarly' && tries > 1) {
        // The server's clock has not caught up (ours started late, so this is rare): wait out the
        // seconds it names behind the finishing beat, then ask again.
        later(() => ask(tries - 1), res.secondsLeft * 1000);
        return;
      }
      if (res.kind === 'closed') {
        setError('meditations.error.closed');
        setStep('idle');
        return;
      }
      setError('meditations.error.finish');
    },
    [setStep],
  );

  const finish = useCallback(
    (extra?: { taps?: number }) => {
      if (stepRef.current !== 'running') return;
      finishExtra.current = extra;
      setStep('finishing');
      ask(TOO_EARLY_TRIES);
    },
    [ask, setStep],
  );

  const retryFinish = useCallback(() => {
    if (stepRef.current !== 'finishing') return;
    setError(null);
    ask(TOO_EARLY_TRIES);
  }, [ask]);

  const leave = useCallback(() => {
    // The server's open session stays open: it pays nothing unless finished, and the next start
    // (of any kind) abandons it. No call is the whole design.
    clearTimers();
    started.current = false;
    settled.current = false;
    setStep('idle');
  }, [setStep]);

  const elapsed = useCallback(() => {
    if (stepRef.current !== 'running' && stepRef.current !== 'finishing') return 0;
    return Date.now() - startedAt.current;
  }, []);

  useEffect(() => clearTimers, []);

  return { step, error, result, minutes, elapsed, begin, settle, finish, retryFinish, leave };
}
