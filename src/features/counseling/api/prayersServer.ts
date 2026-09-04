import { unityApiBase } from '../bridge';
import { getDeviceId } from '../../../shared/device/deviceId';
import { SAJU_ACCESS_TOKEN } from './devToken';
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

const BASE = unityApiBase;

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

let warnedAboutToken = false;

/**
 * Null when this build cannot talk to the server at all, so callers skip the request entirely
 * rather than firing one that is certain to 401.
 */
function authHeaders(): Record<string, string> | null {
  if (!BASE) return null;

  if (!SAJU_ACCESS_TOKEN) {
    if (__DEV__ && !warnedAboutToken) {
      warnedAboutToken = true;
      const line =
        '[prayers-api] devToken.ts has no SAJU_ACCESS_TOKEN, so every /api/v1/prayers call would ' +
        'answer 401 — the room is using the scripted replies, not the server. Copy ' +
        'devToken.example.ts and paste the value from saju_server/.env.';
      console.warn(line);
      // Through devlog too: on a simulator this is the only channel that survives to be read, and
      // "the counselor sounds canned" is otherwise indistinguishable from the server being down.
      devlog(line);
    }
    return null;
  }

  return {
    'Content-Type': 'application/json',
    'Saju-Authorization': `Bearer-${SAJU_ACCESS_TOKEN}`,
    'User-Auth': getDeviceId(),
  };
}

/** True when a server round-trip is even possible — lets the UI decide before it renders. */
export const serverAvailable = (): boolean => authHeaders() !== null;

/**
 * The topic cards, in the caller's language.
 *
 * Fetched rather than hardcoded because the cards and `Prayers::TopicClassifier` have to agree: a
 * card offering a key the classifier does not know starts the reading already off-topic. Returns
 * null on any failure, and the caller shows its built-in list — a topic screen that cannot render
 * is worse than one that is a release behind.
 */
export async function fetchTopics(lang: Lang, signal?: AbortSignal): Promise<TopicCard[] | null> {
  const headers = authHeaders();
  if (!headers) return null;

  try {
    const res = await fetch(`${BASE}/api/v1/prayers/topics?language=${encodeURIComponent(lang)}`, {
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
  const headers = authHeaders();
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
    res = await fetch(`${BASE}/api/v1/prayers/consultations/message`, {
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
