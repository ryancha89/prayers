import { apiBase } from '../../../shared/config/api';
import { apiHeaders } from '../../auth/api/headers';
import { devlog } from '../../../shared/devlog';
import { isLang } from '../../../shared/i18n';
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
/**
 * The player's language, as their ACCOUNT remembers it.
 *
 * WHY THE SERVER HOLDS THIS. Until 2026-09-16 it lived in two places on the device — this app's
 * AsyncStorage and Unity's PlayerPrefs — and they drifted: the store said `ko` while `saju_lang`
 * said EN. A preference somebody set belongs to their account, so it survives a reinstall and
 * follows them to a second device, and so there is one answer to "what language is this player in".
 *
 * ⚠️ RN IS THE ONLY CLIENT THAT CALLS THIS. Unity is told the language over the bridge and keeps no
 * copy; a second client fetching the same setting independently is a race at boot and a second
 * source of truth one layer down, which is the thing being removed.
 *
 * `null` means "no answer" — signed out, offline, or simply never set. The caller keeps its local
 * value; it does NOT mean "no language".
 */
export async function fetchAccountLanguage(signal?: AbortSignal): Promise<Lang | null> {
  const headers = await apiHeaders();
  if (!headers) return null;
  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/settings`, { headers, signal });
    if (!res.ok) return null;
    const body = await res.json();
    const lang = body?.settings?.language;
    return isLang(lang) ? lang : null;
  } catch {
    return null;
  }
}

/** Remember this language on the account. Best effort: a failure leaves the local choice alone,
 *  because a player who picked a language must see it applied whether or not the network agrees. */
export async function saveAccountLanguage(lang: Lang): Promise<boolean> {
  const headers = await apiHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/settings`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: lang }),
    });
    if (!res.ok) return false;
    return (await res.json())?.success === true;
  } catch {
    return false;
  }
}

/** One past consultation, as the server remembers it. */
export interface RemoteConversation {
  /** `session_<counselorId>_<subjectId>` — the same key the room opens with. */
  uniqId: string;
  /** Card id: what the app draws the row from (name, portrait, accent). */
  counselorId: string;
  subjectId?: string;
  topic?: string;
  topicLabel?: string;
  /** Counselor turns in that thread. */
  turns: number;
  lastSeenAt: string;
  /** The player's own last question, already stripped of the room's prompt shaping. */
  lastQuestion?: string;
  lastAnswer?: string;
}

/**
 * The account's past consultations, newest first.
 *
 * ⚠️ THIS IS THE SOURCE OF TRUTH FOR THE CONVERSATIONS TAB, and the phone is the cache — not the
 * other way round. The list used to live only in AsyncStorage while the sign-in screen promised an
 * account that follows you: a reinstall wiped every past reading and the server, which had held
 * every turn all along, was never asked.
 *
 * `null` means "no answer" (signed out, offline, or a server too old to have the route) and the
 * caller keeps showing what it has. An empty array is a real answer: this account has no history.
 */
export async function fetchConversations(input: {
  lang: Lang;
  counselorId?: string;
  limit?: number;
  signal?: AbortSignal;
}): Promise<RemoteConversation[] | null> {
  const headers = await apiHeaders();
  if (!headers) return null;

  const query = new URLSearchParams({ language: input.lang });
  if (input.counselorId) query.set('counselor', input.counselorId);
  if (input.limit) query.set('limit', String(input.limit));

  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/consultations?${query}`, {
      headers,
      signal: input.signal,
    });
    if (!res.ok) return null;
    const body: any = await res.json();
    if (body?.success !== true || !Array.isArray(body.conversations)) return null;

    return body.conversations
      .filter((row: any) => typeof row?.uniq_id === 'string' && typeof row?.counselor === 'string')
      .map(
        (row: any): RemoteConversation => ({
          uniqId: row.uniq_id,
          counselorId: row.counselor,
          subjectId: typeof row.subject === 'string' ? row.subject : undefined,
          topic: typeof row.topic === 'string' ? row.topic : undefined,
          topicLabel: typeof row.topic_label === 'string' ? row.topic_label : undefined,
          turns: Number(row.turns) || 0,
          lastSeenAt: typeof row.last_seen_at === 'string' ? row.last_seen_at : '',
          lastQuestion: typeof row.last_question === 'string' ? row.last_question : undefined,
          lastAnswer: typeof row.last_answer === 'string' ? row.last_answer : undefined,
        }),
      );
  } catch {
    return null;
  }
}

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

export interface Recall {
  /** False on a first visit. The room must be able to tell the two apart — an opening that
   *  pretends to remember a session that never happened is worse than no opening. */
  hasHistory: boolean;
  /** The counselor's line, already written in the asked-for language by the server. */
  opening: string;
  topicLabel?: string;
  lastQuestion?: string;
  turns: number;
}

/**
 * What the counselor remembers of this player, for the line she opens with.
 *
 * Free and instant by design: the server builds it from rows it already has (the thread, its
 * running summary, the player's own last question) and never calls a model — it is spoken before
 * anything has been paid for. See `Prayers::Recall`.
 *
 * `uniqId` is the session about to START, and is sent so the server excludes it: a client that
 * reuses its session id would otherwise be told to remember the conversation it is already in.
 *
 * Returns null on any failure, including "no history" — the caller's own first-visit line is the
 * right answer either way, and a room must never wait on this.
 */
export async function fetchRecall(input: {
  uniqId?: string;
  lang: Lang;
  topic?: string;
  /**
   * The counselor about to be sat with, by CARD id (`yunjung`), not characterId.
   *
   * ⚠️ WITHOUT IT THE ROOM REMEMBERS SOMEBODY ELSE'S CONVERSATION. Recall used to return the
   * player's most recent thread whatever counselor it belonged to, so opening Go Yunjung's room
   * after a session with Theo had her say "last time we talked about love" about a conversation
   * she was never in. The server scopes on the session key, which is built from this id.
   */
  counselorId?: string;
  signal?: AbortSignal;
}): Promise<Recall | null> {
  const headers = await apiHeaders();
  if (!headers) return null;

  const query = new URLSearchParams({ language: input.lang });
  if (input.topic) query.set('topic', input.topic);
  if (input.uniqId) query.set('uniq_id', input.uniqId);
  if (input.counselorId) query.set('counselor', input.counselorId);

  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/consultations/recall?${query}`, {
      headers,
      signal: input.signal,
    });
    const payload: any = await res.json();
    if (!res.ok || payload?.success !== true || payload?.has_history !== true) return null;
    if (typeof payload.opening !== 'string' || payload.opening.length === 0) return null;

    return {
      hasHistory: true,
      opening: payload.opening,
      topicLabel: typeof payload.topic_label === 'string' ? payload.topic_label : undefined,
      lastQuestion: typeof payload.last_question === 'string' ? payload.last_question : undefined,
      turns: Number(payload.turns) || 0,
    };
  } catch {
    return null;
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
