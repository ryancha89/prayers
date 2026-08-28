/** Counseling-session domain + Unity bridge contract (spec §15, §25, §40, §41). */

/* ---- Who the consultation is about (spec §15) ---- */
export interface CounselingSubject {
  id: string;
  displayName: string;
  birthDate?: string;
  birthTime?: string;
  gender?: string;
  relationship?: string;
  isUser: boolean;
}

/* ---- Topic (spec §16) ---- */
export type CounselingTopic =
  | 'love'
  | 'career'
  | 'wealth'
  | 'relationships'
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

/* ---- Bridge events (spec §41). Serialized as JSON across the boundary. ---- */
export type RNToUnityEvent =
  | { type: 'SESSION_INIT'; payload: UnitySessionPayload }
  | { type: 'COUNSELOR_RESPONSE'; payload: CounselorResponse }
  /** RN owns the chat bar (native keyboard/IME); Unity consumes the question. */
  | { type: 'USER_QUESTION'; payload: { text: string } }
  /** The session is over (back, error, any navigation away) — Unity must
   *  silence all audio immediately, ahead of the engine unload. */
  | { type: 'SESSION_END' };

export type UnityToRNEvent =
  | { type: 'UNITY_READY' }
  | { type: 'USER_MESSAGE'; payload: { text: string } }
  /** A counselor line (reading part, loop answer, ask-back) — mirrored so the
   *  app's conversation history holds both halves of the session. */
  | { type: 'COUNSELOR_MESSAGE'; payload: { text: string } }
  /** Whether the consultation currently accepts a typed question. */
  | { type: 'INPUT_STATE'; payload: { enabled: boolean } }
  | { type: 'EXIT_SESSION' };

/* ---- Bridge abstraction (spec §39). Keep Unity behind this interface. ---- */
export interface UnityBridge {
  openCounselingRoom(payload: UnitySessionPayload): Promise<void>;
  sendEvent(event: RNToUnityEvent): void;
  onEvent(handler: (event: UnityToRNEvent) => void): () => void;
  closeCounselingRoom(): Promise<void>;
}
