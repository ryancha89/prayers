import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from '../../auth/api/headers';
import type { Lang } from '../../../shared/i18n';
import { journeyBirthOf, mapPart, mapSummary, whoOf } from '../api/journeyApi';
import { journeySubject } from '../store/journeyProfileStore';
import type { JourneyPart, JourneySummary } from '../types';

/**
 * The ONE place a Journey paid moment is charged.
 *
 * The server owns the charge: it prices the moment, takes the coins from the account's wallet
 * (`users.coin_balance`) and answers with the unlocked part — the text and cards this phone has
 * never had. The client only asks. Unlocks are per account + person + journey: asking again, or with another
 * counsellor, is not charged twice (`charged: 0`) and returns that counsellor's telling.
 *
 * POST /api/v1/prayers/journeys/:key/unlock { moment_id, tone, lang }
 *   200 { success, moment_id, charged, coin_balance, part, summary }
 *   402 INSUFFICIENT_COINS { price, coin_balance } · 402 PURCHASE_REQUIRED (the pass is not owned)
 *   404 UNKNOWN_MOMENT · 503 the part could not be generated
 */

export interface UnlockRequest {
  journeyId: string;
  /** Server moment id, e.g. `career#0`. */
  momentId: string;
  tone: string;
  lang: Lang;
}

export type UnlockFailure =
  /** Nothing was charged. `coinBalance` is what the account has. */
  | { ok: false; reason: 'insufficient'; price: number | null; coinBalance: number | null }
  /** The journey pass is not owned: the pass screen, not the coin wallet, is the way on. */
  | { ok: false; reason: 'purchase' }
  | { ok: false; reason: 'unknown' }
  /** Network, 5xx, or an answer that could not be read: try again. */
  | { ok: false; reason: 'failed' };

export type UnlockResult =
  | {
      ok: true;
      /** Coins taken by this call; 0 when the moment was already unlocked. */
      charged: number;
      coinBalance: number | null;
      part: JourneyPart;
      /** Every part this unlock opened — a chapter opens whole (10-07: priced per station). Always
       *  includes `part`. */
      parts: JourneyPart[];
      summary: JourneySummary | null;
    }
  | UnlockFailure;

export async function unlockMoment(req: UnlockRequest): Promise<UnlockResult> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/journeys/${req.journeyId}/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // Whose stations: unlocks are per person (10-12). Without the birth data the server would fall
      // back to the account's stored profile — whoever the last consultation was about.
      body: JSON.stringify({
        moment_id: req.momentId,
        tone: req.tone,
        lang: req.lang,
        ...whoOf(req.lang, journeyBirthOf(journeySubject())),
      }),
    });
    if (!res) return { ok: false, reason: 'failed' };
    const b = await res.json().catch(() => null);
    if (res.status === 402) {
      if (b?.error_code === 'INSUFFICIENT_COINS') {
        return {
          ok: false,
          reason: 'insufficient',
          price: b.price != null ? Number(b.price) : null,
          coinBalance: b.coin_balance != null ? Number(b.coin_balance) : null,
        };
      }
      return { ok: false, reason: 'purchase' };
    }
    if (res.status === 404) return { ok: false, reason: 'unknown' };
    if (!res.ok || !b?.success || !b.part) {
      devlog(`[journey] unlock ${req.momentId} refused: HTTP ${res.status} ${b?.error_code ?? b?.error ?? ''}`);
      return { ok: false, reason: 'failed' };
    }
    const part = mapPart(b.part);
    // A 200 that does not carry the text is not an unlock this phone can play.
    if (!part.unlocked || part.text == null) return { ok: false, reason: 'failed' };
    const asked = { ...part, momentId: part.momentId ?? req.momentId };
    const others: JourneyPart[] = Array.isArray(b.parts)
      ? b.parts.map(mapPart).filter((p: JourneyPart) => p.momentId && p.momentId !== asked.momentId && p.unlocked && p.text != null)
      : [];
    return {
      ok: true,
      charged: Number(b.charged ?? 0),
      coinBalance: b.coin_balance != null ? Number(b.coin_balance) : null,
      part: asked,
      parts: [asked, ...others],
      summary: b.summary ? mapSummary(b.summary) : null,
    };
  } catch (e) {
    devlog(`[journey] unlock ${req.momentId} failed: ${String(e)}`);
    return { ok: false, reason: 'failed' };
  }
}
