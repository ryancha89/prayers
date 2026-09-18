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

/**
 * One scene of a reading, as the SERVER broke it up (the 26-08 `scenes[]` contract).
 *
 * The split is the server's, not ours. `splitReading` packs ~110 characters when nobody says
 * otherwise, but when the model tagged its own answer the breaks it chose are the real ones — and
 * each break carries a tone the room can perform.
 *
 * `tone` is kept verbatim next to the app's own `emotion`. The server speaks 20 tones
 * (`Prayers::Catalog::TONES`) and this app's vocabulary is 5 emotions: mapping is lossy both ways
 * (`reveal` and `good_news` both land on `happy`), so the original is carried along rather than
 * thrown away at the first consumer that cannot hold it.
 */
export interface CounselorScene {
  text: string;
  /** The server's tone, unmapped. One of `Prayers::Catalog::TONES`. */
  tone: string;
  emotion: CounselorEmotion;
  animation: CounselorAnimation;
  /** How long the server wants this scene held, in ms — its whole time on screen, reading time
   *  floored by the tone's clip length (`Prayers::SceneBuilder#hold_ms`). */
  holdMs?: number;
  /** How long to wait BEFORE speaking this scene, in ms. A different thing from `holdMs`, and it
   *  comes from a different place: the embedded room's `[Beat] … pause=` cue, which the model
   *  writes as a breath before the line rather than a hold after it. Either may be absent. */
  leadMs?: number;
  /** The five-element tag the VFX names are built from (`kim`, `moc`, …), when the server sent one. */
  element?: string | null;
}

export interface CounselorResponse {
  id: string;
  text: string;
  emotion: CounselorEmotion;
  animation: CounselorAnimation;
  camera: CounselorCamera;
  audioUrl?: string;
  followUp?: boolean;
  /** Present only when the server broke this answer up and the caller asked for it. */
  scenes?: CounselorScene[];
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
  /** clip mode: those same lines already resolved here, one per key, for a key
   *  with no recording. Unity's own string table covers three of the app's six
   *  languages, so it cannot resolve ja or either Chinese on its own. */
  texts?: string[];
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
  /** What the counselor had already SAID OUT LOUD when the player cut in.
   *
   *  Only the spoken part — never the chunks still queued behind the voice. The whole point is the
   *  boundary between what they heard and what they did not; sending the full answer would have
   *  her reply "as I was saying" about a sentence that never left the room. */
  interrupted?: string;
}

/**
 * opening = asked for, device not open yet; listening = the device IS open; transcribing = they
 * finished and it is being read.
 *
 * `opening` is RN's own — Unity never sends it. It exists because the permission dialog sits
 * between the press and the device, and measured on the simulator that is EIGHT SECONDS of a room
 * claiming to listen to a microphone that is not on. Unity announces the real thing (`OnListening`);
 * this is the honest state until it does.
 */
export type MicState = 'idle' | 'opening' | 'listening' | 'transcribing';

/** Why a take produced no text. Unity sends the key, RN owns the sentence. */
export type MicError =
  | 'permission'
  | 'no_device'
  | 'too_short'
  | 'no_speech'
  | 'upstream'
  /** The server cannot transcribe at all — the route is not deployed, or this build points at a
   *  server that never had it. Different from `upstream` on purpose: a take that failed is worth
   *  retrying, a route that does not exist is not, so the room stops offering the microphone. */
  | 'unavailable'
  | 'connection'
  | 'no_token'
  | 'cancelled';

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
  beats: {
    phaseId: string;
    lines: string[];
    /** The server's own scene break-up of these lines, when there is one.
     *
     *  NOT part of the Unity mirror: only the RN-side mock stage fills this in, from the
     *  `/api/v1/prayers` reading. The embedded room answers over v2, which speaks `[Beat]` cues and
     *  has no scenes — so `RNMessages.cs` needs no matching field and JsonUtility never sees this. */
    scenes?: CounselorScene[];
  }[];
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
  /** Open the microphone and record a spoken question.
   *
   *  The capture is Unity's, not RN's: the app has no audio-recording dependency, and the embedded
   *  player already has the device and the permission flow. RN owns the button and every word of
   *  copy around it; it gets the text back as MIC_RESULT and decides what to do with it. */
  | { type: 'MIC_START'; payload: { lang: string } }
  /** Finished speaking — cut the take here and transcribe it. */
  | { type: 'MIC_STOP' }
  /** Throw the take away (left the room, or changed their mind). */
  | { type: 'MIC_CANCEL' }
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
  /** Where the microphone is, and how loud the room is while it listens. The level exists so the
   *  button can move: a listening dot that never changes looks exactly like a dead microphone. */
  | { type: 'MIC_STATE'; payload: { state: MicState; level: number } }
  /** The spoken question as text, or why there is none. `error` is a key — the copy is RN's. */
  | { type: 'MIC_RESULT'; payload: { ok: boolean; text: string; error: MicError | '' } }
  | { type: 'SESSION_ERROR'; payload: { reason: string } }
  | { type: 'EXIT_SESSION' };

/* ---- Bridge abstraction (spec §39). Keep Unity behind this interface. ---- */
export interface UnityBridge {
  openCounselingRoom(payload: UnitySessionPayload): Promise<void>;
  sendEvent(event: RNToUnityEvent): void;
  onEvent(handler: (event: UnityToRNEvent) => void): () => void;
  closeCounselingRoom(): Promise<void>;
}
