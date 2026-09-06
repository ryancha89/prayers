/** Counseling-session domain + Unity bridge contract (spec §15, §25, §40, §41). */

/* ---- Who the consultation is about (spec §15) ---- */
export interface CounselingSubject {
  id: string;
  displayName: string;
  /** `YYYY-MM-DD`. Without it there is no chart, and without a chart there is no reading. */
  birthDate?: string;
  /** `HH:MM`. Absent means "time unknown", which the calendar treats as its own case rather than
   *  as midnight — the hour pillar is dropped instead of guessed. */
  birthTime?: string;
  /** Narrowed from `string`: the server defaults a missing gender to `male`, and that default
   *  changes the reading instead of failing, so it must be asked for and sent. */
  gender?: 'male' | 'female';
  relationship?: string;
  isUser: boolean;
}

/* ---- Topic (spec §16) ---- */
/**
 * `health` and `other` are the two halves of the same seam. The server's cards — the vocabulary
 * Prayers::TopicClassifier actually decides with — are love/wealth/career/relationships/health/life;
 * `other` is the app's own catch-all and means nothing to the classifier, so it is never sent.
 * `health` is here because the fetched cards offer it and a selection has to be able to hold it.
 */
export type CounselingTopic =
  | 'love'
  | 'career'
  | 'wealth'
  | 'relationships'
  | 'health'
  | 'life'
  | 'other';

/* ---- Structured AI response contract (spec §25) ---- */
export type CounselorEmotion =
  | 'neutral'
  | 'happy'
  | 'thinking'
  | 'concerned'
  | 'surprised';

export type CounselorAnimation = 'talk' | 'thinking' | 'nod' | 'smile' | 'concern';

export type CounselorCamera = 'default' | 'closeUp';

export interface CounselorResponse {
  id: string;
  text: string;
  emotion: CounselorEmotion;
  animation: CounselorAnimation;
  camera: CounselorCamera;
  audioUrl?: string;
  followUp?: boolean;
}

/* ---- Unity session payload (spec §40) ---- */
export interface UnitySessionPayload {
  sessionId: string;
  counselor: {
    id: string;
    characterId: string;
    roomId: string;
    name: string;
  };
  subject: {
    id: string;
    displayName: string;
    birthDate?: string;
    birthTime?: string;
    gender?: string;
  };
  /** The consultation mode the user picked (main_topic) — focus, not a limit. */
  topic?: CounselingTopic;
  /** Rails host override for the embedded player (dev/staging). */
  apiBase?: string;
  locale: string;
  /** Per-device guest id → backend User-Auth header (until real login). */
  auth?: string;
}

/* ---- Stage commands (bridge v2) ----------------------------------------
 *
 * RN owns the consultation now: the 20-phase order, every dwell, every pixel
 * of UI. Unity is the STAGE — camera, character, VFX, voice — plus the two
 * services whose logic must not be duplicated in TypeScript (the saju chart
 * behind a reading, and the `uniq_id` thread key derived from it).
 *
 * These types are mirrored field for field by
 * `Saju/Assets/Scripts/Integration/RNMessages.cs`. JsonUtility matches by NAME
 * and reports nothing when it does not match, so a rename here is a silently
 * empty payload over there. Change both.
 */

/** One phase's staging, sent when RN enters it. Everything is a NAME — Unity
 *  plays whatever exists and reports the rest, exactly as before. */
export interface StagePhasePayload {
  phaseId: string;
  camera: string;
  animationTriggers: string[];
  vfx: string[];
  sound: string[];
  /** Which viz stage the spotlight features, or '' for none. */
  spotlight: string;
  /** A backward jump starts a new round — clear last round's table first. */
  resetVfx: boolean;
}

/** How a line is voiced. `clip` looks up a recording by loc key; `tts` sends the
 *  AI's own words to be synthesised. Both drive the same lipsync. */
export interface StageSpeakPayload {
  mode: 'clip' | 'tts';
  /** clip mode: the loc keys of the fixed lines. */
  locKeys?: string[];
  /** tts mode: the text to synthesise, and the cache key it is filed under. */
  text?: string;
  cacheKey?: string;
  topic?: string;
  /** Synthesise and cache only — no playback, no SPEAK_DONE. */
  prefetch?: boolean;
}

/** RN asks for the reading. The answer comes back as one ORACLE_RESULT. */
export interface OracleAskPayload {
  question: string;
  topic: string;
  scope: string;
  /** A free-chat turn after the staged reading, not the reading itself. */
  loop?: boolean;
}

export type OracleErrorKind =
  | 'connection'
  | 'upstream'
  | 'no_chart'
  | 'ticket'
  | 'rate_limited';

/** The reading, already split into the beats the phases speak. */
export interface OracleResultPayload {
  ok: boolean;
  /** phaseId → the lines that phase speaks (P11/P13/P14/P15/P17/P19). */
  beats: { phaseId: string; lines: string[] }[];
  followup: string;
  report?: { rows: { label: string; score: number }[]; keywords: string; period: string };
  threadId?: string;
  error?: OracleErrorKind;
  /** A loop answer rather than the staged reading. */
  loop?: boolean;
}

/* ---- Bridge events (spec §41). Serialized as JSON across the boundary. ---- */
export type RNToUnityEvent =
  | { type: 'SESSION_INIT'; payload: UnitySessionPayload }
  | { type: 'COUNSELOR_RESPONSE'; payload: CounselorResponse }
  /** Enter a phase: camera, animation, VFX, sound. No text — RN draws that. */
  | { type: 'STAGE_PHASE'; payload: StagePhasePayload }
  /** Hold the counselor in his thinking pose while the reading is in flight. */
  | { type: 'STAGE_THINKING'; payload: { on: boolean } }
  | { type: 'STAGE_SPEAK'; payload: StageSpeakPayload }
  | { type: 'STAGE_STOP_SPEAK' }
  /** Ask the counselor for a reading (or a follow-up turn). */
  | { type: 'ORACLE_ASK'; payload: OracleAskPayload }
  /** The session is over (back, error, any navigation away) — Unity must
   *  silence all audio immediately, ahead of the engine unload. */
  | { type: 'SESSION_END' };

export type UnityToRNEvent =
  /** The transport is up, before any room exists — Unity's very first message.
   *
   *  NativeUnityBridge answers it with SESSION_INIT, which is what loads the room;
   *  waiting for UNITY_READY instead would wait for a room only that reply creates.
   *  It was missing from this union while the handler for it was already shipping,
   *  so `event.type === 'BRIDGE_READY'` compared against a union it was not in and
   *  tsc called the comparison unintentional (TS2367). Unity has always sent it —
   *  see ConsultationHostChannel.BridgeReady. */
  | { type: 'BRIDGE_READY' }
  | { type: 'UNITY_READY' }
  | { type: 'USER_MESSAGE'; payload: { text: string } }
  /** A counselor line — mirrored so the app's history holds both halves. */
  | { type: 'COUNSELOR_MESSAGE'; payload: { text: string } }
  /** Whether the consultation currently accepts a typed question. */
  | { type: 'INPUT_STATE'; payload: { enabled: boolean } }
  | { type: 'ORACLE_RESULT'; payload: OracleResultPayload }
  /** A spoken take finished — RN paces the next beat off this, not a guess. */
  | { type: 'SPEAK_DONE'; payload: { cacheKey: string } }
  | { type: 'SESSION_ERROR'; payload: { reason: string } }
  | { type: 'EXIT_SESSION' };

/* ---- Bridge abstraction (spec §39). Keep Unity behind this interface. ---- */
export interface UnityBridge {
  openCounselingRoom(payload: UnitySessionPayload): Promise<void>;
  sendEvent(event: RNToUnityEvent): void;
  onEvent(handler: (event: UnityToRNEvent) => void): () => void;
  closeCounselingRoom(): Promise<void>;
}
