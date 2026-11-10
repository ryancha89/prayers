import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from '../../auth/api/headers';
import {
  localDate,
  newRequestId,
  readGarden,
  type Garden,
  type GardenFailure,
  type GardenResult,
  type GardenReward,
} from '../../garden/api/gardenApi';
import type { BreathConfig } from '../breathEngine';

/**
 * Meditation experiences on saju_server (spec 010, specs/010-meditation-experiences/contract.md §1):
 *
 *   GET  prayers/meditations?local_date=        → { experiences, today, garden, session }
 *   POST prayers/meditations                    → { session, replayed }  {request_id, kind, minutes?, local_date}
 *   POST prayers/meditations/:id/finish         → { reward, level_up, level_before, garden }  {taps?}
 *
 * The sessions ARE the garden's rows (prayers_garden_sessions + kind), so the daily cap, the
 * TOO_EARLY guard, the 2 h finish window and the Gold ledger are the garden's, shared across
 * kinds. THE SERVER DECIDES THE REWARD (FR-001): this file only asks and reads — the durations,
 * the XP/Gold per row and the day's percent all come back from the server, and nothing here
 * computes them. A start carries a `request_id` the caller keeps for one sitting, so a retried
 * start is the same session (gardenApi's rule).
 */

export type MeditationKind = 'moktak' | 'snow_mountain';

export interface MoktakSpec {
  taps: number;
  minSeconds: number;
  reward: { xp: number; gold: number; energy: number };
}

export interface SnowDuration {
  minutes: number;
  xp: number;
  gold: number;
  energy: number;
}

export interface SnowSpec {
  breath: BreathConfig;
  durations: SnowDuration[];
}

export interface MeditationSessionInfo {
  id: number;
  kind: MeditationKind;
  minutes: number;
  status: string;
}

export interface MeditationsMenu {
  /** null = the server's menu did not carry that experience (an older deploy): its card hides. */
  moktak: MoktakSpec | null;
  snow: SnowSpec | null;
  /** `finished` counts finished sittings of the date ACROSS ALL KINDS, garden included;
   *  `nextPercent` is what the next finish pays (100/50/0). */
  today: { localDate: string; finished: number; nextPercent: number };
  garden: Garden | null;
  /** The account's open session of any kind, if one exists. */
  session: MeditationSessionInfo | null;
}

export interface MeditationFinish {
  reward: GardenReward;
  levelUp: boolean;
  levelBefore: number;
  garden: Garden | null;
}

export { newRequestId };
export type { GardenFailure as MeditationFailure, GardenResult as MeditationResult };

const num = (v: unknown, fallback = 0): number => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: any } | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/${path}`, init);
    if (!res) return null;
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    devlog(`[meditations] ${path} failed: ${String(e)}`);
    return null;
  }
}

function failure(r: { status: number; body: any } | null, path: string): GardenFailure {
  if (r?.status === 422 && r.body?.error_code === 'TOO_EARLY') {
    return { ok: false, kind: 'tooEarly', secondsLeft: Math.max(1, num(r.body.seconds_left, 1)) };
  }
  if (r?.status === 409 && r.body?.error_code === 'SESSION_CLOSED') {
    return { ok: false, kind: 'closed', status: String(r.body.status ?? '') };
  }
  devlog(`[meditations] ${path} refused: HTTP ${r?.status ?? '-'} ${r?.body?.error_code ?? ''}`);
  return { ok: false, kind: 'failed' };
}

const KINDS = new Set<string>(['moktak', 'snow_mountain']);

function readSession(s: any): MeditationSessionInfo | null {
  if (!s || !Number.isFinite(Number(s.id))) return null;
  return {
    id: num(s.id),
    kind: (KINDS.has(s.kind) ? s.kind : 'moktak') as MeditationKind,
    minutes: num(s.minutes),
    status: String(s.status ?? ''),
  };
}

function readMoktak(e: any): MoktakSpec {
  return {
    taps: num(e?.taps, 108),
    minSeconds: num(e?.min_seconds, 240),
    reward: { xp: num(e?.reward?.xp), gold: num(e?.reward?.gold), energy: num(e?.reward?.energy) },
  };
}

function readSnow(e: any): SnowSpec {
  return {
    breath: {
      inMs: num(e?.breath?.in_ms, 4000),
      holdMs: num(e?.breath?.hold_ms, 4000),
      outMs: num(e?.breath?.out_ms, 6000),
    },
    durations: Array.isArray(e?.durations)
      ? e.durations
          .map((d: any) => ({ minutes: num(d?.minutes), xp: num(d?.xp), gold: num(d?.gold), energy: num(d?.energy) }))
          .filter((d: SnowDuration) => d.minutes > 0)
      : [],
  };
}

/** The menu for the door cards (contract §1 GET). One canonical shape for every client. */
export async function fetchMeditations(date = localDate()): Promise<MeditationsMenu | null> {
  const r = await call(`meditations?local_date=${encodeURIComponent(date)}`);
  if (r?.status !== 200 || r.body?.success !== true) return null;
  const experiences: any[] = Array.isArray(r.body.experiences) ? r.body.experiences : [];
  const moktak = experiences.find(e => e?.kind === 'moktak');
  const snow = experiences.find(e => e?.kind === 'snow_mountain');
  return {
    moktak: moktak ? readMoktak(moktak) : null,
    snow: snow ? readSnow(snow) : null,
    today: {
      localDate: typeof r.body.today?.local_date === 'string' ? r.body.today.local_date : date,
      finished: num(r.body.today?.finished),
      nextPercent: num(r.body.today?.next_percent, 100),
    },
    garden: readGarden(r.body.garden),
    session: readSession(r.body.session),
  };
}

/** `minutes` only for snow_mountain (∈ {3,5,10,20}); the server stores the moktak's own nominal
 *  length itself. A new start abandons the open session of ANY kind — the garden's one-sitting rule. */
export async function startMeditation(req: {
  requestId: string;
  kind: MeditationKind;
  minutes?: number;
  date?: string;
}): Promise<GardenResult<{ session: MeditationSessionInfo }>> {
  const path = 'meditations';
  const body: Record<string, unknown> = { request_id: req.requestId, kind: req.kind, local_date: req.date ?? localDate() };
  if (req.minutes != null) body.minutes = req.minutes;
  const r = await call(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const session = r?.status === 200 ? readSession(r.body?.session) : null;
  return session ? { ok: true, session } : failure(r, path);
}

/** `taps` is reported for the moktak and recorded; the reward does NOT scale with it (contract §1). */
export async function finishMeditation(req: { id: number; taps?: number }): Promise<GardenResult<MeditationFinish>> {
  const path = `meditations/${req.id}/finish`;
  const r = await call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req.taps == null ? {} : { taps: req.taps }),
  });
  if (r?.status !== 200 || r.body?.success !== true || !r.body?.reward) return failure(r, path);
  const w = r.body.reward;
  return {
    ok: true,
    reward: { xp: num(w.xp), gold: num(w.gold), energy: num(w.energy), percent: num(w.percent, 100), dayIndex: num(w.day_index, 1) },
    levelUp: r.body.level_up === true,
    levelBefore: num(r.body.level_before, 1),
    garden: readGarden(r.body.garden),
  };
}
