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
import { ui } from './strings';
import type { Lang } from '../../../shared/i18n';
import { sayGlyphs } from '../api/sajuGlyphs';
import type {
  CounselorEmotion,
  CounselorScene,
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
type SpokenChunk = ReadingChunk & { tone?: string; emotion?: CounselorEmotion };

/** Scenes as chunks. Every scene opens its own paragraph: the server broke the answer there because
 *  the delivery changes, and running two tones into one paragraph hides exactly that. */
function chunksOfScenes(scenes: CounselorScene[]): SpokenChunk[] {
  return scenes.map((sc, i) => ({
    text: sc.text,
    newParagraph: i > 0,
    tone: sc.tone,
    emotion: sc.emotion,
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

/** Phases that exist only to cover the wait for the server. */
const COVER_PHASES = ['P06', 'P07', 'P08', 'P09', 'P10'];

/** How many `loop.wait.N` lines strings.ts carries per language. */
const WAIT_LINES = 4;
type UiKey = Parameters<typeof ui>[0];

/** The last spoken reading beat; the free-chat loop takes over after it. */
const LOOP_AFTER_PHASE = 'P19';

/** The first phase that speaks the reading — the only one that has to wait. */
const READING_PHASE = 'P11';

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
  /** A reading beat mid-delivery. Same idea as `answerWalk` but the text lives
   *  on the phase card rather than in the transcript: P11/P14/P17/P19 used to
   *  drop the whole beat on screen and then send all of it to TTS in one go,
   *  which read as "she talks four seconds late" and silently lost anything
   *  past the server's 800-character cap. */
  private readingWalk: { key: string; chunks: SpokenChunk[]; next: number } | null = null;

  /** A loop answer mid-delivery: spoken and revealed one chunk at a time, so the
   *  bubble grows with the voice instead of landing whole seconds before it. */
  private answerWalk: {
    key: string;
    chunks: SpokenChunk[];
    /** Next chunk to speak. */
    next: number;
    /** Index of the growing bubble in `transcript`, -1 before the first chunk. */
    row: number;
  } | null = null;

  constructor(opts: EngineOptions) {
    this.opts = opts;
    this.stage = opts.stage;
    this.sched = opts.scheduler ?? realScheduler;
    this.phases = opts.phases ?? allPhases;
    this.lang = opts.lang;
    this.topic = opts.presetTopic ?? '';
  }

  /* ── Subscription ─────────────────────────────────────────────────────── */

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
    this.branches = [];
    this.question = '';
    // Seeded, not blanked: begin() also runs on a replay, and the area the
    // player picked on the way in still holds for the next question.
    this.topic = this.opts.presetTopic ?? '';
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
    const reading = this.beats[p.id];

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
      this.readingWalk = { key: p.id, chunks, next: 1 };
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
      this.withTopic(loc(keys?.[i] ?? '', this.lang, fallback)),
    );
    return { keys, spoken, body: spoken.join('\n') };
  }

  private choicesOf(p: ConsultationPhase): ChoiceView[] {
    return (p.choices ?? []).map(c => ({
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
    this.speakDoneWaiter = null;
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
  private stageBeat(id: string, trigger: string) {
    this.stage.phase({
      phaseId: id,
      camera: 'dialogue',
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
    const waiting = loc('consult_thinking', this.lang, ui('thinking', this.lang));
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
      line: ui('loop.intro', this.lang),
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
      const line = ui(`loop.wait.${i}` as UiKey, this.lang);
      if (line) this.stage.prefetchText(line, `loop_wait_${i}`);
    }
  }

  /** A different "one moment" line each turn — never the same one twice running. */
  private pickWait(): { text: string; key: string } {
    let i = Math.floor(Math.random() * WAIT_LINES);
    if (i === this.lastWait) i = (i + 1) % WAIT_LINES;
    this.lastWait = i;
    return { text: ui(`loop.wait.${i}` as UiKey, this.lang), key: `loop_wait_${i}` };
  }

  private askLoop(text: string) {
    // The player moved on mid-answer. The rest of what she was saying goes into
    // the transcript at once — unspoken, but not lost.
    this.flushAnswerWalk();
    this.loopTurns += 1;
    this.loopPending = true;
    this.appendTranscript('user', text);
    this.opts.onUserLine?.(text);
    this.patch({ inputEnabled: false, suggestion: '', pending: true });
    // He takes the question in before he starts thinking about it.
    this.stageBeat('LOOP_ASK', 'Agreeing');
    this.stage.thinking(true);
    this.stage.askOracle({ question: text, topic: this.topic, scope: this.scope, loop: true });
    // The answer is 15-20 s away. Rather than a typing indicator, the counselor
    // says so — a short prefetched line, spoken at once, so the wait reads as
    // her thinking rather than the app hanging.
    const wait = this.pickWait();
    if (wait.text) {
      this.appendTranscript('counselor', wait.text);
      this.speak(() => this.stage.speakText(wait.text, wait.key), wait.key);
    }
  }

  private onLoopResult(payload: OracleResultPayload) {
    if (!this.inLoop || !this.loopPending) return;
    this.loopPending = false;
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
    // `pending` ends here — the waiting is over — but the TURN does not. The answer is delivered a
    // chunk at a time over the next several seconds, so opening the input and the suggestion chip
    // now would invite the player to speak while the counselor is still mid-sentence. They did:
    // one short line on screen, the chip live, tap, and the rest of the answer arrived behind their
    // next question — and askLoop's flushAnswerWalk dumped it in unspoken, exactly as designed for
    // a player who MEANT to move on. Nobody meant to. The room asked them to.
    // Handed back in releaseTurn(), when she has actually finished.
    this.patch({ pending: false });

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
    this.answerWalk = { key, chunks, next: 0, row: -1 };
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
    const i = walk.next;
    walk.next += 1;
    this.patch({
      line: joinChunks(walk.chunks.slice(0, i + 1)),
      tone: walk.chunks[i].tone ?? '',
      emotion: walk.chunks[i].emotion ?? 'neutral',
    });
    const key = `${walk.key}#${i}`;
    this.speak(() => this.stage.speakText(walk.chunks[i].text, key), key);
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
    // The whole beat is on screen now, so the face is the LAST scene's — the one the beat ends on.
    const last = walk.chunks[walk.chunks.length - 1];
    this.patch({
      line: joinChunks(walk.chunks),
      tone: last?.tone ?? '',
      emotion: last?.emotion ?? 'neutral',
    });
    this.speaking = null;
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
      this.answerWalk = null;
      this.releaseTurn();
      return;
    }
    const i = walk.next;
    walk.next += 1;
    this.revealChunks(walk, i + 1);
    this.patch({ tone: walk.chunks[i].tone ?? '', emotion: walk.chunks[i].emotion ?? 'neutral' });
    const chunkKey = `${walk.key}.${i}`;
    this.speak(() => this.stage.speakText(walk.chunks[i].text, chunkKey), chunkKey);
    this.afterSpeech(() => this.speakNextChunk());
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
    this.clearTimer();
    this.stage.stopSpeak();
    this.patch({ finished: true, screen: 'none', inputEnabled: false, canTap: false });
    this.opts.onFinished?.();
    this.stage.exit();
  }
}
