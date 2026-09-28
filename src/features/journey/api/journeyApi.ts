import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from '../../auth/api/headers';
import type { Lang } from '../../../shared/i18n';
import type { JourneyContent } from '../types';
import type { CounselingSubject } from '../../counseling/types';

/**
 * The player's own birth data, shaped as the server's `base_info.first`.
 *
 * The journey is about the account holder, and the server builds the chart from whatever the
 * request carries before it looks at the profile stored on the account (`AccountChart.backfill!`:
 * a request that already has birth data wins). Sending it explicitly is what makes the train leave
 * for an account that has never had a consultation — the only other source of a chart is the
 * profile a consultation saves — and keeps the reading about the player even after they asked a
 * counsellor about a friend, which replaces that stored profile.
 *
 * `birth_hour` is absent for "time unknown": the server then reads three pillars and skips the
 * hour instead of inventing one at midnight.
 */
export interface JourneyBirth {
  birth_year: number;
  birth_month: number;
  birth_day: number;
  birth_hour?: number;
  birth_minute: number;
  gender: 'male' | 'female';
}

export function journeyBirthOf(subject?: CounselingSubject): JourneyBirth | null {
  if (!subject?.birthDate || !subject.gender) return null;
  const date = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(subject.birthDate.trim());
  if (!date) return null;
  const time = subject.birthTime ? /^(\d{1,2}):(\d{2})$/.exec(subject.birthTime.trim()) : null;
  return {
    birth_year: Number(date[1]),
    birth_month: Number(date[2]),
    birth_day: Number(date[3]),
    ...(time ? { birth_hour: Number(time[1]) } : {}),
    birth_minute: time ? Number(time[2]) : 0,
    gender: subject.gender,
  };
}

export type JourneyContentError = 'no-chart' | 'purchase' | 'content';
export type JourneyContentResult = { content: JourneyContent } | { error: JourneyContentError };

/**
 * The reading for a journey, in one counsellor's voice. The first call for a player generates it
 * (two model calls, ~15-20 s); after that the server returns what it stored.
 *
 * Fails with a reason, because the screen answers each differently: `no-chart` (the server had
 * nothing to read from — the player must fill in their birth data, retrying can never work),
 * `purchase` (402), and `content` for everything else (retry).
 */
export async function fetchJourneyContent(
  journeyId: string,
  tone: string,
  lang: Lang,
  birth: JourneyBirth | null,
  signal?: AbortSignal,
): Promise<JourneyContentResult> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/journeys/${journeyId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tone, lang, base_info: { lang, ...(birth ? { first: birth } : {}) } }),
      signal,
    });
    if (!res) return { error: 'content' };
    if (res.status === 422) return { error: 'no-chart' };
    if (res.status === 402) return { error: 'purchase' };
    if (!res.ok) return { error: 'content' };
    const b = await res.json();
    if (!b?.success) return { error: b?.error === 'no chart' ? 'no-chart' : 'content' };
    const content: JourneyContent = {
      journey: b.journey,
      year: b.year,
      counselor: b.counselor,
      chapters: (b.chapters ?? []).map((c: any) => ({
        id: String(c.id),
        narration: String(c.narration ?? ''),
        cards: (c.cards ?? []).map((k: any) => ({
          at: Number(k.at ?? 0.5),
          title: String(k.title ?? ''),
          months: Array.isArray(k.months) ? k.months.map(Number) : [],
          description: String(k.description ?? ''),
          stars: Number(k.stars ?? 3),
        })),
      })),
      summary: {
        bestMonths: b.summary?.best_months ?? [],
        cautionMonths: b.summary?.caution_months ?? [],
        keywords: b.summary?.keywords ?? [],
        months: (b.summary?.months ?? [])
          .map((m: any) => ({
            month: Number(m.month),
            ganji: String(m.ganji ?? ''),
            headline: String(m.headline ?? ''),
            stars: Number(m.stars ?? 3),
          }))
          .filter((m: { month: number }) => m.month >= 1 && m.month <= 12),
      },
    };
    return { content };
  } catch {
    return { error: 'content' };
  }
}

export interface NarrationClip {
  url: string;
  duration: number;
  /** The clip's loudness, `fps` values a second, 0–100 — what the cabin counsellor's mouth
   *  follows. Null from an older server. */
  envelope: { fps: number; levels: number[] } | null;
}

/** A narration's audio, as a URL a player can stream (stored server-side, synthesised once). */
export async function narrationUrl(
  text: string,
  preset: string,
  lang: Lang,
): Promise<NarrationClip | null> {
  if (!text.trim()) return null;
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/tts/url`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, preset, lang }),
    });
    const b = await res?.json().catch(() => null);
    if (!res?.ok || !b?.success || !b.url) {
      // Without this a refused line is just "running silent" in the log (28-09: "clip not stored").
      devlog(`[journey] narration refused: HTTP ${res?.status ?? '-'} ${b?.error ?? ''}`);
      return null;
    }
    const env = b.envelope;
    return {
      url: String(b.url),
      duration: Number(b.duration ?? 0),
      envelope: env && Array.isArray(env.levels) && env.fps > 0
        ? { fps: Number(env.fps), levels: env.levels.map((v: unknown) => Number(v) || 0) }
        : null,
    };
  } catch (e) {
    devlog(`[journey] narration failed: ${String(e)}`);
    return null;
  }
}

export interface JourneyAccess {
  owned: boolean;
  priceKrw: number | null;
  productId: string | null;
  /** The server accepts a `dev` purchase (development only) — the simulator's way through. */
  devPurchase: boolean;
}

export async function fetchJourneyAccess(journeyId: string, signal?: AbortSignal): Promise<JourneyAccess | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/journeys/${journeyId}/access`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (!b?.success) return null;
    return { owned: !!b.owned, priceKrw: b.price_krw ?? null, productId: b.product_id ?? null, devPurchase: !!b.dev_purchase };
  } catch {
    return null;
  }
}

/** Hand the store's purchase to the server, which verifies it and unlocks the journey. */
export async function confirmJourneyPurchase(
  journeyId: string,
  input: { platform: 'ios' | 'android' | 'dev'; productId?: string; purchaseToken?: string; transactionId?: string },
): Promise<{ owned: boolean; error?: string }> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/journeys/${journeyId}/purchase`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        platform: input.platform,
        product_id: input.productId,
        purchase_token: input.purchaseToken,
        transaction_id: input.transactionId,
      }),
    });
    if (!res) return { owned: false, error: 'network' };
    const b = await res.json();
    return { owned: !!b?.owned, error: b?.success ? undefined : b?.error_code ?? 'invalid' };
  } catch {
    return { owned: false, error: 'network' };
  }
}
