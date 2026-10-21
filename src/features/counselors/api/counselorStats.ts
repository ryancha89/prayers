import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { useCounselorStats } from '../store/counselorStatsStore';

/**
 * The real "N회 상담" on each counselor card (saju_server `GET prayers/counselors/stats`):
 *
 *   { success: true, counts: { yuna: 37, yunjung: 5, … } }   — keyed by CARD id
 *
 * One consultation = one visit with a counselor that got at least one answer (the server's
 * Prayers::CounselorStats). A counselor nobody has consulted is absent (displayed as zero). Null = no answer (offline,
 * signed out, a server without the route) — the caller keeps what it has.
 */
export async function fetchCounselorStats(signal?: AbortSignal): Promise<Record<string, number> | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/counselors/stats`, {
      signal,
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!res?.ok) return null;
    const body: any = await res.json();
    if (body?.success !== true || !body.counts || typeof body.counts !== 'object') return null;
    const counts: Record<string, number> = {};
    for (const [id, n] of Object.entries(body.counts)) {
      const value = Number(n);
      if (Number.isFinite(value) && value > 0) counts[id] = Math.floor(value);
    }
    return counts;
  } catch {
    return null;
  }
}

/** Fill the store from the server (Home, on focus). */
export async function refreshCounselorStats(signal?: AbortSignal): Promise<void> {
  const counts = await fetchCounselorStats(signal);
  if (counts && !signal?.aborted) useCounselorStats.getState().setCounts(counts);
}
