import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { uuidV4 } from '../../../shared/uuid';
import type { Lang } from '../../../shared/i18n';
import { authedFetch } from '../../auth/api/headers';
import { readInsufficient, type InsufficientCoins } from '../../coins/api/insufficient';
import { useCoins } from '../../coins/store/coinStore';
import type { CafeCard } from '../../counseling/types';

/**
 * The coffee shop's table service on saju_server (spec 007, specs/007-cafe-tarot-coffee/contract.md):
 *
 *   GET  prayers/cafe/tarot/consultants?lang=        → { consultants: [{ id, name, title, persona, portrait_key, voice }] }
 *   POST prayers/cafe/tarot/readings                 → 30 PC · { reading_id, cards[7], overall, advice, coins_balance }
 *   POST prayers/cafe/tarot/readings/:id/followups   → 10 PC · { answer, coins_balance }
 *   POST prayers/cafe/coffee                         → 30 PC · { fortune, coins_balance }
 *
 *   402 INSUFFICIENT_COINS { coins_balance } · 422 INVALID_CARDS · 404 READING_NOT_FOUND ·
 *   503 LLM_UNAVAILABLE (the charge was rolled back)
 *
 * THE SERVER CHARGES; this file only asks. Every paid call carries a `request_id` the caller keeps
 * for one purchase INTENT (myRoomApi's rule): a call whose answer was 503 or never arrived is retried
 * with the SAME id, so the ledger sees one purchase however many times the player taps Retry. A
 * definitive answer (200, 402, 404, 422) ends the intent and the next purchase gets a new id.
 *
 * The wallet is written here, in the API layer, as every coin spend does (coins/api/insufficient.ts).
 */

export interface TarotConsultant {
  id: string;
  name: string;
  title: string;
  persona: string;
  /** Unity's Resources/CounselorPortraits/<key> — the registry's card id (`tarot`, `sunyeo`, …). */
  portraitKey: string;
  voice: string;
}

export interface TarotReadingCard extends CafeCard {
  name: string;
  /** The slot's meaning in the spread (e.g. "Past"), as the server words it. */
  position: string;
  meaning: string;
}

export interface TarotReading {
  readingId: string;
  cards: TarotReadingCard[];
  overall: string;
  advice: string;
}

export type CafeFailure =
  /** Nothing was charged; `balance` is what the account has (the wallet is already set). */
  | ({ ok: false } & InsufficientCoins)
  /** 422 INVALID_CARDS: the seven Unity dealt were not seven distinct known ids. Not charged. */
  | { ok: false; kind: 'invalidCards' }
  /** 404 READING_NOT_FOUND: a follow-up to a reading the server does not have. */
  | { ok: false; kind: 'notFound' }
  /** 503 LLM_UNAVAILABLE — refunded; retry with the same request_id. */
  | { ok: false; kind: 'unavailable' }
  /** No answer, another 5xx, or one that could not be read: retry with the same request_id. */
  | { ok: false; kind: 'failed' };

export type CafeResult<T> = ({ ok: true; balance: number | null } & T) | CafeFailure;

/** A fresh purchase-intent id (the contract's `request_id`, a client UUID). */
export const newRequestId = (): string => uuidV4();

/** The contract spells it `coins_balance`; the rest of prayers says `coin_balance`. Either is read. */
function balanceOf(b: any): number | null {
  const v = b?.coins_balance ?? b?.coin_balance;
  return v != null && Number.isFinite(Number(v)) ? Number(v) : null;
}

/** True when the failure leaves the purchase intent open (retry with the same request_id). */
export const isRetryable = (r: CafeFailure): boolean => r.kind === 'unavailable' || r.kind === 'failed';

async function post<T>(path: string, body: object, read: (b: any) => T | null): Promise<CafeResult<T>> {
  let res: Response | null;
  try {
    res = await authedFetch(`${apiBase()}/api/v1/prayers/cafe/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    devlog(`[cafe] ${path} failed: ${String(e)}`);
    return { ok: false, kind: 'failed' };
  }
  if (!res) return { ok: false, kind: 'failed' };
  const b = await res.json().catch(() => null);
  if (res.status === 402) return { ok: false, ...readInsufficient({ price: b?.price, coin_balance: balanceOf(b) }) };
  if (res.status === 422) return { ok: false, kind: 'invalidCards' };
  if (res.status === 404) return { ok: false, kind: 'notFound' };
  if (res.status === 503) {
    devlog(`[cafe] ${path} 503 ${b?.error_code ?? ''}`);
    return { ok: false, kind: 'unavailable' };
  }
  const value = res.ok ? read(b) : null;
  if (!value) {
    devlog(`[cafe] ${path} refused: HTTP ${res.status} ${b?.error_code ?? ''}`);
    return { ok: false, kind: 'failed' };
  }
  const balance = balanceOf(b);
  if (balance != null) useCoins.getState().setBalance(balance);
  return { ok: true, balance, ...value };
}

const str = (v: unknown) => (typeof v === 'string' ? v : v == null ? '' : String(v));

export async function fetchTarotConsultants(lang: Lang, signal?: AbortSignal): Promise<TarotConsultant[] | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/cafe/tarot/consultants?lang=${encodeURIComponent(lang)}`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (!Array.isArray(b?.consultants)) return null;
    return b.consultants
      .map((c: any): TarotConsultant => ({
        id: str(c?.id),
        name: str(c?.name),
        title: str(c?.title),
        persona: str(c?.persona),
        portraitKey: str(c?.portrait_key),
        voice: str(c?.voice),
      }))
      .filter((c: TarotConsultant) => c.id.length > 0);
  } catch {
    return null;
  }
}

/** The reader's text, as shown and as spoken. The model marks card names `[Like This]` (the
 *  prompt asks it to, so the server can find them); on screen and in the voice they are just names. */
export function plain(text: string): string {
  return text.replace(/\[([^\]\n]{1,60})\]/g, '$1');
}

function readCard(c: any): TarotReadingCard {
  return {
    id: str(c?.id),
    name: str(c?.name),
    orientation: c?.orientation === 'reversed' ? 'reversed' : 'upright',
    // The server sends the 0-based slot as `position` and the localised name as `position_label`.
    position: str(c?.position_label) || str(c?.position),
    meaning: plain(str(c?.meaning)),
  };
}

export function createReading(req: {
  requestId: string;
  consultantId: string;
  question: string;
  cards: CafeCard[];
  lang: Lang;
}): Promise<CafeResult<{ reading: TarotReading }>> {
  return post(
    'tarot/readings',
    { request_id: req.requestId, consultant_id: req.consultantId, question: req.question, cards: req.cards, lang: req.lang },
    b => {
      // Seven cards or it is not a reading this screen can present.
      if (b?.reading_id == null || !Array.isArray(b.cards) || b.cards.length !== 7) return null;
      return {
        reading: { readingId: str(b.reading_id), cards: b.cards.map(readCard), overall: plain(str(b.overall)), advice: plain(str(b.advice)) },
      };
    },
  );
}

export function askFollowup(req: {
  readingId: string;
  requestId: string;
  question: string;
  lang: Lang;
}): Promise<CafeResult<{ answer: string }>> {
  return post(
    `tarot/readings/${encodeURIComponent(req.readingId)}/followups`,
    { request_id: req.requestId, question: req.question, lang: req.lang },
    b => (typeof b?.answer === 'string' && b.answer.length > 0 ? { answer: plain(b.answer) } : null),
  );
}

export function orderCoffee(req: { requestId: string; lang: Lang }): Promise<CafeResult<{ fortune: string }>> {
  return post(
    'coffee',
    { request_id: req.requestId, lang: req.lang },
    b => (typeof b?.fortune === 'string' && b.fortune.length > 0 ? { fortune: b.fortune } : null),
  );
}
