import { apiBase } from '../../../shared/config/api';
import { apiHeaders } from '../../auth/api/headers';
import { devlog } from '../../../shared/devlog';
import type { Lang } from '../../../shared/i18n';

/**
 * The Prayers consultation API on saju_server (`/api/v1/prayers/*`).
 *
 * This is the reading itself — the SAVIS v3 pipeline, the user's real chart, the topic classifier,
 * ChatSummary history. Everything this module returns was decided by the server; nothing here
 * invents an answer. When it cannot reach the server it returns null and the caller falls back to
 * the scripted stand-in, which is a visibly different thing and must stay that way.
 *
 * AUTH. Two headers, and they answer different questions. `Saju-Authorization` decides whether the
 * request gets through the door at all (`Api::V1::BaseController#authenticate`); `User-Auth` only
 * decides WHICH user it is once inside — the server mints a `prayers_guest` from it. Sending
 * User-Auth alone is a 401, which is exactly how Unity's own client learned this.
 */

/** Resolved per call rather than captured: a QA build can be pointed at staging at runtime, and a
 *  module-level constant would hold whatever the host was when this file was first imported. */
const BASE = () => apiBase();

/** One topic card as the server offers it (step 8 of the 26-08 flow). */
export interface TopicCard {
  key: string;
  label: string;
  description: string;
}

/** One scene of the reading, when a turn asked for them. */
export interface Scene {
  index: number;
  text: string;
  tone: string;
  element?: string | null;
  hold_ms?: number;
}

export interface ConsultationTurn {
  text: string;
  followUp: boolean;
  /** The topic the server is actually reading on, which is not always the one that was asked for. */
  mainTopic?: string;
  /** Set when the classifier thinks the question has drifted somewhere else. */
  suggestSwitch?: string | null;
  scenes?: Scene[];
}

/** The 402 from step 9a. Distinct from a failure: the question is fine, the wallet is not. */
export class TicketRequiredError extends Error {
  readonly cost: number;
  readonly balance: number;
  readonly shortfall: number;

  constructor(message: string, cost: number, balance: number, shortfall: number) {
    super(message);
    this.name = 'TicketRequiredError';
    this.cost = cost;
    this.balance = balance;
    this.shortfall = shortfall;
  }
}


/** True when a server round-trip is even possible — lets the UI decide before it renders.
 *  Async now: the credential may have to be fetched (see apiHeaders). */
export const serverAvailable = async (): Promise<boolean> => (await apiHeaders()) !== null;

/**
 * The topic cards, in the caller's language.
 *
 * Fetched rather than hardcoded because the cards and `Prayers::TopicClassifier` have to agree: a
 * card offering a key the classifier does not know starts the reading already off-topic. Returns
 * null on any failure, and the caller shows its built-in list — a topic screen that cannot render
 * is worse than one that is a release behind.
 */
export async function fetchTopics(lang: Lang, signal?: AbortSignal): Promise<TopicCard[] | null> {
  const headers = await apiHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/topics?language=${encodeURIComponent(lang)}`, {
      headers,
      signal,
    });
    if (!res.ok) return null;

    const body = await res.json();
    if (!body?.success || !Array.isArray(body.topics)) return null;

    const cards = body.topics
      .filter((t: any) => typeof t?.topic_key === 'string' && typeof t?.label === 'string')
      .map((t: any) => ({
        key: t.topic_key as string,
        label: t.label as string,
        description: typeof t.description === 'string' ? t.description : '',
      }));

    return cards.length > 0 ? cards : null;
  } catch {
    return null;
  }
}

/**
 * What the room needs before it is worth opening.
 *
 *  ok        — go.
 *  offline   — the server did not answer, or refused this build's token.
 *  no-chart  — the server is fine and this user has no saju on it.
 *
 * `no-chart` is the case that made this check exist. The room opened, the counselor sat down, the
 * question went out, and `/api/v2/chatbots/send_message` answered HTTP **200** carrying
 * `{code: 1204, error: "사주 정보가 없습니다"}` — no chart, enter a birth date first. Everything
 * downstream buckets that as a connection failure, so the room said "the connection was
 * interrupted, try again?" over a server that was up and had answered promptly. Retrying could
 * never work.
 *
 * So this deliberately does NOT just ping for reachability. A reachability check would have passed
 * this exact case and let the player back into the same dead end.
 */
export type ConsultationReadiness = 'ok' | 'offline' | 'no-chart';

/**
 * Puts a birth profile on the account, which is the ONLY thing that turns `has_saju` true.
 *
 * `POST /api/v1/saju/save` — not `/prayers/chart`, which merely computes four pillars for the
 * room's visualisation and saves nothing. Getting those two the wrong way round is easy: both take
 * a birth date and both answer with ganji.
 *
 * ONE PROFILE PER ACCOUNT. The server persists to `UserList` index 0, so this is "who the account
 * is about", not "one of the people it knows". Saving the subject at the moment a consultation
 * starts is therefore deliberate: the reading has to be about whoever was just chosen, and asking
 * about a friend genuinely does replace what the server holds until the next reading.
 *
 * `gender` is sent explicitly because the server defaults it to `male` — a default that silently
 * changes the reading rather than failing.
 */
export interface SajuProfileInput {
  name: string;
  /** `YYYY-MM-DD`. */
  birthDate: string;
  /** `HH:MM`, or absent for "time unknown", which the calendar handles as its own case. */
  birthTime?: string;
  gender: 'male' | 'female';
}

export async function saveSajuProfile(
  input: SajuProfileInput,
  signal?: AbortSignal,
): Promise<boolean> {
  const headers = await apiHeaders();
  if (!headers) return false;

  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.birthDate.trim());
  if (!date) return false;

  const time = input.birthTime ? /^(\d{1,2}):(\d{2})$/.exec(input.birthTime.trim()) : null;

  try {
    const res = await fetch(`${BASE()}/api/v1/saju/save`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        name: input.name,
        year: Number(date[1]),
        month: Number(date[2]),
        day: Number(date[3]),
        gender: input.gender,
        calendar_type: 'solar',
        // Sent together and consistently: an hour with time_unknown true would be read as a real
        // hour by the pillar adjustment and quietly move the day pillar across the 23:00 boundary.
        ...(time
          ? { hour: Number(time[1]), minute: Number(time[2]), time_unknown: false }
          : { time_unknown: true }),
      }),
      signal,
    });
    if (!res.ok) return false;

    const body = await res.json();
    return body?.success === true;
  } catch {
    return false;
  }
}

export async function checkConsultationReadiness(
  signal?: AbortSignal,
): Promise<ConsultationReadiness> {
  const headers = await apiHeaders();
  if (!headers) return 'offline';

  try {
    const res = await fetch(`${BASE()}/api/v1/saju/me`, { headers, signal });
    if (!res.ok) return 'offline';

    const body = await res.json();
    if (body?.success !== true) return 'offline';

    return body.has_saju === true ? 'ok' : 'no-chart';
  } catch {
    return 'offline';
  }
}

export interface SendMessageInput {
  /** Stable per counselor+subject, so the server can carry the session's history and language. */
  uniqId: string;
  content: string;
  lang: Lang;
  /** The counselor's persona; the server keeps the voice consistent from it. */
  tone?: string;
  topic?: string;
  /** Ask for the 26-08 `scenes[]` break-up. Costs nothing when the room does not stage them. */
  scenes?: boolean;
  signal?: AbortSignal;
}

/**
 * One turn of the consultation.
 *
 * Throws `TicketRequiredError` on 402 — the room must keep its scene loaded and show a top-up over
 * it, because unloading and reloading loses the question the user just typed. Returns null for
 * every other failure (503 upstream, 422 malformed, no network), where the caller's fallback line
 * is the right answer and a thrown error would only reach a catch that says the same thing.
 */
export async function sendConsultationMessage(
  input: SendMessageInput,
): Promise<ConsultationTurn | null> {
  const headers = await apiHeaders();
  if (!headers) return null;

  const body = {
    uniq_id: input.uniqId,
    message: { content: input.content },
    setting: {
      lang: input.lang,
      ...(input.tone ? { tone: input.tone } : {}),
      ...(input.scenes ? { scenes: true } : {}),
    },
    // The server reads the topic from base_info.info.topic; `lang` is repeated here because it
    // accepts either place and the two are not guaranteed to be sent together by every client.
    base_info: {
      lang: input.lang,
      info: { ...(input.topic ? { topic: input.topic } : {}) },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${BASE()}/api/v1/prayers/consultations/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: input.signal,
    });
  } catch {
    return null;
  }

  let payload: any = null;
  try {
    payload = await res.json();
  } catch {
    return null;
  }

  if (res.status === 402) {
    throw new TicketRequiredError(
      typeof payload?.error === 'string' ? payload.error : 'A question ticket is needed.',
      Number(payload?.cost) || 0,
      Number(payload?.balance) || 0,
      Number(payload?.shortfall) || 0,
    );
  }

  if (!res.ok || typeof payload?.content !== 'string' || payload.content.length === 0) {
    if (__DEV__) {
      devlog(
        `[prayers-api] message ${res.status} ${payload?.error_code ?? ''} — falling back to the ` +
          'scripted reply.',
      );
    }
    return null;
  }

  return {
    text: payload.content,
    followUp: payload.followup === true,
    mainTopic: payload.topic?.main ?? undefined,
    suggestSwitch: payload.topic?.suggest_switch ?? null,
    scenes: Array.isArray(payload.scenes) ? (payload.scenes as Scene[]) : undefined,
  };
}
