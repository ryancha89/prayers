import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { uuidV4 } from '../../../shared/uuid';
import { authedFetch } from '../../auth/api/headers';

/**
 * Tree of Mind on saju_server (spec 008, specs/008-tree-of-mind/contract.md):
 *
 *   GET  prayers/garden?local_date=            → { garden, durations, rules, session }
 *   POST prayers/garden/sessions               → { session, replayed }       {request_id, minutes, local_date}
 *   POST prayers/garden/sessions/:id/finish    → { reward, level_up, garden } {breaths, in_rhythm}
 *
 * THE SERVER DECIDES THE REWARD. This file only asks and reads: XP, Gold, energy, the level and the
 * daily cap all come back from the server, and nothing here computes them. A start carries a
 * `request_id` the caller keeps for one sitting, so a retried start is the same session.
 */

export type Element = 'water' | 'metal' | 'earth' | 'fire' | 'wood';

export interface Garden {
  level: number;
  /** The level's heavenly stem, as its hanja (癸 … 甲). */
  stem: string;
  element: Element;
  xp: number;
  /** XP into the current level, and the XP the level spans (null at the top level). */
  levelXp: number;
  levelSpan: number | null;
  maxLevel: number;
  gold: number;
  energyTotal: number;
  today: { localDate: string; finished: number; energy: number; nextPercent: number };
  /** Day-master personalisation — a seam, always null in phase 1. */
  variant: string | null;
}

export interface GardenDuration {
  minutes: number;
  xp: number;
  gold: number;
  energy: number;
}

export interface GardenSessionInfo {
  id: number;
  minutes: number;
  status: string;
  seconds: number;
}

export interface GardenReward {
  xp: number;
  gold: number;
  energy: number;
  percent: number;
  dayIndex: number;
}

export interface GardenFinish {
  reward: GardenReward;
  levelUp: boolean;
  levelBefore: number;
  garden: Garden;
}

export type GardenFailure =
  /** 422 TOO_EARLY: the server's clock says the session is not over yet. */
  | { ok: false; kind: 'tooEarly'; secondsLeft: number }
  /** 409 SESSION_CLOSED: replaced by a newer start, or finished too long after its end. */
  | { ok: false; kind: 'closed'; status: string }
  /** No answer, a 5xx, or one that could not be read: retry. */
  | { ok: false; kind: 'failed' };

export type GardenResult<T> = ({ ok: true } & T) | GardenFailure;

export const newRequestId = (): string => uuidV4();

/** The phone's date, YYYY-MM-DD — the day the server counts the daily cap against. */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const num = (v: unknown, fallback = 0): number => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : fallback);
const ELEMENTS = new Set<string>(['water', 'metal', 'earth', 'fire', 'wood']);

export function readGarden(g: any): Garden | null {
  if (!g || !Number.isFinite(Number(g.level))) return null;
  return {
    level: num(g.level, 1),
    stem: typeof g.stem === 'string' ? g.stem : '',
    element: (ELEMENTS.has(g.element) ? g.element : 'water') as Element,
    xp: num(g.xp),
    levelXp: num(g.level_xp),
    levelSpan: g.level_span == null ? null : num(g.level_span),
    maxLevel: num(g.max_level, 10),
    gold: num(g.gold),
    energyTotal: num(g.energy_total),
    today: {
      localDate: typeof g.today?.local_date === 'string' ? g.today.local_date : '',
      finished: num(g.today?.finished),
      energy: num(g.today?.energy),
      nextPercent: num(g.today?.next_percent, 100),
    },
    variant: typeof g.variant === 'string' ? g.variant : null,
  };
}

function readSession(s: any): GardenSessionInfo | null {
  if (!s || !Number.isFinite(Number(s.id))) return null;
  return { id: num(s.id), minutes: num(s.minutes), status: String(s.status ?? ''), seconds: num(s.seconds) };
}

async function call(path: string, init?: RequestInit): Promise<{ status: number; body: any } | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/${path}`, init);
    if (!res) return null;
    return { status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    devlog(`[garden] ${path} failed: ${String(e)}`);
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
  devlog(`[garden] ${path} refused: HTTP ${r?.status ?? '-'} ${r?.body?.error_code ?? ''}`);
  return { ok: false, kind: 'failed' };
}

export async function fetchGarden(date = localDate()): Promise<{ garden: Garden; durations: GardenDuration[] } | null> {
  const r = await call(`garden?local_date=${encodeURIComponent(date)}`);
  const garden = r?.status === 200 ? readGarden(r.body?.garden) : null;
  if (!garden) return null;
  const durations: GardenDuration[] = Array.isArray(r!.body?.durations)
    ? r!.body.durations
        .map((d: any) => ({ minutes: num(d?.minutes), xp: num(d?.xp), gold: num(d?.gold), energy: num(d?.energy) }))
        .filter((d: GardenDuration) => d.minutes > 0)
    : [];
  return { garden, durations };
}

export async function startSession(req: { requestId: string; minutes: number; date?: string }): Promise<GardenResult<{ session: GardenSessionInfo }>> {
  const path = 'garden/sessions';
  const r = await call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_id: req.requestId, minutes: req.minutes, local_date: req.date ?? localDate() }),
  });
  const session = r?.status === 200 ? readSession(r.body?.session) : null;
  return session ? { ok: true, session } : failure(r, path);
}

export async function finishSession(req: { id: number; breaths: number; inRhythm: number }): Promise<GardenResult<GardenFinish>> {
  const path = `garden/sessions/${req.id}/finish`;
  const r = await call(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ breaths: req.breaths, in_rhythm: req.inRhythm }),
  });
  const garden = r?.status === 200 ? readGarden(r.body?.garden) : null;
  if (!garden) return failure(r, path);
  const w = r!.body?.reward ?? {};
  return {
    ok: true,
    reward: { xp: num(w.xp), gold: num(w.gold), energy: num(w.energy), percent: num(w.percent, 100), dayIndex: num(w.day_index, 1) },
    levelUp: r!.body?.level_up === true,
    levelBefore: num(r!.body?.level_before, garden.level),
    garden,
  };
}

/** 0..1 through the current level (1 at the top level) — the energy ring and Unity's growth. */
export function levelProgress(g: Pick<Garden, 'levelXp' | 'levelSpan'>): number {
  if (g.levelSpan == null || g.levelSpan <= 0) return 1;
  return Math.max(0, Math.min(1, g.levelXp / g.levelSpan));
}
