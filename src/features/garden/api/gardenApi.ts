import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { uuidV4 } from '../../../shared/uuid';
import { authedFetch } from '../../auth/api/headers';
import type { MyRoomItem } from '../../counseling/types';

/**
 * Tree of Mind on saju_server (spec 008, specs/008-tree-of-mind/contract.md):
 *
 *   GET  prayers/garden?local_date=            → { garden, durations, rules, session }
 *   POST prayers/garden/sessions               → { session, replayed }       {request_id, minutes, local_date}
 *   POST prayers/garden/sessions/:id/finish    → { reward, level_up, drop, matured, garden } {breaths, in_rhythm}
 *
 * Phase 2, the island (TreeOfMind-Growth.html §3.3–3.6), every spend in Gold with an idem key per intent:
 *   POST prayers/garden/plots {index, element, idem_key} · POST prayers/garden/seeds {species, idem_key}
 *   POST prayers/garden/seeds/:id/plant {plot} · POST prayers/garden/decor {sku, idem_key}
 *   PUT  prayers/garden/layout {items, orb, music, version}
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
  /** Phase 2: the island. */
  plots: GardenPlot[];
  seeds: GardenSeed[];
  /** Species grown to maturity. */
  collection: string[];
  unlocks: GardenUnlocks;
}

export interface GardenPlot {
  index: number;
  level: number;
  price: number;
  owned: boolean;
  element: Element | null;
  unlocked: boolean;
}

export interface GardenSeed {
  id: number;
  species: string;
  source: 'shop' | 'drop';
  status: 'packet' | 'growing' | 'mature';
  plot: number | null;
  grown: number;
  need: number;
  element: Element;
}

export interface GardenUnlocks {
  time_of_day: boolean;
  rain: boolean;
  fireflies: boolean;
  companion: boolean;
  seasons: boolean;
}

export interface SeedSpec { id: string; element: Element; level: number; price: number; energy: number; drop: number }
export interface DecorSpec { id: string; element: Element; level: number; tier: string; kind: 'place' | 'orb' | 'music' | 'myroom'; price: number; on_sale: boolean }

export interface GardenCatalog {
  seeds: SeedSpec[];
  decor: DecorSpec[];
  seedsPerPlot: number;
  matchBonusPercent: number;
}

export interface GardenLayoutState {
  items: MyRoomItem[] | null;
  orb: string | null;
  music: string | null;
  version: number;
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
  /** Phase 2: the seed this sitting dropped (null = none), and the seeds that matured on it. */
  drop: GardenSeed | null;
  matured: GardenSeed[];
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
    plots: Array.isArray(g.plots) ? g.plots.map(readPlot) : [],
    seeds: Array.isArray(g.seeds) ? g.seeds.map(readSeed).filter((x: GardenSeed | null): x is GardenSeed => !!x) : [],
    collection: Array.isArray(g.collection) ? g.collection.map(String) : [],
    unlocks: {
      time_of_day: g.unlocks?.time_of_day === true, rain: g.unlocks?.rain === true, fireflies: g.unlocks?.fireflies === true,
      companion: g.unlocks?.companion === true, seasons: g.unlocks?.seasons === true,
    },
  };
}

const element = (v: unknown): Element | null => (ELEMENTS.has(v as string) ? (v as Element) : null);

function readPlot(p: any): GardenPlot {
  return { index: num(p?.index), level: num(p?.level), price: num(p?.price), owned: p?.owned === true,
           element: element(p?.element), unlocked: p?.unlocked === true };
}

export function readSeed(s: any): GardenSeed | null {
  if (!s || !Number.isFinite(Number(s.id))) return null;
  const status = s.status === 'growing' || s.status === 'mature' ? s.status : 'packet';
  return { id: num(s.id), species: String(s.species ?? ''), source: s.source === 'drop' ? 'drop' : 'shop', status,
           plot: s.plot == null ? null : num(s.plot), grown: num(s.grown), need: Math.max(1, num(s.need, 1)),
           element: element(s.element) ?? 'wood' };
}

function readCatalog(c: any): GardenCatalog {
  return {
    seeds: Array.isArray(c?.seeds)
      ? c.seeds.map((x: any) => ({ id: String(x?.id), element: element(x?.element) ?? 'wood', level: num(x?.level, 1), price: num(x?.price),
                                   energy: num(x?.energy), drop: num(x?.drop) }))
      : [],
    decor: Array.isArray(c?.decor)
      ? c.decor.map((x: any) => ({ id: String(x?.id), element: element(x?.element) ?? 'wood', level: num(x?.level, 1), tier: String(x?.tier ?? ''),
                                   kind: ['place', 'orb', 'music', 'myroom'].includes(x?.kind) ? x.kind : 'place', price: num(x?.price),
                                   on_sale: x?.on_sale === true }))
      : [],
    seedsPerPlot: num(c?.seeds_per_plot, 3),
    matchBonusPercent: num(c?.match_bonus_percent, 25),
  };
}

export function readLayout(b: any): GardenLayoutState {
  return { items: Array.isArray(b?.items) ? b.items : null, orb: b?.orb ?? null, music: b?.music ?? null, version: num(b?.version) };
}

const readOwned = (o: any): Record<string, number> =>
  o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, num(v)])) : {};

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

export interface GardenState {
  garden: Garden;
  durations: GardenDuration[];
  layout: GardenLayoutState;
  ownedDecor: Record<string, number>;
  catalog: GardenCatalog;
}

export async function fetchGarden(date = localDate()): Promise<GardenState | null> {
  const r = await call(`garden?local_date=${encodeURIComponent(date)}`);
  const garden = r?.status === 200 ? readGarden(r.body?.garden) : null;
  if (!garden) return null;
  const durations: GardenDuration[] = Array.isArray(r!.body?.durations)
    ? r!.body.durations
        .map((d: any) => ({ minutes: num(d?.minutes), xp: num(d?.xp), gold: num(d?.gold), energy: num(d?.energy) }))
        .filter((d: GardenDuration) => d.minutes > 0)
    : [];
  return { garden, durations, layout: readLayout(r!.body?.layout), ownedDecor: readOwned(r!.body?.owned_decor), catalog: readCatalog(r!.body?.catalog) };
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
    drop: readSeed(r!.body?.drop),
    matured: Array.isArray(r!.body?.matured) ? r!.body.matured.map(readSeed).filter(Boolean) : [],
  };
}

// ── Phase 2: spending Gold ──────────────────────────────────────────────────────────────────────

export type ShopFailure =
  | { ok: false; kind: 'insufficientGold'; price: number; gold: number }
  | { ok: false; kind: 'levelLocked'; level: number }
  /** ALREADY_OWNED · NOT_FOR_SALE · PLOT_FULL · NOT_PLANTABLE · UNKNOWN_ITEM · SEED_NOT_FOUND · ELEMENT_INVALID … */
  | { ok: false; kind: 'refused'; code: string }
  /** No answer or a 5xx: the intent (and its idem key) stays open — retry with the same key. */
  | { ok: false; kind: 'failed' };

export type ShopResult<T> = ({ ok: true; gold: number | null; garden: Garden | null } & T) | ShopFailure;

/** One purchase INTENT keeps one idem key until a definitive answer (myRoomApi's rule): a retry after no
 *  answer is the same purchase, so the Gold ledger sees it once. */
const openIntents = new Map<string, string>();
export function intentKey(intent: string): string {
  let key = openIntents.get(intent);
  if (!key) {
    key = newRequestId();
    openIntents.set(intent, key);
  }
  return key;
}

async function shop<T>(path: string, init: RequestInit, intent: string | null, read: (b: any) => T | null): Promise<ShopResult<T>> {
  const r = await call(path, init);
  if (!r || r.status >= 500) return { ok: false, kind: 'failed' };
  if (intent) openIntents.delete(intent);   // any answer ends the intent
  const b = r.body;
  if (r.status === 402) return { ok: false, kind: 'insufficientGold', price: num(b?.price), gold: num(b?.gold) };
  if (r.status === 403 && b?.error_code === 'LEVEL_LOCKED') return { ok: false, kind: 'levelLocked', level: num(b?.level) };
  const value = r.status === 200 ? read(b) : null;
  if (!value) {
    devlog(`[garden] ${path} refused: HTTP ${r.status} ${b?.error_code ?? ''}`);
    return { ok: false, kind: 'refused', code: String(b?.error_code ?? r.status) };
  }
  return { ok: true, gold: b?.gold == null ? null : num(b.gold), garden: readGarden(b?.garden), ...value };
}

const json = (method: string, body: object): RequestInit => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function buyPlot(index: number, el: Element): Promise<ShopResult<{ plot: { index: number; element: Element } }>> {
  const intent = `plot:${index}:${el}`;
  return shop('garden/plots', json('POST', { index, element: el, idem_key: intentKey(intent) }), intent,
              b => (b?.plot ? { plot: { index: num(b.plot.index), element: element(b.plot.element) ?? el } } : null));
}

/** `nonce` separates two packets of the same species bought on purpose (a new intent each). */
export function buySeed(species: string, nonce: string): Promise<ShopResult<{ seed: GardenSeed }>> {
  const intent = `seed:${species}:${nonce}`;
  return shop('garden/seeds', json('POST', { species, idem_key: intentKey(intent) }), intent,
              b => { const seed = readSeed(b?.seed); return seed ? { seed } : null; });
}

export function plantSeed(seedId: number, plot: number): Promise<ShopResult<{ seed: GardenSeed }>> {
  return shop(`garden/seeds/${seedId}/plant`, json('POST', { plot }), null,
              b => { const seed = readSeed(b?.seed); return seed ? { seed } : null; });
}

export function buyDecor(sku: string, nonce: string): Promise<ShopResult<{ ownedDecor: Record<string, number> }>> {
  const intent = `decor:${sku}:${nonce}`;
  return shop('garden/decor', json('POST', { sku, idem_key: intentKey(intent) }), intent,
              b => (b?.sku ? { ownedDecor: readOwned(b.owned_decor) } : null));
}

export type SaveLayoutResult =
  | { kind: 'saved'; layout: GardenLayoutState; ownedDecor: Record<string, number>; dropped: { item: string; reason: string }[] }
  | { kind: 'conflict'; layout: GardenLayoutState }
  | { kind: 'invalid'; reasons: string[] }
  | { kind: 'failed' };

export async function saveLayout(layout: { items: MyRoomItem[] | null; orb: string | null; music: string | null }, version: number): Promise<SaveLayoutResult> {
  // `items` is always sent, null included: the server refuses a PUT without the key.
  const r = await call('garden/layout', json('PUT', { items: layout.items, orb: layout.orb, music: layout.music, version }));
  if (!r) return { kind: 'failed' };
  if (r.status === 409 && r.body?.error_code === 'VERSION_CONFLICT') return { kind: 'conflict', layout: readLayout(r.body) };
  if (r.status === 422) return { kind: 'invalid', reasons: Array.isArray(r.body?.reasons) ? r.body.reasons.map(String) : [] };
  if (r.status !== 200) return { kind: 'failed' };
  const dropped = Array.isArray(r.body?.dropped) ? r.body.dropped.map((d: any) => ({ item: String(d?.item), reason: String(d?.reason) })) : [];
  return { kind: 'saved', layout: readLayout(r.body), ownedDecor: readOwned(r.body?.owned_decor), dropped };
}

/** 0..1 through the current level (1 at the top level) — the energy ring and Unity's growth. */
export function levelProgress(g: Pick<Garden, 'levelXp' | 'levelSpan'>): number {
  if (g.levelSpan == null || g.levelSpan <= 0) return 1;
  return Math.max(0, Math.min(1, g.levelXp / g.levelSpan));
}
