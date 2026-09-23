/**
 * The consultation, run from React Native.
 *
 * This is a port of `ConsultationFlowController.cs` — order and state, nothing
 * else. It walks the 20 phases, decides how long each one is held, collects the
 * branch tags, and asks for the reading at the right moment. What the phase
 * LOOKS like is the React layer's business; what it sounds and moves like is
 * Unity's, reached only through `StagePort`.
 *
 * Why it moved: Unity was drawing the dialogue card, the choices, the question
 * box and the report on a canvas inside the embedded player. That put the app's
 * typography, its keyboard, its safe areas and its back gesture on the far side
 * of a texture. The flow came along with the UI because the UI was where it was
 * driven from — not because it needs an engine.
 *
 * What did NOT move, deliberately: the saju chart, the `uniq_id` thread key
 * derived from it, and the AI turn that both feed. That derivation has to match
 * `saju_world` byte for byte or the reading resumes into an empty thread, and a
 * second copy of it in TypeScript is a second chance to get it wrong. Those stay
 * in C# behind ORACLE_ASK / ORACLE_RESULT.
 *
 * Framework-free on purpose: no React, no timers of its own beyond an injectable
 * scheduler, so the whole 20-phase walk is testable without a renderer.
 */
import {
  ConsultationPhase,
  PhaseChoice,
  PhaseUi,
} from './types';
import { phases as allPhases, indexOf, loc, format } from './flowData';
import { splitReading, joinChunks, type ReadingChunk } from './splitReading';
import { devlog } from '../../../shared/devlog';
import { topicFromQuestion } from '../topicFromQuestion';
import { ui } from './strings';
import { CounselorVoice, voiced } from './voice';
import type { Lang } from '../../../shared/i18n';
import { sayGlyphs } from '../api/sajuGlyphs';
import type {
  ChatMode,
  CounselorEmotion,
  CounselorScene,
  MicError,
  MicState,
  OracleAskPayload,
  OracleResultPayload,
  StagePhasePayload,
} from '../types';


/**
 * A chunk of speech with the server's direction attached, when there was one.
 *
 * `splitReading` produces chunks with no tone — it is a length heuristic and knows nothing about
 * what is being said. A scene-backed chunk knows: the break is where the model put it, and the tone
 * is what the model asked the room to perform there.
 */
type SpokenChunk = ReadingChunk & {
  tone?: string;
  emotion?: CounselorEmotion;
  /** How long the server wants this scene to stand, in ms — see `holdRemaining`. */
  holdMs?: number;
  /** A breath before this scene is spoken, in ms — the room's `[Beat] … pause=` cue. */
  leadMs?: number;
};

/** Scenes as chunks. Every scene opens its own paragraph: the server broke the answer there because
 *  the delivery changes, and running two tones into one paragraph hides exactly that. */
function chunksOfScenes(scenes: CounselorScene[]): SpokenChunk[] {
  return scenes.map((sc, i) => ({
    text: sc.text,
    newParagraph: i > 0,
    tone: sc.tone,
    emotion: sc.emotion,
    holdMs: sc.holdMs,
    leadMs: sc.leadMs,
  }));
}

/* ── Tuning, ported from the controller's serialized fields ───────────────── */

/** Reading speed in characters per second. Lower = each line is held longer. */
const CHARS_PER_SECOND = 13;
/** How much longer than the reading estimate an answer is allowed to take before the guard in
 *  armAnswerGuard gives the turn back anyway. Generous on purpose: it is a lock-breaker, not a
 *  pacer, and cutting a counselor off because TTS ran slow would be a worse bug than the one it
 *  exists to prevent. */
const ANSWER_GUARD_SLACK = 3;
const ANSWER_GUARD_MIN_MS = 20000;
/** Minimum hold, even for a two-word line. */
const MIN_HOLD_MS = 1800;
/** Maximum hold, so an unusually long line does not freeze the screen. */
const MAX_HOLD_MS = 9000;
/** The pause after a line finishes, before the next phase. */
const TAIL_MS = 700;

/**
 * Ceiling on the server's own `hold_ms`, as a guard rather than a policy.
 *
 * `Prayers::SceneBuilder#hold_ms` is how long a scene should STAND — reading time, floored by the
 * length of the tone's animation clip — and it already clamps itself. This is only here so that a
 * malformed number cannot freeze the room on one line.
 */
const MAX_SCENE_HOLD_MS = 9000;
/** How often a cover phase re-checks whether the reading has landed. */
const COVER_POLL_MS = 200;

/** The wait line's cache key. Not a phase id, because the wait is not a phase. */
const THINKING_KEY = 'THINKING';
/** The report card carries more text, so its hold is multiplied. */
const REPORT_HOLD_MULTIPLIER = 2.2;

/**
 * Talk-first. The doc stages a scripted session: pick an area (P03), pick a
 * time range (P04), then type. The app already asked for the topic on the way
 * in, so two pickers in front of the input contradict it. P12/P16 are skipped
 * because they cannot change the answer — the whole walk spends ONE AI turn.
 */
// P15 is skipped: its line ("pay attention to June through September") is the doc's example
// dialogue, fixed in the string table, and never fed by the reading — every session heard the
// same months. P18 is the report card — four scored bars and a "notable period". It is skipped:
// the bars were chart-derived numbers the model was told to write around, and the reading is
// better heard than graded. The closing message (P19) follows the summary (P17) directly.
// P13 reacts to the answer given at P12 ("then the situation is a little
// different"); with P12 skipped it has nothing to react to, so it goes too.
const SKIP_PHASES = ['P03', 'P04', 'P12', 'P13', 'P15', 'P16', 'P18'];

// ⚠️ NO EXCEPTIONS, AND THAT IS A DECISION, NOT AN OVERSIGHT. For one afternoon (17-09) the
// relationship topics kept P12/P13/P16, on the argument that a relationship session has a question
// the app never asks — WHO. It was built, shipped to the simulator and looked at, and the call was
// that Theo should behave like every other counsellor: one question box, one answer. The branch
// content stays in the asset (and `PhaseVariant.choices` still works) so re-enabling is a
// three-line change, but the walk is uniform again.

/** Phases that exist only to cover the wait for the server. */
const COVER_PHASES = ['P06', 'P07', 'P08', 'P09', 'P10'];

/** How many `loop.wait.N` lines strings.ts carries per language. */
const WAIT_LINES = 4;

/**
 * Covering a wait that outlives its own first line.
 *
 * An answer is 15-20 s away and sometimes 45. The room says so once — a short spoken line — and
 * then nothing moves at all, which is where a wait stops reading as thinking and starts reading as
 * a hang. So the cover comes in tiers: her line is REPLACED in place at 8 s and every 6 s after
 * (same bubble, new words — a second bubble would look like she answered), and at 20 s the camera
 * pushes in once, because at that point only a change of shot still says "this is going somewhere".
 *
 * ⚠️ THE SWAPPED LINES ARE SPOKEN, TOO. They used not to be — the worry was a take still playing
 * when the answer arrives — and the bubble then showed words she never said while the room sat in
 * silence (seen on the simulator 23-09: she said "Mm, good question…", the bubble read "One moment,
 * let me look at that part…", then 11 s of nothing). The worry was already answered elsewhere:
 * onLoopResult starts the answer through afterSpeech, so it waits for a wait line to finish rather
 * than cutting it off. A swap only happens while she is silent, so a line is never cut by the next.
 * The room's own `loading_messages` endpoint (which Unity's chat panel uses) is deliberately NOT
 * ported here — it is an LLM call on the same transport that is already busy generating the answer,
 * and a personalised waiting line that lands after the answer is worse than a generic one that
 * lands on time.
 */
const WAIT_SWAP_AFTER_MS = 8000;
const WAIT_SWAP_EVERY_MS = 6000;
/** One slow push-in, once, when even the swapped lines have stopped being news. */
const WAIT_PUSHIN_AFTER_MS = 20000;
type UiKey = Parameters<typeof ui>[0];

/** The last spoken reading beat; the free-chat loop takes over after it. */
const LOOP_AFTER_PHASE = 'P19';

/** The first phase that speaks the reading — the only one that has to wait. */
const READING_PHASE = 'P11';

/** Where a returning player is greeted as one.
 *
 * P02 is the welcome — "Welcome. What would you like to know today?" — and it is the only beat in
 * the walk whose whole job is to open the conversation, so it is the only one a remembered opening
 * can replace without losing anything. P01 is the arrival (she has not looked up yet) and P05 is
 * the invitation to type, which still has to be said afterwards. */
const RECALL_PHASE = 'P02';

/** Which viz stage the spotlight features, by phase (`SpotlightCueFor`). */
const SPOTLIGHT: Record<string, string> = {
  P07: 'MagicCircleForm',
  P08: 'PillarYear',
  P09: 'FiveElements',
  P10: 'YearlyEnergyApproach',
  P13: 'ReopenSaju',
  P14: 'ReopenSaju',
  P15: 'TimelineAppear',
};

/* ── Ports ────────────────────────────────────────────────────────────────── */

/** Everything the flow asks of the 3D stage. One implementation drives Unity;
 *  the tests use a recording double. */
export interface StagePort {
  phase(payload: StagePhasePayload): void;
  thinking(on: boolean): void;
  /** A fixed line: Unity looks up the recording by loc key. `cacheKey` is what
   *  SPEAK_DONE comes back under, so it must be the same key the engine is
   *  waiting on — a take that reports under a different name never unblocks.
   *
   *  `texts` is the same line already resolved here, one per key, for the case
   *  where no take exists and Unity has to have it synthesised. Unity used to
   *  look that text up in its own string table, which holds three of the app's
   *  six languages: a Japanese player got a Japanese subtitle read aloud in
   *  English. The copy lives in this package, so it is sent from here. */
  speakClip(locKeys: string[], topic: string, cacheKey: string, texts?: string[]): void;
  /** An AI-written line: Unity synthesises it and files it under `cacheKey`. */
  speakText(text: string, cacheKey: string): void;
  /** Synthesise ahead of time, without playing and without a SPEAK_DONE, so a
   *  later speakText under the same `cacheKey` starts instantly. */
  prefetchText(text: string, cacheKey: string): void;
  stopSpeak(): void;
  askOracle(payload: OracleAskPayload): void;
  /** Open the room's microphone and record a spoken question (`MIC_START`).
   *
   *  The capture is Unity's — the app carries no audio-recording dependency, and the embedded
   *  player already owns the device and the permission dialog. The engine only decides WHEN. */
  startMic(lang: string): void;
  /** They have finished speaking: cut the take and transcribe it. */
  stopMic(): void;
  /** Throw the take away without transcribing it. */
  cancelMic(): void;
  exit(): void;
}

export interface Scheduler {
  set(fn: () => void, ms: number): number;
  clear(handle: number): void;
  /** The clock the timers run on. Read through the scheduler rather than from
   *  `Date.now()` so a test that fast-forwards time also fast-forwards the
   *  measurements taken between ticks — otherwise every dwell reads as zero
   *  elapsed and the walk never leaves its first phase. */
  now(): number;
}

export const realScheduler: Scheduler = {
  set: (fn, ms) => setTimeout(fn, ms) as unknown as number,
  clear: handle => clearTimeout(handle as unknown as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
};

/* ── State the React layer renders ────────────────────────────────────────── */

export type FlowScreen =
  | PhaseUi          // the phase's own mode
  | 'thinking'       // waiting on the reading
  | 'notice'         // disconnect / no-chart / upstream
  | 'loop';          // free conversation

export interface ChoiceView {
  label: string;
  choice: PhaseChoice;
}

export interface TranscriptLine {
  role: 'user' | 'counselor';
  text: string;
}

export interface NoticeView {
  body: string;
  retryLabel: string;
  leaveLabel: string;
}

export interface ReportView {
  rows: { label: string; score: number }[];
  keywords: string;
  period: string;
}

export interface FlowState {
  phaseId: string | null;
  screen: FlowScreen;
  speaker: string;
  line: string;
  choices: ChoiceView[];
  /** A dialogue beat is waiting for a tap; show the continue hint. */
  canTap: boolean;
  /** The chat bar accepts a question right now. */
  inputEnabled: boolean;
  notice: NoticeView | null;
  report: ReportView | null;
  transcript: TranscriptLine[];
  /** The server's own follow-up question, offered as a pill. */
  suggestion: string;
  topic: string;
  finished: boolean;
  /** A free-chat question is out and the answer has not come back yet. */
  pending: boolean;
  /** The server's tone for the line currently on screen, verbatim (`analysis`, `reveal`, …), or ''
   *  when nothing directed this one. The stage draws `emotion`; this is here so a room that grows a
   *  richer performance later does not have to re-derive it from five collapsed emotions. */
  tone: string;
  /** That tone, mapped into what this app can draw. `neutral` whenever there is no direction — the
   *  honest face for a line nobody staged. */
  emotion: CounselorEmotion;
  /** The counselor is talking RIGHT NOW.
   *
   *  Not the same as `!inputEnabled`: in the loop the box is open while she speaks, precisely so
   *  she CAN be cut off. The UI needs the difference to offer "stop" instead of "send". */
  speaking: boolean;
  /** Where the microphone is, and how loud the room is while it listens (0–1). */
  mic: MicView;
}

export interface MicView {
  state: MicState;
  /** 0–1 while listening, 0 otherwise. Exists so the button can move — a listening dot that never
   *  changes is indistinguishable from a microphone that never opened. */
  level: number;
  /** Why the last take produced nothing, as a key. Cleared when a new take starts. */
  error: MicError | '';
  /** Whether asking out loud is still on the table. Lowered for the rest of the session the first
   *  time the server says it cannot transcribe at all (`unavailable`): a button that is guaranteed
   *  to fail is worse than no button, and the player reads a second failure as their own fault. */
  offered: boolean;
}

const emptyState: FlowState = {
  phaseId: null,
  screen: 'none',
  speaker: '',
  line: '',
  choices: [],
  canTap: false,
  inputEnabled: false,
  notice: null,
  report: null,
  transcript: [],
  suggestion: '',
  topic: '',
  finished: false,
  pending: false,
  tone: '',
  emotion: 'neutral',
  speaking: false,
  mic: { state: 'idle', level: 0, error: '', offered: true },
};

export interface EngineOptions {
  stage: StagePort;
  lang: Lang;
  /** The area the app already asked for (design step 8). Seeds `topic`. */
  presetTopic?: string;
  /** Mirrored into the app's conversation history. */
  onCounselorLine?: (text: string) => void;
  onUserLine?: (text: string) => void;
  onFinished?: () => void;
  scheduler?: Scheduler;
  phases?: ConsultationPhase[];
  /** Which register the counselor speaks the room's own lines in — see `voice.ts`. Defaults to the
   *  shared one, so a caller that does not know who is in the chair changes nothing. */
  voice?: CounselorVoice;
  /** SAVIS's answer style for free-chat turns, read at ASK time rather than at construction: the
   *  player flips it from the room, and the flip has to reach the very next question, not the
   *  next session. Absent means the payload carries no mode and the server keeps its default. */
  chatMode?: () => ChatMode;
}

/* ── The engine ───────────────────────────────────────────────────────────── */

export class ConsultationEngine {
  private readonly stage: StagePort;
  private readonly sched: Scheduler;
  private readonly phases: ConsultationPhase[];
  private readonly opts: EngineOptions;
  private lang: Lang;

  private state: FlowState = emptyState;
  private listeners = new Set<(s: FlowState) => void>();

  private index = -1;
  private running = false;
  private timer: number | null = null;
  /** The answer walk's lock-breaker. Its own handle, not `timer`: that one belongs to phase
   *  advance, and sharing it would have a phase timer cancel the guard or the reverse. */
  private answerGuard: number | null = null;

  /** What she remembers of the last session, when the server had something to remember. Replaces
   *  the authored welcome at P02 — see `setRecallOpening`. */
  private recallOpening: string | null = null;

  /** Branch tags collected so far — the reading layer reads these. */
  private branches: string[] = [];
  private topic = '';
  private scope = '';
  private question = '';

  /** The reading, once it lands: phaseId → lines. */
  private beats: Record<string, string[]> = {};
  /** The same reading as the server staged it: phaseId → scenes. Empty for a reading that arrived
   *  untagged, and for every reading from the embedded room — v2 speaks cues, not scenes. */
  private beatScenes: Record<string, CounselorScene[]> = {};
  private oraclePending = false;
  private oracleError: OracleResultPayload['error'] | null = null;
  private followup = '';
  private reportData: ReportView | null = null;

  /** Set while a spoken take is playing; SPEAK_DONE clears it. */
  private speaking: string | null = null;
  private speakDoneWaiter: (() => void) | null = null;

  private inLoop = false;
  private loopTurns = 0;
  /** Set by askLoop, cleared by the answer. A result that arrives while this is
   *  false belongs to another engine — the room screen behind this one in the
   *  navigation stack is still mounted and still subscribed to the bridge, and
   *  it used to answer OUR question too: two STAGE_SPEAKs, two TTS fetches, and
   *  its STAGE_THINKING(off) killed the thinking pose the moment the ask went out. */
  private loopPending = false;
  /** Which "one moment" line was used last, so two turns in a row never repeat it. */
  private lastWait = -1;
  /** The transcript row the wait line is written into, so later tiers can replace it in place. */
  private waitRow = -1;
  private waitTimer: number | null = null;
  private waitPushedIn = false;
  /** A reading beat mid-delivery. Same idea as `answerWalk` but the text lives
   *  on the phase card rather than in the transcript: P11/P14/P17/P19 used to
   *  drop the whole beat on screen and then send all of it to TTS in one go,
   *  which read as "she talks four seconds late" and silently lost anything
   *  past the server's 800-character cap. */
  private readingWalk: { key: string; chunks: SpokenChunk[]; next: number; shownAt: number } | null =
    null;

  /** The pause between one scene finishing and the next being spoken. Its own handle: `timer`
   *  belongs to phase advance, and a tap that clears one must not silently cancel the other. */
  private holdTimer: number | null = null;

  /** An answer she was cut off part-way through, and how much of it the player had heard.
   *
   *  Held between the interruption and the question that caused it, because the mic opens BEFORE
   *  the question exists: she has to fall silent the instant the player starts talking, several
   *  seconds before there is anything to send. Consumed by the next turn, or undone by
   *  `restoreCutOff` when the take produced nothing. */
  private cutOff: {
    heard: string;
    walk: NonNullable<ConsultationEngine['answerWalk']>;
    said: number;
  } | null = null;

  /** A loop answer mid-delivery: spoken and revealed one chunk at a time, so the
   *  bubble grows with the voice instead of landing whole seconds before it. */
  private answerWalk: {
    key: string;
    chunks: SpokenChunk[];
    /** Next chunk to speak. */
    next: number;
    /** Index of the growing bubble in `transcript`, -1 before the first chunk. */
    row: number;
    /** When the chunk now on screen was put there — the clock `holdRemaining` measures from. */
    shownAt: number;
  } | null = null;

  /** The counselor's register for the room's own lines. Not the server's tone — see `voice.ts`. */
  private voice: CounselorVoice = 'default';

  /** RN's own copy, in this counselor's register. */
  private uiV(key: Parameters<typeof ui>[0]): string {
    return voiced(this.voice, key, this.lang) ?? ui(key, this.lang);
  }

  /** A generated-table line, in this counselor's register. Same fallback chain as `loc` once the
   *  register has nothing to say, so an un-overridden key behaves exactly as before. */
  private locV(key: string, fallback = ''): string {
    return voiced(this.voice, key, this.lang) ?? loc(key, this.lang, fallback);
  }

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.stage = opts.stage;
    this.sched = opts.scheduler ?? realScheduler;
    this.phases = opts.phases ?? allPhases;
    this.lang = opts.lang;
    this.voice = opts.voice ?? 'default';
    this.topic = opts.presetTopic ?? '';
  }

  /* ── Subscription ─────────────────────────────────────────────────────── */

  /**
   * Hand the engine the counselor's memory of the last session.
   *
   * Arrives on its own clock — the room asks the server for it while Unity is still loading — so
   * this is a late binding rather than a constructor argument. Ignored once the welcome has been
   * spoken: a line that remembers the previous session is only an opening, and dropping it in
   * halfway through a consultation would be a stranger interrupting.
   */
  setRecallOpening(opening: string): void {
    if (!opening || this.recallOpening) return;
    if (this.phaseIndexOf(RECALL_PHASE) <= this.index) return;
    this.recallOpening = opening;
  }

  private phaseIndexOf(id: string): number {
    return this.phases.findIndex(p => p.id === id);
  }

  getState(): FlowState {
    return this.state;
  }

  subscribe(fn: (s: FlowState) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }

  setLang(lang: Lang) {
    if (lang === this.lang) return;
    this.lang = lang;
    this.relocalize();
  }

  /**
   * Put the room's own copy back on screen in the language now selected.
   *
   * Changing language mid-consultation deliberately does not restart the session, and for a long
   * time that meant it did not change anything already drawn either: the speaker and the line kept
   * whatever language they were resolved in when the phase opened. Switching to Chinese left an
   * English "Counselor / Welcome…" above a Korean bubble above a Chinese "tap to continue" — three
   * languages on one card, none of which was a translation bug.
   *
   * Re-derives, never re-runs the phase: show() also speaks, and a language change must not make
   * the counselor say her line again.
   *
   * The TRANSCRIPT is deliberately left alone. Most of it is the model's own words in the language
   * they were asked in; re-resolving the few room lines mixed among them would translate half a
   * conversation and leave the other half, which reads worse than a consistent record of what was
   * actually said.
   */
  private relocalize() {
    if (!this.running) return;
    const p = this.phases[this.index];
    if (!p) return;
    const patch: Partial<FlowState> = {
      speaker: loc(p.speakerLocKey, this.lang, this.state.speaker),
    };
    // A reading beat's text is the AI's, not the asset's — only its speaker label is ours.
    const reading = this.beats[p.id];
    if (!reading || reading.length === 0) {
      const { body } = this.linesOf(p);
      if (body) patch.line = body;
      if (p.ui === 'choices') patch.choices = this.choicesOf(p);
    }
    if (this.state.notice) {
      patch.notice = this.noticeView();
      patch.speaker = loc('consult_speaker_counselor', this.lang, this.state.speaker);
    }
    this.patch(patch);
  }

  private patch(next: Partial<FlowState>) {
    this.state = { ...this.state, ...next };
    this.listeners.forEach(fn => fn(this.state));
  }

  /* ── Lifecycle ────────────────────────────────────────────────────────── */

  begin() {
    if (this.phases.length === 0) return;
    // Seeded, not blanked: begin() also runs on a replay, and the area the
    // player picked on the way in still holds for the next question.
    this.topic = this.opts.presetTopic ?? '';
    // ⚠️ AND IT MUST BE A BRANCH, NOT ONLY A LABEL. `presetTopic` used to set `topic` alone, which
    // feeds `{0}` and the voice take — while every per-topic VARIANT keys off `branches`. So a
    // session the app had already pointed at love or relationships (which is every session that
    // starts from a counsellor card) took the phase's DEFAULT lines and choices: the wealth ones.
    // That is how a relationship counsellor came to ask "where does your heart stand?" and then
    // offer *Start a business · Consider investing*.
    this.branches = this.topic ? ['topic:' + this.topic] : [];
    this.question = '';
    this.scope = '';
    this.beats = {};
    this.beatScenes = {};
    this.reportData = null;
    this.inLoop = false;
    this.loopTurns = 0;
    this.loopPending = false;
    this.answerWalk = null;
    this.running = true;
    this.index = -1;
    this.state = { ...emptyState, topic: this.topic };
    this.enter(0, { resetVfx: true });
  }

  dispose() {
    this.clearTimer();
    if (this.state.mic.state !== 'idle') this.stage.cancelMic();
    this.running = false;
    this.listeners.clear();
  }

  /* ── Walking ──────────────────────────────────────────────────────────── */

  advance() {
    if (!this.running) return;
    const current = this.current();
    // Leaving the last reading beat hands over to the free-chat loop; the
    // farewell only plays once the player is done asking.
    if (current && current.id === LOOP_AFTER_PHASE && !this.inLoop) {
      this.openLoop();
      return;
    }
    this.enter(this.index + 1);
  }

  goTo(phaseId: string) {
    if (!this.running) return;
    const i = indexOf(phaseId);
    if (i < 0) {
      this.advance();
      return;
    }
    // A backward jump is a new round: the table still holds the last reading's
    // pillars, circle and timeline, and the new round rebuilds them at P07-P08.
    this.enter(i, { resetVfx: i < this.index });
  }

  private current(): ConsultationPhase | null {
    return this.index >= 0 && this.index < this.phases.length
      ? this.phases[this.index]
      : null;
  }

  private enter(i: number, opts: { resetVfx?: boolean } = {}) {
    this.clearTimer();

    // Hold at the analysis phases while the reading is still in flight. Those
    // phases ARE the loading state — the doc simply never called them that.
    if (this.running && this.oraclePending && this.needsReading(i)) {
      this.holdForReading(i);
      return;
    }
    // The turn can also fail before the flow ever reaches the hold.
    if (this.running && this.oracleError && this.needsReading(i)) {
      this.showNotice(i);
      return;
    }

    if (i < 0 || i >= this.phases.length) {
      this.finish();
      return;
    }

    this.index = i;
    // Leaving a phase abandons whatever of its beat was still to be said; a
    // stale walk would otherwise keep writing chunks onto the NEXT phase's card.
    this.readingWalk = null;
    const p = this.phases[i];
    if (!p) {
      this.advance();
      return;
    }

    // Talk-first: step straight over the gates. `index` is already set, so
    // advance() walks on exactly as if the phase had played out.
    if (SKIP_PHASES.includes(p.id)) {
      this.advance();
      return;
    }

    this.stage.phase({
      phaseId: p.id,
      camera: p.camera,
      animationTriggers: p.animationTriggers,
      vfx: p.vfx,
      sound: p.sound,
      spotlight: SPOTLIGHT[p.id] ?? '',
      resetVfx: opts.resetVfx === true,
    });

    this.show(p);

    // Only unattended phases auto-advance. A Choices/QuestionBox phase waits
    // for the player however long they need.
    if (p.ui !== 'choices' && p.ui !== 'questionBox') this.autoAdvance(p);
  }

  private needsReading(i: number): boolean {
    return i >= 0 && i < this.phases.length && this.phases[i]?.id === READING_PHASE;
  }

  /* ── Filling the card ─────────────────────────────────────────────────── */

  private show(p: ConsultationPhase) {
    const speaker = loc(p.speakerLocKey, this.lang, '');
    // A remembered opening is treated exactly like a reading beat: it is the server's words, not
    // the asset's, so it is spoken by TTS and chunked the same way. That also means it inherits the
    // rule that the AI's text always wins over the authored line.
    const reading =
      this.beats[p.id] ??
      (p.id === RECALL_PHASE && this.recallOpening ? [this.recallOpening] : undefined);

    if (reading && reading.length > 0) {
      // The AI's reading wins over everything. The asset's text for the reading
      // phases is the doc's "Example Dialogue" — a placeholder for the SHAPE of
      // an answer, never the answer.
      const text = reading.join('\n');
      // The server's break-up wins over the length heuristic: those breaks are where the delivery
      // changes, and re-splitting the joined text at ~110 characters would cut straight across them.
      const scenes = this.beatScenes[p.id];
      const chunks: SpokenChunk[] =
        scenes && scenes.length > 0 ? chunksOfScenes(scenes) : splitReading(text);
      this.patch({
        phaseId: p.id,
        screen: p.ui,
        speaker,
        // Only the first chunk to begin with; the rest arrive as they are said.
        line: joinChunks(chunks.slice(0, 1)),
        choices: [],
        canTap: true,
        inputEnabled: false,
        notice: null,
        report: p.ui === 'report' ? this.reportData : null,
        tone: chunks[0]?.tone ?? '',
        emotion: chunks[0]?.emotion ?? 'neutral',
      });
      // onCounselorLine is the whole beat: it feeds the history row, not the card.
      this.opts.onCounselorLine?.(text);
      // Warm the rest while the first is being said. The first cannot be warmed
      // by anyone — it is the only one the player waits on.
      this.readingWalk = { key: p.id, chunks, next: 1, shownAt: this.sched.now() };
      for (let i = 1; i < chunks.length; i += 1) {
        this.stage.prefetchText(chunks[i].text, `${p.id}#${i}`);
      }
      this.speak(() => this.stage.speakText(chunks[0].text, `${p.id}#0`), `${p.id}#0`);
      return;
    }

    const { keys, spoken, body } = this.linesOf(p);

    this.patch({
      phaseId: p.id,
      screen: p.ui,
      speaker,
      line: body,
      choices: p.ui === 'choices' ? this.choicesOf(p) : [],
      canTap: p.ui === 'dialogue' || p.ui === 'none',
      inputEnabled: p.ui === 'questionBox',
      notice: null,
      report: p.ui === 'report' ? this.reportData : null,
      topic: this.topic,
      // Authored copy, not a directed reading. Leaving the last scene's face on would carry
      // `reveal` into a question box.
      tone: '',
      emotion: 'neutral',
    });
    if (body) this.opts.onCounselorLine?.(body);

    // Spoken with the SAME keys the line was resolved from, variant included,
    // so a recorded take and the text on screen can never drift apart.
    if (keys && keys.length > 0) {
      this.speak(() => this.stage.speakClip(keys, this.topic, p.id, spoken), p.id);
    }
  }

  /**
   * The phase's spoken lines, resolved in the CURRENT language.
   *
   * Split out of show() because it is the half that has no side effects: relocalize() needs the
   * text again after a language change and must not also re-speak the line.
   */
  private linesOf(p: ConsultationPhase) {
    // A branch variant replaces the phase's own lines wholesale (doc phase 13).
    // First match wins, so the most specific tag is listed first.
    let lines = p.lines;
    let keys = p.lineLocKeys;
    for (const v of p.variants ?? []) {
      if (!v.branchTag || !this.branches.includes(v.branchTag)) continue;
      // A choices-only variant must not blank the card.
      if (!v.lines || v.lines.length === 0) continue;
      lines = v.lines;
      keys = v.lineLocKeys;
      break;
    }

    // Kept per line, not only joined: the card shows one paragraph, but the voice says one
    // line at a time and a line with no take needs its own text to synthesise.
    const spoken = (lines ?? []).map((fallback, i) =>
      this.withTopic(this.locV(keys?.[i] ?? '', fallback)),
    );
    return { keys, spoken, body: spoken.join('\n') };
  }

  private choicesOf(p: ConsultationPhase): ChoiceView[] {
    // The branch's own choices when it has them — see PhaseVariant.choices for what it looked like
    // when only the LINES could branch. Same first-match-wins rule as linesOf, and a variant that
    // carries none falls through to the phase's own list.
    let list = p.choices ?? [];
    for (const v of p.variants ?? []) {
      if (!v.branchTag || !this.branches.includes(v.branchTag)) continue;
      if (!v.choices || v.choices.length === 0) continue;
      list = v.choices;
      break;
    }
    return list.map(c => ({
      label: this.withTopic(loc(c.locKey, this.lang, c.english)),
      choice: c,
    }));
  }

  /** `{0}` in a line is the topic — the asset interpolates rather than shipping
   *  five copies of every phase from P04 onward. */
  private withTopic(text: string): string {
    if (!text.includes('{0}')) return text;
    const label = this.topic ? loc(`consult_topic_${this.topic}`, this.lang, this.topic) : '';
    return format(text, [label]);
  }

  /* ── Pacing ───────────────────────────────────────────────────────────── */

  /** How long to leave a phase up when nobody authored a number: the time it
   *  takes to READ what is on screen. */
  private dwellMs(p: ConsultationPhase): number {
    if (p.autoAdvanceSeconds > 0) return p.autoAdvanceSeconds * 1000;
    const chars = this.state.line.length;
    const read = (chars / CHARS_PER_SECOND) * 1000;
    const mult = p.ui === 'report' ? REPORT_HOLD_MULTIPLIER : 1;
    return Math.min(Math.max(read * mult, MIN_HOLD_MS), MAX_HOLD_MS * mult);
  }

  private autoAdvance(p: ConsultationPhase) {
    const dwell = this.dwellMs(p);
    const cover = COVER_PHASES.includes(p.id);
    const started = this.sched.now();

    const done = () => {
      // A spoken take outlasting the reading estimate is the real clock —
      // cutting the counselor off mid-sentence is worse than holding too long.
      this.afterSpeech(() => {
        this.timer = this.sched.set(() => {
          this.timer = null;
          this.advance();
        }, TAIL_MS);
      });
    };

    if (!cover) {
      this.timer = this.sched.set(done, Math.max(1, dwell));
      return;
    }

    // A cover phase stops the moment the reading is in hand. It still gets
    // MIN_HOLD so the beat registers rather than flashing past, but it never
    // pads a wait that is already over — so this one is polled rather than
    // scheduled in a single shot.
    //
    // The tick has a floor of 1ms on purpose. Scheduling the exact remainder
    // ends in an interval so small that adding it to the clock is a no-op in
    // floating point, and the phase then spins forever a hair short of its own
    // dwell — a hang with no error and no log.
    const tick = () => {
      const elapsed = this.sched.now() - started;
      if (elapsed >= dwell || (elapsed >= MIN_HOLD_MS && !this.oraclePending)) {
        done();
        return;
      }
      this.timer = this.sched.set(tick, Math.max(1, Math.min(COVER_POLL_MS, dwell - elapsed)));
    };
    this.timer = this.sched.set(tick, Math.max(1, Math.min(COVER_POLL_MS, dwell)));
  }

  private speak(fire: () => void, cacheKey: string) {
    this.stage.stopSpeak();
    this.speaking = cacheKey;
    // Mirrored into the state because the UI has to tell "she is talking" from "the box is shut".
    // In the loop those came apart the day the player was allowed to cut in: the box is open while
    // she speaks, and the send button has to offer to interrupt rather than to send.
    if (!this.state.speaking) this.patch({ speaking: true });
    fire();
  }

  private afterSpeech(then: () => void) {
    if (!this.speaking) {
      then();
      return;
    }
    this.speakDoneWaiter = then;
  }

  /** Unity finished a spoken take. */
  onSpeakDone(cacheKey: string) {
    if (this.speaking && this.speaking !== cacheKey) return;
    this.speaking = null;
    if (this.state.speaking) this.patch({ speaking: false });
    // A reading beat still has chunks to say. Take the take, leave the phase's
    // waiter queued — autoAdvance registered it before the first chunk was even
    // spoken, and running it here would cut the beat off after one sentence.
    if (this.speakNextReadingChunk()) return;
    const waiter = this.speakDoneWaiter;
    this.speakDoneWaiter = null;
    waiter?.();
  }

  private clearTimer() {
    if (this.timer !== null) {
      this.sched.clear(this.timer);
      this.timer = null;
    }
    this.clearHold();
    // The wait cover rides along here rather than being remembered at each call site: every way out
    // of a wait — a tap, a hush, the answer, leaving the room — already passes through this.
    this.clearWaitCover();
    this.speakDoneWaiter = null;
  }

  private clearHold() {
    if (this.holdTimer !== null) {
      this.sched.clear(this.holdTimer);
      this.holdTimer = null;
    }
  }

  /**
   * How much longer the scene now on screen is owed, in ms.
   *
   * `hold_ms` is not a gap between lines — `Prayers::SceneBuilder` computes it as how long the
   * scene should STAND: its reading time, floored by the length of the tone's animation clip. So
   * the wait is what is LEFT of it once the voice has stopped, and it is usually zero for a long
   * line read slowly and a second or two for a short one the synthesiser rushes.
   *
   * Without this the room moved on the instant the take reported done, which is why a two-word
   * reveal ("…삼 년 뒤예요.") flashed past before it could land, and why the rig's one-shot gesture
   * for that tone was still playing when the next line started.
   */
  private holdRemaining(chunk: SpokenChunk | undefined, shownAt: number): number {
    const want = chunk?.holdMs ?? 0;
    if (!(want > 0)) return 0;
    const elapsed = this.sched.now() - shownAt;
    return Math.max(0, Math.min(want, MAX_SCENE_HOLD_MS) - elapsed);
  }

  /**
   * Run `then` once the scene on screen has had its time AND the next one has had its breath.
   *
   * Two different pauses meet here and the longer wins: what the finished scene is still owed
   * (`hold_ms`, from the `/prayers` reading) and what the next one asks for before it starts
   * (`pause`, from the embedded room's `[Beat]` cue). They come from different servers on different
   * paths and are never both present today, but taking the max costs nothing and means neither
   * path has to know about the other.
   */
  private afterHold(
    chunk: SpokenChunk | undefined,
    shownAt: number,
    next: SpokenChunk | undefined,
    then: () => void,
  ) {
    const lead = Math.min(Math.max(next?.leadMs ?? 0, 0), MAX_SCENE_HOLD_MS);
    const wait = Math.max(this.holdRemaining(chunk, shownAt), lead);
    if (wait <= 0) {
      then();
      return;
    }
    this.clearHold();
    this.holdTimer = this.sched.set(() => {
      this.holdTimer = null;
      then();
    }, wait);
  }

  /* ── Player input ─────────────────────────────────────────────────────── */

  /** Tap-to-continue on a dialogue beat. */
  tap() {
    if (!this.running || !this.state.canTap) return;
    // Mid-reading, the first tap finishes the beat rather than skipping it: the
    // card only holds what has been spoken so far, so advancing here would throw
    // away text the player never saw.
    if (this.flushReadingWalk()) {
      this.clearTimer();
      const p = this.current();
      if (p) this.autoAdvance(p);
      return;
    }
    this.clearTimer();
    // Marked, because from the bridge log alone a tap is indistinguishable from a bug: both look
    // like a line that started and never reported SPEAK_DONE. qa_session.py was reporting the
    // player's own impatience as two failures per session until this line existed.
    devlog(`[flow] tap skips ${this.state.phaseId} mid-line`);
    this.speaking = null;
    this.patch({ speaking: false });
    this.stage.stopSpeak();
    this.advance();
  }

  choose(choice: PhaseChoice) {
    if (!this.running) return;
    if (!choice) {
      this.advance();
      return;
    }
    if (choice.branchTag) {
      this.branches.push(choice.branchTag);
      if (choice.branchTag.startsWith('topic:')) {
        this.topic = choice.branchTag.slice('topic:'.length);
        this.patch({ topic: this.topic });
      } else if (choice.branchTag.startsWith('scope:')) {
        this.scope = choice.branchTag.slice('scope:'.length);
      }
    }
    if (choice.goTo) this.goTo(choice.goTo);
    else this.advance();
  }

  /** The P05 question, or a follow-up turn once the loop is open. */
  submitQuestion(text: string) {
    const trimmed = (text ?? '').trim();
    if (!this.running || !trimmed) return;

    if (this.inLoop) {
      this.askLoop(trimmed);
      return;
    }

    this.question = trimmed;
    this.opts.onUserLine?.(trimmed);
    this.followQuestionTopic(trimmed);
    this.oraclePending = true;
    this.oracleError = null;
    this.stage.askOracle({ question: trimmed, topic: this.topic, scope: this.scope });
    this.patch({ inputEnabled: false });
    this.advance();
  }

  leave() {
    this.finish();
  }

  /**
   * The topic follows the counselor until the player says what they are asking about (23-09).
   *
   * Set BEFORE the ask and before the cover phases: P06-P10 are recorded per topic and their
   * variants key off `branches`, so a topic changed after them would read the question with the
   * wrong takes. A question that matches nothing leaves the counselor's topic alone.
   */
  private followQuestionTopic(question: string) {
    const topic = topicFromQuestion(question);
    if (!topic || topic === this.topic) return;
    this.topic = topic;
    this.branches = [...this.branches.filter(b => !b.startsWith('topic:')), 'topic:' + topic];
    this.patch({ topic });
  }

  /* ── The microphone ───────────────────────────────────────────────────────
   *
   * "The user can use the mic to talk", and "when the user interrupts, the counselor needs to stop
   * talking and answer based on what she was saying" (CHA JEONGMIN, 15-09-2026). Those two are one
   * gesture: opening the mic IS the interruption. She stops on the press, not on the send — a
   * counselor who keeps reading over the player is both rude and unusable, since her voice is in
   * the same room as the microphone.
   *
   * The device belongs to Unity (StagePort.startMic). The engine decides when, keeps the state the
   * UI draws, and turns a finished take into a question. */

  /**
   * Stop talking — the bare gesture, with no question behind it.
   *
   * The player has heard enough of this answer. What she had not yet said is dropped rather than
   * dumped on screen: they stopped her because they did not want the rest, and a wall of text
   * appearing the instant she goes quiet is the opposite of what they asked for. The turn goes
   * straight back, so the box and the follow-up chip are theirs again.
   */
  hush() {
    if (!this.running || !this.inLoop) return;
    this.interruptAnswer();
    this.releaseTurn();
  }

  /** Press. Silences her, opens the device. */
  startMic() {
    if (!this.running || this.state.mic.state !== 'idle') return;
    // Only a loop ANSWER can be taken back. A staged phase is a walk with a camera and a beat
    // structure behind it, so its line is simply treated as finished — the same thing a tap does.
    //
    // That second branch is not tidiness. Unity silences the room the moment the device opens
    // (ConsultationRemoteStage.MicStart), so the take's SPEAK_DONE never comes; a phase waiting on
    // it would sit there forever, and the guard that catches a lost take only covers the loop.
    if (this.inLoop) {
      this.interruptAnswer(true);
    } else if (this.speaking) {
      this.speaking = null;
      this.patch({ speaking: false });
      const waiter = this.speakDoneWaiter;
      this.speakDoneWaiter = null;
      waiter?.();
    }
    // `opening`, not `listening` — the device is not open until Unity says so (MIC_STATE).
    this.patch({ mic: { ...this.state.mic, state: 'opening', level: 0, error: '' } });
    this.stage.startMic(this.lang);
  }

  /** Release. Cuts the take here; the text comes back as a MIC_RESULT. */
  stopMic() {
    // Only a take that is actually recording can be "finished". Tapping stop while the permission
    // dialog is still up is a cancel, and the UI routes it there.
    if (this.state.mic.state !== 'listening') return;
    this.patch({ mic: { ...this.state.mic, state: 'transcribing', level: 0 } });
    this.stage.stopMic();
  }

  /** Changed their mind. The take is dropped and, if she was cut off for it, she gets her answer
   *  back rather than being left mute mid-paragraph. */
  cancelMic() {
    if (this.state.mic.state === 'idle') return;
    this.stage.cancelMic();
    this.patch({ mic: { ...this.state.mic, state: 'idle', level: 0, error: '' } });
    this.restoreCutOff();
  }

  /** Unity's view of the device. `level` moves the button while it listens. */
  onMicState(state: MicState, level: number) {
    if (this.state.mic.state === 'idle' && state === 'idle') return;
    this.patch({ mic: { ...this.state.mic, state, level: state === 'listening' ? level : 0 } });
  }

  /** A finished take. Spoken words ARE the question — the mic is how you talk to her, not a
   *  dictation box, so a good transcript is sent rather than parked in the text field. */
  onMicResult(result: { ok: boolean; text: string; error: MicError | '' }) {
    const error = result.ok ? '' : result.error || 'upstream';
    this.patch({
      mic: {
        ...this.state.mic,
        state: 'idle',
        level: 0,
        error,
        // One refusal of this kind is the whole answer: the route is missing on this server and
        // will be missing for every take after it too.
        offered: this.state.mic.offered && error !== 'unavailable',
      },
    });
    const text = (result.text ?? '').trim();
    if (!result.ok || !text) {
      // Nothing was said, so nothing was interrupted.
      this.restoreCutOff();
      return;
    }
    this.submitQuestion(text);
  }

  /**
   * Stage a beat that has no phase in the asset.
   *
   * The loop and the failure notices are RN's own: the doc's twenty phases end
   * at the farewell and say nothing about a conversation after it, or about
   * what the counselor does when the reading cannot be made. Until now those
   * beats sent no staging at all, so he held whatever pose the last real phase
   * left him in — thinking, through an entire chat.
   *
   * The gestures here are a DIRECTION CHOICE, not a transcription: `Agreeing`
   * when he takes a question, `HeadShake` when he cannot answer, `Laugh` for
   * the one relaxed moment in the session. Change them freely; nothing computes
   * anything from these ids.
   */
  private stageBeat(id: string, trigger: string, camera: string = 'dialogue') {
    this.stage.phase({
      phaseId: id,
      camera,
      animationTriggers: [trigger],
      vfx: [],
      sound: [],
      spotlight: '',
      resetVfx: false,
    });
  }

  /* ── Waiting on the reading ───────────────────────────────────────────── */

  private holdForReading(i: number) {
    // Say that the wait is a wait. Without this the card from the last cover
    // phase just sat there, and a 5-30 s hold looked exactly like a crash.
    const p = this.phases[i];
    const waiting = this.locV('consult_thinking', this.uiV('thinking'));
    this.patch({
      screen: 'thinking',
      speaker: loc(p?.speakerLocKey ?? '', this.lang, this.state.speaker),
      line: waiting,
      choices: [],
      canTap: false,
      inputEnabled: false,
      notice: null,
    });
    this.stage.thinking(true);

    // ...and SAY it. The card carries the counselor's own name and her line, so on screen she is
    // plainly speaking; she just never made a sound. This is the longest silence in the session —
    // the 5-30 s the reading takes — and the one place the player has nothing to do but watch her,
    // which is why it reads as the room having broken rather than as a pause.
    //
    // Nothing waits on this one: the poll below is driven by the oracle, not by SPEAK_DONE, and the
    // reading cutting the line off mid-word is the right outcome when it lands early.
    this.speak(
      () => this.stage.speakClip(['consult_thinking'], this.topic, THINKING_KEY, [waiting]),
      THINKING_KEY,
    );

    const poll = () => {
      if (!this.running) return;
      if (this.oraclePending) {
        this.timer = this.sched.set(poll, COVER_POLL_MS);
        return;
      }
      this.timer = null;
      this.stage.thinking(false);
      if (this.oracleError) {
        this.showNotice(i);
        return;
      }
      this.enter(i);
    };
    this.timer = this.sched.set(poll, COVER_POLL_MS);
  }

  /**
   * Three bodies for three different situations. Everything used to be
   * "connection lost", including the case where the server answered perfectly
   * well and the reading layer behind it had died — sending the player off to
   * check their wifi for a fault that was not wifi.
   */
  private showNotice(readingIndex: number) {
    this.stage.thinking(false);
    this.stageBeat('NOTICE', 'HeadShake');
    this.pendingRetryIndex = readingIndex;
    this.patch({
      screen: 'notice',
      speaker: loc('consult_speaker_counselor', this.lang, ''),
      line: '',
      choices: [],
      canTap: false,
      inputEnabled: false,
      notice: this.noticeView(),
    });
  }

  /** The notice card's copy, in the current language. Built from `oracleError`, which outlives the
   *  patch, so relocalize() can rebuild it without knowing why it was shown. */
  private noticeView(): NoticeView {
    const key =
      this.oracleError === 'no_chart'
        ? 'consult_no_chart_body'
        : this.oracleError === 'upstream'
          ? 'consult_upstream_body'
          : 'consult_disconnect_body';
    return {
      body: loc(key, this.lang, ''),
      retryLabel: loc('consult_retry', this.lang, 'Retry'),
      leaveLabel: loc('consult_leave_room', this.lang, 'Leave'),
    };
  }

  private pendingRetryIndex = -1;

  /** Re-asks the SAME question — the flow still holds topic, scope and text. */
  retry() {
    if (this.pendingRetryIndex < 0) return;
    this.oraclePending = true;
    this.oracleError = null;
    this.stage.askOracle({ question: this.question, topic: this.topic, scope: this.scope });
    this.enter(this.pendingRetryIndex);
  }

  /* ── The reading arrives ──────────────────────────────────────────────── */

  /**
   * Say the stems and branches in the language being spoken.
   *
   * ⚠️ APPLIED HERE, at the one place every server answer enters the room — because a fix one layer
   * up did nothing. `ServerCounselorAI.reply()` was cleaned first, and it is not on this path at
   * all: inside the embedded room UNITY calls the server, and the answer arrives back over the
   * bridge as ORACLE_RESULT. The tests passed, the build shipped, and the screenshot still had
   * 庚辰 in the bubble. See sajuGlyphs.ts for what the transliteration is and why.
   */
  private said(text: string): string {
    return sayGlyphs(text, this.lang);
  }

  onOracleResult(payload: OracleResultPayload) {
    // Every mounted room hears every ORACLE_RESULT; only the engine that asked
    // may act on it (see loopPending).
    if (!this.running) return;
    if (payload.loop) {
      this.onLoopResult(payload);
      return;
    }
    if (!this.oraclePending) return;
    this.oraclePending = false;
    this.oracleError = payload.ok ? null : (payload.error ?? 'connection');
    this.followup = payload.followup ?? '';
    if (payload.report) this.reportData = payload.report;
    this.beats = {};
    this.beatScenes = {};
    for (const beat of payload.beats ?? []) {
      // Both, not one: `lines` is what the bubble draws and `scenes` is what the voice speaks a
      // beat at a time. Cleaning either alone leaves the other exactly as broken.
      this.beats[beat.phaseId] = beat.lines.map(l => this.said(l));
      if (beat.scenes && beat.scenes.length > 0) {
        this.beatScenes[beat.phaseId] = beat.scenes.map(sc => ({ ...sc, text: this.said(sc.text) }));
      }
    }
  }

  /* ── The free-chat loop ───────────────────────────────────────────────── */

  private openLoop() {
    this.inLoop = true;
    this.clearTimer();
    this.stageBeat('LOOP_OPEN', 'Laugh');
    this.patch({
      screen: 'loop',
      canTap: false,
      inputEnabled: true,
      choices: [],
      notice: null,
      suggestion: this.followup,
      // The loop's opening line never had a Unity string key — it was an
      // inspector field on ConsultationLoop. It is RN copy now.
      line: this.uiV('loop.intro'),
    });
    const intro = this.state.line;
    if (intro) {
      this.opts.onCounselorLine?.(intro);
      this.appendTranscript('counselor', intro);
      // No recorded take exists for a line that was never in the string
      // table, so this one is synthesised like the reading beats are.
      this.speak(() => this.stage.speakText(intro, 'loop_intro'), 'loop_intro');
    }
    // The "one moment" lines are spoken the instant a question goes out, so
    // they have to be in memory already — synthesising them then would put the
    // same 2-3 s of silence in front of them that they exist to cover.
    for (let i = 0; i < WAIT_LINES; i++) {
      const line = this.uiV(`loop.wait.${i}` as UiKey);
      if (line) this.stage.prefetchText(line, `loop_wait_${i}`);
    }
  }

  /** A different "one moment" line each turn — never the same one twice running. */
  private pickWait(): { text: string; key: string } {
    let i = Math.floor(Math.random() * WAIT_LINES);
    if (i === this.lastWait) i = (i + 1) % WAIT_LINES;
    this.lastWait = i;
    return { text: this.uiV(`loop.wait.${i}` as UiKey), key: `loop_wait_${i}` };
  }

  private askLoop(text: string) {
    // The player spoke over her. Cut her off where she stands, and keep what they had actually
    // HEARD — the answer to their new question has to start from there.
    const heard = this.interruptAnswer();
    this.loopTurns += 1;
    this.loopPending = true;
    this.appendTranscript('user', text);
    this.opts.onUserLine?.(text);
    this.patch({ inputEnabled: false, suggestion: '', pending: true });
    // He takes the question in before he starts thinking about it.
    this.stageBeat('LOOP_ASK', 'Agreeing');
    this.stage.thinking(true);
    this.followQuestionTopic(text);
    this.stage.askOracle({
      question: text,
      topic: this.topic,
      scope: this.scope,
      loop: true,
      interrupted: heard,
      chatMode: this.opts.chatMode?.(),
    });
    // The answer is 15-20 s away. Rather than a typing indicator, the counselor
    // says so — a short prefetched line, spoken at once, so the wait reads as
    // her thinking rather than the app hanging.
    const wait = this.pickWait();
    if (wait.text) {
      this.appendTranscript('counselor', wait.text);
      this.waitRow = this.state.transcript.length - 1;
      this.speak(() => this.stage.speakText(wait.text, wait.key), wait.key);
      this.armWaitCover();
    }
  }

  /**
   * Keep the wait alive while the answer is being written.
   *
   * Tier 1 replaces the line in its own bubble; tier 2 pushes the camera in, once. Both stop the
   * moment the turn is no longer pending — an answer, an error, an interruption or leaving the room
   * all go through `clearWaitCover`, because a timer that outlives the wait writes one of these
   * lines over the answer itself.
   */
  private armWaitCover() {
    this.clearWaitCover();
    this.waitPushedIn = false;
    const startedAt = this.sched.now();

    const tick = () => {
      this.waitTimer = null;
      if (!this.loopPending || !this.inLoop || !this.running) return;

      const waited = this.sched.now() - startedAt;
      if (waited >= WAIT_PUSHIN_AFTER_MS && !this.waitPushedIn) {
        this.waitPushedIn = true;
        // A closer shot, not a new phase: the beat id is only there so the bridge log says why the
        // camera moved. ⚠️ Whether the room honours it is the room's business — see the shot-lock
        // note in the camera work; if it does not, the tier above is still doing its job.
        this.stageBeat('LOOP_WAIT_LONG', 'Thinking', 'closeUp');
      }

      // Words and voice change together, and only while she is quiet — the bubble must never show a
      // line she has not said (see the note on WAIT_SWAP_AFTER_MS).
      if (!this.speaking) {
        const next = this.pickWait();
        if (next.text && this.waitRow >= 0 && this.waitRow < this.state.transcript.length) {
          const transcript = this.state.transcript.slice();
          transcript[this.waitRow] = { role: 'counselor', text: next.text };
          this.patch({ transcript });
          this.speak(() => this.stage.speakText(next.text, next.key), next.key);
        }
      }
      this.waitTimer = this.sched.set(tick, WAIT_SWAP_EVERY_MS);
    };

    this.waitTimer = this.sched.set(tick, WAIT_SWAP_AFTER_MS);
  }

  private clearWaitCover() {
    if (this.waitTimer !== null) {
      this.sched.clear(this.waitTimer);
      this.waitTimer = null;
    }
  }

  private onLoopResult(payload: OracleResultPayload) {
    if (!this.inLoop || !this.loopPending) return;
    this.loopPending = false;
    this.clearWaitCover();
    this.stage.thinking(false);
    const text = this.said((payload.beats?.[0]?.lines ?? []).join('\n'));
    if (!payload.ok || !text) {
      this.patch({
        inputEnabled: true,
        suggestion: this.followup,
        pending: false,
      });
      this.appendTranscript(
        'counselor',
        loc('consult_disconnect_body', this.lang, ''),
      );
      return;
    }
    this.followup = payload.followup ?? '';
    this.stageBeat('LOOP_ANSWER', 'Explaining');
    this.opts.onCounselorLine?.(text);
    // `pending` ends here — the waiting is over — but the TURN does not: the answer is delivered a
    // chunk at a time over the next several seconds.
    //
    // THE INPUT OPENS ANYWAY, AND THE SUGGESTION CHIP DOES NOT. Those two were shut together once,
    // for a real bug: one short line on screen, the chip live, one tap, and the rest of the answer
    // arrived behind a question the player never meant to ask. The chip was the trap — a single tap
    // that fires a question with no intent behind it. Typing one, or holding the mic down, is not
    // an accident, and cutting in is now something the room is MEANT to allow (interruptAnswer).
    // So the box opens with her voice and the chip waits for her to finish, in releaseTurn().
    this.patch({ pending: false, inputEnabled: true });

    // The answer is not dropped into the transcript whole. It is spoken a chunk
    // at a time — first chunk a single sentence, the rest ~110 characters — and
    // each chunk is REVEALED as its voice is asked for, so the bubble grows with
    // the speech and the transcript scrolls along with it. A 600-character
    // answer landing in one frame and the voice arriving four seconds later
    // was the "she talks late" report; the text was early, not the voice late.
    const key = `loop_${this.loopTurns}`;
    // Same rule as the staged beats: when the server tagged the answer, its scenes ARE the chunks.
    const loopScenes = payload.beats?.[0]?.scenes;
    const chunks: SpokenChunk[] =
      loopScenes && loopScenes.length > 0 ? chunksOfScenes(loopScenes) : splitReading(text);
    // Warm every chunk NOW, while the "one moment" line is still being said:
    // the first clip is usually in memory by the time she finishes it, and the
    // later ones land while the earlier ones play.
    chunks.forEach((c, i) => this.stage.prefetchText(c.text, `${key}.${i}`));
    this.answerWalk = { key, chunks, next: 0, row: -1, shownAt: this.sched.now() };
    this.armAnswerGuard(text);
    // If the "one moment" line is still being said, let it finish: cutting her
    // off mid-word to start the answer sounds worse than a beat of pause.
    this.afterSpeech(() => this.speakNextChunk());
  }

  /** Say the next chunk of the reading beat on screen and grow the card to
   *  match. Returns false when there is nothing left, which is what tells
   *  onSpeakDone the phase may now be released. */
  private speakNextReadingChunk(): boolean {
    const walk = this.readingWalk;
    if (!walk || !this.running) return false;
    if (walk.next >= walk.chunks.length) {
      this.readingWalk = null;
      return false;
    }
    // The scene that just finished speaking may still be owed time on screen. Returning true
    // BEFORE that wait is deliberate: it tells onSpeakDone the beat is not over, so the phase's
    // waiter stays queued across the pause instead of the walk being released into it.
    const previous = walk.chunks[walk.next - 1];
    this.afterHold(previous, walk.shownAt, walk.chunks[walk.next], () => {
      const current = this.readingWalk;
      if (!current || current.key !== walk.key || !this.running) return;
      const i = current.next;
      current.next += 1;
      current.shownAt = this.sched.now();
      this.patch({
        line: joinChunks(current.chunks.slice(0, i + 1)),
        tone: current.chunks[i].tone ?? '',
        emotion: current.chunks[i].emotion ?? 'neutral',
      });
      const key = `${current.key}#${i}`;
      this.speak(() => this.stage.speakText(current.chunks[i].text, key), key);
    });
    return true;
  }

  /** Put the rest of the reading beat on the card at once and stop speaking it.
   *  A tap mid-beat means "show me the rest", not "throw the rest away". */
  private flushReadingWalk(): boolean {
    const walk = this.readingWalk;
    if (!walk || walk.next >= walk.chunks.length) {
      this.readingWalk = null;
      return false;
    }
    this.readingWalk = null;
    // A tap during a hold means "get on with it": the pause is for the player's benefit, and they
    // have just said they do not need it.
    this.clearHold();
    // The whole beat is on screen now, so the face is the LAST scene's — the one the beat ends on.
    const last = walk.chunks[walk.chunks.length - 1];
    this.patch({
      line: joinChunks(walk.chunks),
      tone: last?.tone ?? '',
      emotion: last?.emotion ?? 'neutral',
    });
    this.speaking = null;
    this.patch({ speaking: false });
    this.speakDoneWaiter = null;
    this.stage.stopSpeak();
    return true;
  }

  /** Speak (and show) the next chunk of the answer being delivered; the take's
   *  SPEAK_DONE brings the one after it. */
  private speakNextChunk() {
    const walk = this.answerWalk;
    if (!walk || !this.inLoop || !this.running) return;
    if (walk.next >= walk.chunks.length) {
      // The last scene is owed its time too — releasing the turn the instant her voice stops puts
      // the input box back under a line the player has not finished reading.
      this.afterHold(walk.chunks[walk.next - 1], walk.shownAt, undefined, () => {
        if (this.answerWalk !== walk) return;
        this.answerWalk = null;
        this.releaseTurn();
      });
      return;
    }
    this.afterHold(walk.chunks[walk.next - 1], walk.shownAt, walk.chunks[walk.next], () => {
      if (this.answerWalk !== walk || !this.inLoop || !this.running) return;
      const i = walk.next;
      walk.next += 1;
      walk.shownAt = this.sched.now();
      this.revealChunks(walk, i + 1);
      this.patch({ tone: walk.chunks[i].tone ?? '', emotion: walk.chunks[i].emotion ?? 'neutral' });
      const chunkKey = `${walk.key}.${i}`;
      this.speak(() => this.stage.speakText(walk.chunks[i].text, chunkKey), chunkKey);
      this.afterSpeech(() => this.speakNextChunk());
    });
  }

  /** Show the first `count` chunks of the walk in its bubble (creating it on the
   *  first call). Idempotent for chunks already shown. */
  private revealChunks(walk: NonNullable<ConsultationEngine['answerWalk']>, count: number) {
    const shown = joinChunks(walk.chunks.slice(0, count));
    if (walk.row < 0) {
      this.appendTranscript('counselor', shown);
      walk.row = this.state.transcript.length - 1;
      return;
    }
    const transcript = this.state.transcript.slice();
    transcript[walk.row] = { role: 'counselor', text: shown };
    this.patch({ transcript });
  }

  /** Stop delivering the current answer and show whatever of it was still to come. */
  /**
   * Stop her mid-sentence because the player is talking, and report what they had heard.
   *
   * NOT the same as `flushAnswerWalk`. That one is for an answer that ran out of time or was
   * abandoned: the unspoken remainder is dumped into the bubble so nothing is lost. An interruption
   * is the opposite case — the rest was never said, the player never heard it, and showing it would
   * put words on screen that the counselor is about to be told not to repeat. So the bubble is
   * truncated to the chunks that were actually spoken and the tail is dropped.
   *
   * The last spoken chunk was almost certainly cut part-way through. It counts as heard anyway:
   * half a sentence is closer to what reached them than none of it, and the alternative is the
   * counselor repeating a point the player just sat through.
   */
  private interruptAnswer(stash = false): string {
    // Already cut off — the mic did it when it opened, and the words they heard were put aside
    // then. Consume them here: the question that follows is the one they interrupted her with.
    if (this.cutOff) {
      const heard = this.cutOff.heard;
      this.cutOff = null;
      return heard;
    }
    const walk = this.answerWalk;
    if (!walk) return '';
    this.answerWalk = null;
    // She may be between scenes rather than mid-word — a pending hold would otherwise fire after
    // the interruption and start the next line into a player who is already talking.
    this.clearHold();
    const spoken = walk.chunks.slice(0, Math.max(walk.next, 0));
    // Only if something was said. Revealing zero chunks would open an empty counselor bubble above
    // the player's question — a blank speech bubble reads as a failed answer.
    if (spoken.length > 0) this.revealChunks(walk, spoken.length);
    this.speakDoneWaiter = null;
    this.speaking = null;
    this.stage.stopSpeak();
    this.patch({ speaking: false });
    this.clearAnswerGuard();
    const heard = joinChunks(spoken);
    if (heard) devlog(`[flow] interrupted after ${spoken.length}/${walk.chunks.length} chunk(s)`);
    // `stash` is the mic's path only. The mic opens BEFORE there is a question, so an interruption
    // that comes to nothing (they said nothing, the transcription failed) has to be undoable:
    // `restoreCutOff` puts the rest of her answer back on screen. A typed question is already the
    // question, so there is nothing to undo and the tail is deliberately dropped.
    if (stash) this.cutOff = { heard, walk, said: spoken.length };
    return heard;
  }

  /** The interruption came to nothing. Show the rest of the answer she never got to say (unspoken,
   *  but not lost) and hand the turn back. */
  private restoreCutOff() {
    const cut = this.cutOff;
    this.cutOff = null;
    if (!cut || !this.inLoop || !this.running) return;
    if (cut.said < cut.walk.chunks.length) this.revealChunks(cut.walk, cut.walk.chunks.length);
    this.releaseTurn();
  }

  private flushAnswerWalk() {
    const walk = this.answerWalk;
    if (!walk) return;
    this.answerWalk = null;
    this.revealChunks(walk, walk.chunks.length);
    this.speakDoneWaiter = null;
    this.releaseTurn();
  }

  /**
   * Hand the turn back: the counselor has finished saying her answer.
   *
   * Every way an answer can end comes through here — the last chunk spoken, a flush because the
   * player asked something new, or the guard below firing. Callers that mean to keep the input shut
   * (askLoop, endLoop) patch it closed after, which is why this does not try to be clever about
   * who is asking.
   */
  private releaseTurn() {
    this.clearAnswerGuard();
    if (!this.inLoop || !this.running) return;
    this.patch({ inputEnabled: true, suggestion: this.followup });
  }

  /**
   * The room must never be able to lock.
   *
   * `speak()` has no timeout: it hands a take to Unity and waits for SPEAK_DONE. Nothing guarantees
   * that ever arrives — TTS degrades to silence rather than to an error, and a take that is never
   * reported leaves speakDoneWaiter holding the walk forever. That used to be harmless because the
   * input was already open; now that the turn is held until she finishes, a lost take would be a
   * player staring at a disabled text box with nothing to do.
   *
   * So the walk gets a deadline: the answer's own reading estimate with generous slack, after which
   * the rest is shown at once and the turn goes back regardless. It should never fire.
   */
  private armAnswerGuard(text: string) {
    this.clearAnswerGuard();
    const readMs = (text.length / CHARS_PER_SECOND) * 1000;
    const budget = Math.max(readMs * ANSWER_GUARD_SLACK, ANSWER_GUARD_MIN_MS);
    this.answerGuard = this.sched.set(() => {
      this.answerGuard = null;
      this.flushAnswerWalk();
    }, budget);
  }

  private clearAnswerGuard() {
    if (this.answerGuard !== null) {
      this.sched.clear(this.answerGuard);
      this.answerGuard = null;
    }
  }

  /** Leave the loop through P20 — a FORWARD jump, so the standing VFX survive
   *  and the farewell always plays. */
  endLoop() {
    if (!this.inLoop) return;
    this.flushAnswerWalk();
    this.inLoop = false;
    this.patch({ screen: 'none', inputEnabled: false, suggestion: '' });
    this.goTo('P20');
  }

  private appendTranscript(role: TranscriptLine['role'], text: string) {
    this.patch({ transcript: [...this.state.transcript, { role, text }] });
  }

  /* ── The end ──────────────────────────────────────────────────────────── */

  private finish() {
    if (!this.running) return;
    this.running = false;
    this.answerWalk = null;
    this.readingWalk = null;
    this.cutOff = null;
    this.clearTimer();
    this.stage.stopSpeak();
    // A recording left running holds the input device — and its indicator — after the room is gone.
    if (this.state.mic.state !== 'idle') this.stage.cancelMic();
    this.patch({
      finished: true, screen: 'none', inputEnabled: false, canTap: false,
      speaking: false, mic: { state: 'idle', level: 0, error: '', offered: this.state.mic.offered },
    });
    this.opts.onFinished?.();
    this.stage.exit();
  }
}
