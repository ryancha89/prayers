import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '../../../shared/i18n';
import { journeySubject } from '../store/journeyProfileStore';
import { fetchJourneyReport, journeyBirthOf, journeyNameOf } from '../api/journeyApi';
import { unlockMoment, type UnlockFailure } from '../player/unlockMoment';
import { useSavedJourneys, withPart } from '../store/savedJourneysStore';
import { useJourneyPlayer } from '../player/journeyPlayer';
import type { JourneyReport } from '../types';

/** While the server is still writing, ask again this often. */
const POLL_MS = 4000;
/** Stop asking after this long without the report finishing (the server retries on the next ask). */
const POLL_GIVE_UP_MS = 4 * 60 * 1000;

export interface ReportState {
  report: JourneyReport | null;
  /** The first fetch failed and nothing is shown yet. */
  failed: boolean;
  unlocking: string | null;
  /** The last unlock that failed, and why. */
  unlockError: { momentId: string; reason: UnlockFailure['kind'] } | null;
  retry: () => void;
  unlock: (momentId: string) => Promise<void>;
}

/**
 * The journey's long report for this guide, fetched and polled until the server has written every
 * section. Unlocking a block from here is the same paid moment the train sells (unlockMoment):
 * the player's content and the saved journey learn about it too, so the ride and the archive agree.
 */
export function useJourneyReport(
  journeyId: string | null,
  counselorId: string | null,
  tone: string | null,
  lang: Lang,
): ReportState {
  const [report, setReport] = useState<JourneyReport | null>(null);
  const [failed, setFailed] = useState(false);
  const [unlocking, setUnlocking] = useState<string | null>(null);
  const [unlockError, setUnlockError] = useState<ReportState['unlockError']>(null);
  const [nonce, setNonce] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    if (!journeyId || !tone) return null;
    const who = journeySubject();
    return fetchJourneyReport(journeyId, tone, lang, journeyBirthOf(who), signal, journeyNameOf(who));
  }, [journeyId, tone, lang]);

  useEffect(() => {
    if (!journeyId || !tone) return;
    const ctrl = new AbortController();
    const started = Date.now();
    let alive = true;
    const tick = async () => {
      const r = await load(ctrl.signal);
      if (!alive) return;
      if (r) {
        setReport(r);
        setFailed(false);
      } else {
        setFailed(true);
      }
      const done = r?.status === 'ready';
      if (!done && Date.now() - started < POLL_GIVE_UP_MS) timer.current = setTimeout(tick, POLL_MS);
    };
    tick();
    return () => {
      alive = false;
      ctrl.abort();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [journeyId, tone, load, nonce]);

  const unlock = useCallback(async (momentId: string) => {
    if (!journeyId || !counselorId || !tone || unlocking) return;
    setUnlocking(momentId);
    setUnlockError(null);
    const result = await unlockMoment({ journeyId, momentId, tone, lang });
    if (!result.ok) {
      // The wallet is already written by unlockMoment (402 and 200 alike).
      setUnlockError({ momentId, reason: result.kind });
      setUnlocking(null);
      return;
    }
    const chapterId = momentId.split('#')[0];
    result.parts.forEach(p => useSavedJourneys.getState().addUnlock(journeyId, counselorId, chapterId, p, result.summary));
    const player = useJourneyPlayer.getState();
    if (player.journeyId === journeyId && player.counselorId === counselorId && player.content) {
      const content = result.parts.reduce((c, p) => withPart(c, chapterId, p, result.summary), player.content);
      useJourneyPlayer.setState({ content });
    }
    const r = await load();
    if (r) setReport(r);
    setUnlocking(null);
  }, [journeyId, counselorId, tone, lang, unlocking, load]);

  return { report, failed: failed && !report, unlocking, unlockError, retry: () => setNonce(n => n + 1), unlock };
}
