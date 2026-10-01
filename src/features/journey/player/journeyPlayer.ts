import { create } from 'zustand';
import type { Lang } from '../../../shared/i18n';
import { translate } from '../../../shared/i18n/translations';
import { devlog } from '../../../shared/devlog';
import { bundledSoundBase, bundledSoundPath } from '../../../shared/audio/bundledSound';
import { fetchJourneyContent, journeyBirthOf, narrationUrl, type JourneyContentError, type NarrationClip } from '../api/journeyApi';
import { beatVoiceSettled, prefetchBeatLines, sayBeatLine, stopBeatVoice } from './beatVoice';
import { unlockMoment, type UnlockFailure } from './unlockMoment';
import { useSavedJourneys, withPart } from '../store/savedJourneysStore';
import { useCoins } from '../../coins/store/coinStore';
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { JOURNEYS } from '../data/journeys';
import type { Chapter, FortuneCard, Journey, JourneyCard, JourneyContent, JourneyPart, MomentCue, MomentPresentation } from '../types';
import type { JourneyStatePayload } from '../../counseling/types';

/**
 * The Journey player — one for the whole app, so a journey keeps going when the player leaves the
 * screen (the mini player drives the same instance from anywhere).
 *
 * Three audio layers, as asked: VOICE (the counsellor's narration, streamed from the server's
 * stored TTS clip), BGM and AMBIENT (bundled loops named in the journey data; null = silence).
 * Only voice drives the clock: position, cards and "the part is over" all come from it.
 *
 * A station ends → a transition (the train runs, arrives, the view changes) → the next station.
 * The next station's audio is synthesised and loaded DURING the transition and the part before it,
 * so a station never waits on the server.
 *
 * A station is told in PARTS (the server's `parts`), each its own clip. Part 0 is free; the others
 * are paid moments. Between the parts the station has STAGES — the overlays of the 2027 mockup
 * (01-10) that wait for the player: the title card on arrival, the card pick, the branch choice, the
 * quarter list, the reveal card after an unlock, "on to the next station", the ending. A locked part
 * stops the train (status paused, moment `locked`): the counsellor voices the server's teaser, and
 * the player either unlocks it or says "later" — which rides on to the next station. Nothing is
 * withheld from travel: any station can be reached, paid for or not.
 */

let SoundModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

/** `platform`: the content is in and the player stands on the station platform (the 3D cabin's
 *  JourneyPlatform) until they press "board the train" — `depart()` starts the reading. */
export type JourneyStatus = 'idle' | 'boarding' | 'platform' | 'playing' | 'paused' | 'transition' | 'done' | 'error';

/**
 * What the station is waiting on the player for ('' = nothing; the narration runs or a lock is up).
 * - `title`: the station's title card, "[topic] 보기" starts it (`beginStation`).
 * - `pick`: three face-down cards (`pickCard`, then `beginReading`).
 * - `branch`: which of the two paid parts first (`chooseBranch`).
 * - `quarters`: the list of the monthly station's quarters (`playQuarter`, `nextStation`).
 * - `reveal`: the card a just-unlocked part opens with (`continueReveal`).
 * - `stationEnd`: "on to the next station" (`nextStation`).
 * - `ending`: the last station has been told; "finish the journey" (`finish`).
 */
export type JourneyStage = '' | 'title' | 'pick' | 'branch' | 'quarters' | 'reveal' | 'stationEnd' | 'ending';

export interface ActiveCard extends FortuneCard {
  key: string;
  chapterId: string;
  /** How long the card stays up. Shorter when a part has many cards (a quarter names three
   *  months), so each one is gone before the voice reaches the next. */
  holdMs?: number;
}

const CARD_HOLD_MS = 6500;

/** Where the train is with respect to a paid moment (Unity JOURNEY_STATE `moment`): `locked` — the
 *  train stopped at a locked part; `premium` — an unlocked paid part is playing. '' otherwise. */
export type MomentPhase = '' | 'locked' | 'premium';

export type UnlockError = UnlockFailure['reason'];

/** The topic effect follows the unlock by this much, so it lands after the cabin's own unlock burst
 *  (Unity plays `reveal` on locked → premium) instead of on top of it. */
export const CUE_AFTER_UNLOCK_MS = 1200;

interface JourneyState {
  journeyId: string | null;
  counselorId: string | null;
  tone: string | null;
  lang: Lang;
  content: JourneyContent | null;
  chapterIndex: number;
  status: JourneyStatus;
  /** The part of the station being told (or locked at). */
  partIndex: number;
  /** Parts of this station still to come, in the order they will be offered. */
  queue: number[];
  stage: JourneyStage;
  /** The face-down card the player turned over (stage `pick`), or null. */
  pickedCard: number | null;
  /** The card shown in stage `reveal`. */
  reveal: JourneyCard | null;
  /** Seconds into the current part's narration. */
  position: number;
  duration: number;
  /** The station the train is pulling into, during a transition. */
  transitionTo: number | null;
  activeCard: ActiveCard | null;
  shownCards: string[];
  /** Why boarding failed. `no-chart` needs the player's birth data, not a retry. */
  error: JourneyContentError | null;
  /** The playing narration's loudness, for the cabin counsellor's mouth (JOURNEY_VOICE). `key`
   *  changes whenever the audio position jumps; `startAt` is where, in seconds. */
  voice: { key: string; fps: number; levels: number[]; startAt: number } | null;
  moment: MomentPhase;
  /** The server moment id that is locked or playing, else null. */
  momentId: string | null;
  /** An unlock is being asked for. */
  unlocking: boolean;
  unlockError: UnlockError | null;
  /** The counsellor is saying the locked moment's offer. */
  teaserSpeaking: boolean;
  /** The last one-shot cabin effect and its sequence number. The number only ever grows — for the
   *  whole app session, across journeys — because Unity fires a cue once per NEW cueSeq. */
  cue: MomentCue | '';
  cueSeq: number;

  /** `platform`: wait on the station platform once loaded instead of starting the reading. */
  board(journeyId: string, counselorId: string, tone: string, lang: Lang, opts?: { platform?: boolean }): Promise<void>;
  /** From the platform: start the reading (the player is seated, or the cabin never answered). */
  depart(): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seekBy(seconds: number): void;
  /** On to what comes next: the end of this part (a lock, a choice, the next part), or "later" at a lock. */
  next(): void;
  prev(): void;
  /** Ride to station `index` — any station, ahead or behind. */
  goTo(index: number): void;
  dismissCard(): void;
  /** Stage `title`: start the station (or its card pick). */
  beginStation(): void;
  /** Stage `pick`: turn over card `index` (0-2). */
  pickCard(index: number): void;
  /** Stage `pick`, a card turned over: on to the reading. */
  beginReading(): void;
  /** Stage `branch`: hear part `partIndex` first, the other one after it. */
  chooseBranch(partIndex: number): void;
  /** Stage `quarters`: play quarter `partIndex`, unlocking it first if it is locked. */
  playQuarter(partIndex: number): Promise<void>;
  /** Stage `reveal`: on into the unlocked part. */
  continueReveal(): void;
  /** At a lock: not now — ride on to the next station. The part stays there to buy later. */
  later(): void;
  /** Leave this station for the next one (stage `stationEnd`, the quarter list, a lock's "later"). */
  nextStation(): void;
  /** Stage `ending`: the journey is over. */
  finish(): void;
  /** At a locked moment: ask the server to unlock it (unlockMoment) and carry on into it. */
  unlock(): Promise<void>;
  /** Leave the journey entirely: silence, and the mini player goes away. */
  stop(): void;
  /** Ride again from station `index` (default the first) with the same content and counsellor. */
  replay(index?: number): void;
  /** Open a saved journey at its terminus (no audio): the result screen shows it, `replay` rides again. */
  openSaved(saved: { journeyId: string; counselorId: string; tone: string; lang: Lang; content: JourneyContent }): void;
}

/** How long the train takes between stations. The transition component is timed to this. */
export const TRANSITION_MS = 2800;
/** Reading speed for a part whose audio could not be had: the text still paces itself. */
const SILENT_CHARS_PER_SECOND = 7;

// ── Engine state outside the store (native handles, timers) ─────────────────────────────────

let voice: any = null;
let voiceIsSilent = false;
let silentStart = 0;
let silentOffset = 0;
let poll: ReturnType<typeof setInterval> | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;
let cueTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on every part change and stop: a load that lands late must not start talking. */
let generation = 0;
/** Narration clips by `${chapter}:${part}`. */
const urls = new Map<string, Promise<NarrationClip | null>>();
const clipKey = (ci: number, pi: number) => `${ci}:${pi}`;

/** The voice's envelope, re-keyed from `at` seconds — on a part start, a seek and a resume, the
 *  three moments the cabin's mouth clock must be put back in step with the audio. */
function syncMouth(at: number) {
  const s = useJourneyPlayer.getState();
  if (!s.voice) return;
  useJourneyPlayer.setState({ voice: { ...s.voice, key: `${generation}:${s.chapterIndex}.${s.partIndex}:${Date.now()}`, startAt: at } });
}
const layers: { bgm: any; ambient: any } = { bgm: null, ambient: null };

const journeyOf = (id: string | null): Journey | null => (id ? JOURNEYS[id] ?? null : null);

function releaseVoice() {
  if (voice) {
    try {
      voice.stop?.();
      voice.release?.();
    } catch {}
  }
  voice = null;
  voiceIsSilent = false;
}

function stopPoll() {
  if (poll) clearInterval(poll);
  poll = null;
}

/** A station's parts. A station saved before the paid moments has none: it is one free part. */
export function partsOf(content: JourneyContent | null, chapterId: string | undefined): JourneyPart[] {
  const c = chapterId ? content?.chapters.find(x => x.id === chapterId) : undefined;
  if (!c) return [];
  return c.parts?.length
    ? c.parts
    : [{ momentId: null, unlocked: true, label: null, teaser: null, text: c.narration, cards: c.cards }];
}

function chapterAt(ci: number): Chapter | undefined {
  return journeyOf(useJourneyPlayer.getState().journeyId)?.chapters[ci];
}

function partAt(ci: number, pi: number): JourneyPart | undefined {
  return partsOf(useJourneyPlayer.getState().content, chapterAt(ci)?.id)[pi];
}

/** The part being told or locked at. */
export function currentPart(s: Pick<JourneyState, 'journeyId' | 'content' | 'chapterIndex' | 'partIndex'>) {
  return partsOf(s.content, journeyOf(s.journeyId)?.chapters[s.chapterIndex]?.id)[s.partIndex];
}

/** How the app shows a moment: its own entry in the journey data, or the journey's default. */
export function momentPresentation(journeyId: string | null, id: string | null): MomentPresentation {
  const journey = journeyOf(journeyId);
  return (id && journey?.moments?.[id]) || journey?.momentDefault || {};
}

/** The counsellor's offer at a locked part: the server's line, or the app's own if it sent none. */
export function teaserOf(s: Pick<JourneyState, 'journeyId' | 'content' | 'chapterIndex' | 'partIndex' | 'lang'>): string {
  const part = currentPart(s);
  if (part?.teaser) return part.teaser;
  const key = momentPresentation(s.journeyId, part?.momentId ?? null).teaser;
  return key ? translate(s.lang, key, { year: journeyOf(s.journeyId)?.year ?? '' }) : '';
}

function ensureUrl(ci: number, pi: number) {
  const s = useJourneyPlayer.getState();
  const part = partAt(ci, pi);
  // A locked part has no text to voice; its clip is asked for once the unlock brings the text.
  if (!part?.unlocked || part.text == null || !s.tone) return null;
  const k = clipKey(ci, pi);
  if (!urls.has(k)) urls.set(k, narrationUrl(part.text, s.tone, s.lang));
  return urls.get(k)!;
}

function loadVoice(url: string): Promise<any> {
  return new Promise(resolve => {
    if (!SoundModule) return resolve(null);
    const s = new SoundModule(url, '', (err: unknown) => resolve(err ? null : s));
  });
}

// ── Optional loops: bgm / ambient ────────────────────────────────────────────────────────────

function startLayer(which: 'bgm' | 'ambient', file: string | null, volume: number) {
  if (!file || !SoundModule || layers[which]) return;
  const s = new SoundModule(bundledSoundPath(file), bundledSoundBase(SoundModule), (err: unknown) => {
    // Logged both ways: a loop that fails to load is otherwise silence nobody can tell from "quiet".
    if (err) {
      devlog(`[journey] ${which} ${file} did not load: ${String((err as { message?: string })?.message ?? err)}`);
      return;
    }
    devlog(`[journey] ${which} ${file} playing at ${volume}`);
    s.setNumberOfLoops?.(-1);
    s.setVolume?.(volume);
    s.play?.();
  });
  layers[which] = s;
}

function startLayers(journey: Journey) {
  startLayer('bgm', journey.audio.bgm, 0.25);
  startLayer('ambient', journey.audio.ambient, 0.35);
}

function stopLayers() {
  for (const k of ['bgm', 'ambient'] as const) {
    try {
      layers[k]?.stop?.();
      layers[k]?.release?.();
    } catch {}
    layers[k] = null;
  }
}

function pauseLayers(on: boolean) {
  for (const k of ['bgm', 'ambient'] as const) {
    if (on) layers[k]?.pause?.();
    else layers[k]?.play?.();
  }
}

// ── The clock ────────────────────────────────────────────────────────────────────────────────

function tick() {
  const s = useJourneyPlayer.getState();
  if (s.status !== 'playing') return;
  const onPosition = (t: number) => {
    const st = useJourneyPlayer.getState();
    if (st.status !== 'playing') return;
    useJourneyPlayer.setState({ position: t });
    raiseCard(t);
    if (voiceIsSilent && t >= st.duration) partEnded();
  };
  if (voiceIsSilent) onPosition(silentOffset + (Date.now() - silentStart) / 1000);
  else voice?.getCurrentTime?.((t: number) => onPosition(t));
}

const cardKey = (chapterId: string, pi: number, i: number) => `${chapterId}#p${pi}#${i}`;

function raiseCard(t: number) {
  const s = useJourneyPlayer.getState();
  const chapterId = chapterAt(s.chapterIndex)?.id;
  if (!chapterId || s.activeCard || s.duration <= 0) return;
  // A part's cards are placed within that part's own text.
  const cards = currentPart(s)?.cards ?? [];
  cards.forEach((c, i) => {
    const key = cardKey(chapterId, s.partIndex, i);
    if (s.shownCards.includes(key) || t < c.at * s.duration) return;
    const holdMs = Math.max(2500, Math.min(CARD_HOLD_MS, ((s.duration / (cards.length + 1)) * 0.8) * 1000));
    useJourneyPlayer.setState(st => ({
      activeCard: { ...c, saveable: true, key, chapterId, holdMs },
      shownCards: [...st.shownCards, key],
    }));
  });
}

function fireCue(cue: MomentCue) {
  useJourneyPlayer.setState(st => ({ cue, cueSeq: st.cueSeq + 1 }));
}

function clearCueTimer() {
  if (cueTimer) clearTimeout(cueTimer);
  cueTimer = null;
}

/** Hold the narration for an overlay that waits on the player. The music and the carriage keep
 *  going — the player is still on the train. */
function waitFor(stage: JourneyStage, extra: Partial<JourneyState> = {}) {
  stopPoll();
  releaseVoice();
  useJourneyPlayer.setState({ status: 'paused', stage, activeCard: null, voice: null, ...extra });
}

// ── Stations and parts ───────────────────────────────────────────────────────────────────────

/** The train has pulled in to station `ci`: its title card if it has one, else straight in. */
function arrive(ci: number) {
  const chapter = chapterAt(ci);
  if (chapter?.number != null) {
    waitFor('title', { chapterIndex: ci, partIndex: 0, transitionTo: null, position: 0, duration: 0 });
    return;
  }
  startStation(ci, generation);
}

/** Tell station `ci` from its free part; the paid parts follow in order (a branch reorders them). */
function startStation(ci: number, gen: number) {
  const n = partsOf(useJourneyPlayer.getState().content, chapterAt(ci)?.id).length;
  useJourneyPlayer.setState({ queue: Array.from({ length: Math.max(0, n - 1) }, (_, i) => i + 1), stage: '' });
  startPart(ci, 0, gen);
}

/** Tell part `pi` of station `ci` — or, if it is locked, stop there. */
async function startPart(ci: number, pi: number, gen: number) {
  const s = useJourneyPlayer.getState();
  const journey = journeyOf(s.journeyId);
  if (!journey) return;
  const part = partAt(ci, pi);
  if (!part) {
    // A station the reading has no part for (a short reading): ride on.
    useJourneyPlayer.setState({ chapterIndex: ci, partIndex: pi, transitionTo: null });
    partEnded();
    return;
  }
  if (!part.unlocked) {
    lockAt(ci, pi);
    return;
  }
  // Warm what comes next while this plays: the next part, its lock's offer, or the next station.
  const after = s.queue[0] != null && s.chapterIndex === ci ? s.queue[0] : pi + 1;
  const afterPart = partAt(ci, after);
  if (afterPart?.unlocked) ensureUrl(ci, after);
  else if (afterPart && s.tone) {
    const teaser = teaserOf({ ...s, chapterIndex: ci, partIndex: after });
    if (teaser) prefetchBeatLines([teaser], s.tone, s.lang);
  } else ensureUrl(ci + 1, 0);

  const clip = await ensureUrl(ci, pi);
  if (gen !== generation) return;
  const sound = clip ? await loadVoice(clip.url) : null;
  if (gen !== generation) {
    sound?.release?.();
    return;
  }

  // The first station follows the boarding storyboard: let the counsellor finish the line they are
  // saying ("Shall we explore your first stop?") instead of talking over it (QA 30-09: cut by 0.2 s).
  if (ci === 0 && pi === 0) {
    await beatVoiceSettled();
    if (gen !== generation) { sound?.release?.(); return; }
  }
  releaseVoice();
  const text = part.text ?? '';
  if (sound) {
    voice = sound;
    voiceIsSilent = false;
    useJourneyPlayer.setState({
      duration: sound.getDuration?.() ?? clip?.duration ?? 0,
      voice: clip?.envelope ? { key: `${gen}:${ci}.${pi}:0`, ...clip.envelope, startAt: 0 } : null,
    });
  } else {
    // No voice to be had — the part still runs, paced by its text, rather than stalling the train.
    devlog(`[journey] chapter ${ci} part ${pi} has no audio; running silent`);
    useJourneyPlayer.setState({ voice: null });
    voiceIsSilent = true;
    silentOffset = 0;
    silentStart = Date.now();
    useJourneyPlayer.setState({ duration: Math.max(8, text.length / SILENT_CHARS_PER_SECOND) });
  }
  useJourneyPlayer.setState({
    status: 'playing', stage: '', position: 0, chapterIndex: ci, partIndex: pi, transitionTo: null,
    moment: part.momentId ? 'premium' : '', momentId: part.momentId, teaserSpeaking: false, reveal: null,
  });
  voice?.play?.((ok: boolean) => {
    if (gen !== generation) return;
    if (ok) partEnded();
  });
  stopPoll();
  poll = setInterval(tick, 250);
}

/** Stop at a locked part: the unlock offer goes up and the counsellor makes it. */
function lockAt(ci: number, pi: number, opts: { silent?: boolean; stage?: JourneyStage } = {}) {
  const s = useJourneyPlayer.getState();
  const part = partAt(ci, pi);
  waitFor(opts.stage ?? '', {
    chapterIndex: ci, partIndex: pi, transitionTo: null, position: 0, duration: 0,
    moment: 'locked', momentId: part?.momentId ?? null, unlocking: false, unlockError: null, teaserSpeaking: false,
  });
  if (opts.silent) return;
  const teaser = teaserOf(useJourneyPlayer.getState());
  const id = part?.momentId ?? null;
  if (!teaser || !s.tone) return;
  // Voiced like the boarding lines, in the counsellor's reading voice; the mouth follows it.
  sayBeatLine(teaser, s.tone, s.lang, clip => {
    if (useJourneyPlayer.getState().momentId !== id || useJourneyPlayer.getState().moment !== 'locked') return;
    useJourneyPlayer.setState({
      teaserSpeaking: true,
      voice: clip.envelope ? { key: `teaser:${id}:${Date.now()}`, ...clip.envelope, startAt: 0 } : null,
    });
  }, () => useJourneyPlayer.setState({ teaserSpeaking: false }), false, true);
}

/** The part is over: what the station does next depends on its interaction. */
function partEnded() {
  const s = useJourneyPlayer.getState();
  const chapter = chapterAt(s.chapterIndex);
  if (!chapter || !s.journeyId) return;
  if (s.partIndex === 0) useSavedJourneys.getState().markHeard(s.journeyId, chapter.id);
  const parts = partsOf(s.content, chapter.id);
  if (chapter.interaction === 'quarters' && parts.length > 1) {
    waitFor('quarters', { moment: '', momentId: null, queue: [] });
    return;
  }
  if (chapter.interaction === 'branch' && s.partIndex === 0 && parts.length >= 3) {
    waitFor('branch', { moment: '', momentId: null });
    return;
  }
  const [nextPart, ...rest] = s.queue;
  if (nextPart != null) {
    useJourneyPlayer.setState({ queue: rest });
    goToPart(s.chapterIndex, nextPart);
    return;
  }
  stationDone();
}

/** Every part of the station has been offered. */
function stationDone() {
  const s = useJourneyPlayer.getState();
  const chapter = chapterAt(s.chapterIndex);
  if (chapter?.interaction === 'ending') {
    waitFor('ending', { moment: '', momentId: null });
    return;
  }
  if (chapter?.number != null) {
    waitFor('stationEnd', { moment: '', momentId: null });
    return;
  }
  chapterEnded();
}

/** Within the station: straight to another part, no transition. */
function goToPart(ci: number, pi: number) {
  generation += 1;
  stopPoll();
  releaseVoice();
  clearCueTimer();
  useJourneyPlayer.setState({ activeCard: null, position: 0, stage: '' });
  startPart(ci, pi, generation);
}

function chapterEnded() {
  const s = useJourneyPlayer.getState();
  const journey = journeyOf(s.journeyId);
  if (!journey) return;
  stopPoll();
  if (s.chapterIndex >= journey.chapters.length - 1) {
    finishJourney();
    return;
  }
  travelTo(s.chapterIndex + 1);
}

function finishJourney() {
  const s = useJourneyPlayer.getState();
  stopPoll();
  releaseVoice();
  stopLayers();
  useJourneyPlayer.setState({ status: 'done', stage: '', position: s.duration, moment: '', momentId: null });
}

/** The train runs to station `index`: the transition plays while its audio is loaded, then the
 *  train arrives (title card or straight in). */
function travelTo(index: number) {
  const journey = journeyOf(useJourneyPlayer.getState().journeyId);
  if (!journey || index < 0 || index >= journey.chapters.length) return;
  generation += 1;
  const gen = generation;
  stopPoll();
  releaseVoice();
  stopBeatVoice();
  if (transitionTimer) clearTimeout(transitionTimer);
  clearCueTimer();
  useJourneyPlayer.setState({
    status: 'transition', transitionTo: index, activeCard: null, position: 0, stage: '', queue: [],
    pickedCard: null, reveal: null, moment: '', momentId: null, unlocking: false, unlockError: null, teaserSpeaking: false,
  });
  const arrived = new Promise<void>(r => {
    transitionTimer = setTimeout(r, TRANSITION_MS);
  });
  ensureUrl(index, 0);
  arrived.then(() => {
    if (gen === generation) arrive(index);
  });
}

// ── The store ────────────────────────────────────────────────────────────────────────────────

export const useJourneyPlayer = create<JourneyState>()((set, get) => ({
  journeyId: null,
  counselorId: null,
  tone: null,
  lang: 'ko',
  content: null,
  chapterIndex: 0,
  partIndex: 0,
  queue: [],
  stage: '',
  pickedCard: null,
  reveal: null,
  status: 'idle',
  position: 0,
  duration: 0,
  transitionTo: null,
  activeCard: null,
  shownCards: [],
  error: null,
  voice: null,
  moment: '',
  momentId: null,
  unlocking: false,
  unlockError: null,
  teaserSpeaking: false,
  cue: '',
  cueSeq: 0,

  async board(journeyId, counselorId, tone, lang, opts) {
    get().stop();
    generation += 1;
    const gen = generation;
    set({ journeyId, counselorId, tone, lang, status: 'boarding', chapterIndex: 0, partIndex: 0, error: null });
    // The reading is the account holder's. Their birth data rides along so the server can build the
    // chart even for an account that has never saved a profile (a consultation is the only other
    // thing that does). Without it there is nothing to read from — say so instead of boarding.
    const self = useSubjectsStore.getState().self;
    if (!hasBirthData(self)) {
      set({ status: 'error', error: 'no-chart' });
      return;
    }
    const result = await fetchJourneyContent(journeyId, tone, lang, journeyBirthOf(self));
    if (gen !== generation) return;
    if ('error' in result) {
      set({ status: 'error', error: result.error });
      return;
    }
    // The server's parts say what is unlocked; nothing cached on the phone is consulted for that.
    set({ content: result.content });
    if (result.coinBalance != null) useCoins.getState().setBalance(result.coinBalance);
    startLayers(journeyOf(journeyId)!);
    ensureUrl(0, 0);
    if (opts?.platform) {
      set({ status: 'platform' });
      return;
    }
    arrive(0);
  },

  depart() {
    if (get().status !== 'platform') return;
    arrive(0);
  },

  play() {
    const s = get();
    if (s.status === 'done') return get().replay();
    // A lock or an overlay waits for its own button.
    if (s.status !== 'paused' || s.moment === 'locked' || s.stage !== '') return;
    set({ status: 'playing' });
    pauseLayers(false);
    if (voiceIsSilent) {
      silentStart = Date.now();
    } else {
      syncMouth(s.position);
      const gen = generation;
      voice?.play?.((ok: boolean) => {
        if (gen === generation && ok) partEnded();
      });
    }
    stopPoll();
    poll = setInterval(tick, 250);
  },

  pause() {
    if (get().status !== 'playing') return;
    if (voiceIsSilent) silentOffset += (Date.now() - silentStart) / 1000;
    else voice?.pause?.();
    pauseLayers(true);
    stopPoll();
    set({ status: 'paused' });
  },

  toggle() {
    const st = get().status;
    if (st === 'playing') get().pause();
    else get().play();
  },

  seekBy(seconds) {
    const s = get();
    if ((s.status !== 'playing' && s.status !== 'paused') || s.moment === 'locked' || s.stage !== '') return;
    const to = Math.max(0, Math.min(s.duration - 0.2, s.position + seconds));
    if (voiceIsSilent) {
      silentOffset = to;
      silentStart = Date.now();
    } else {
      voice?.setCurrentTime?.(to);
    }
    set({ position: to });
    if (!voiceIsSilent) syncMouth(to);
  },

  next() {
    const s = get();
    if (!journeyOf(s.journeyId)) return;
    if (s.transitionTo != null) {
      travelTo(s.transitionTo + 1);
      return;
    }
    if (s.moment === 'locked' && s.stage === '') return get().later();
    switch (s.stage) {
      case 'title': return get().beginStation();
      case 'pick': return get().beginReading();
      case 'reveal': return get().continueReveal();
      case 'ending': return get().finish();
      case 'branch':
      case 'quarters':
      case 'stationEnd': return get().nextStation();
    }
    if (s.status === 'playing' || s.status === 'paused') {
      stopPoll();
      releaseVoice();
      partEnded();
    }
  },

  prev() {
    const s = get();
    // Three seconds in, "previous" means "this part from the top" — as every player does.
    if (s.status !== 'transition' && s.stage === '' && s.moment !== 'locked' && s.position > 3) {
      get().seekBy(-s.position);
      return;
    }
    // Inside a station, back to its start; at its start, back a station.
    if (s.transitionTo == null && (s.partIndex > 0 || (s.stage !== '' && s.stage !== 'title'))) {
      generation += 1;
      startStation(s.chapterIndex, generation);
      return;
    }
    travelTo(Math.max(0, (s.transitionTo ?? s.chapterIndex) - 1));
  },

  goTo(index) {
    travelTo(index);
  },

  dismissCard() {
    set({ activeCard: null });
  },

  beginStation() {
    const s = get();
    if (s.stage !== 'title') return;
    if (chapterAt(s.chapterIndex)?.interaction === 'pickCard') {
      set({ stage: 'pick', pickedCard: null });
      return;
    }
    generation += 1;
    startStation(s.chapterIndex, generation);
  },

  pickCard(index) {
    const s = get();
    if (s.stage !== 'pick' || s.pickedCard != null) return;
    set({ pickedCard: Math.max(0, Math.min(2, index)) });
  },

  beginReading() {
    const s = get();
    if (s.stage !== 'pick' || s.pickedCard == null) return;
    generation += 1;
    startStation(s.chapterIndex, generation);
  },

  chooseBranch(partIndex) {
    const s = get();
    if (s.stage !== 'branch') return;
    const paid = partsOf(s.content, chapterAt(s.chapterIndex)?.id)
      .map((p, i) => (p.momentId ? i : -1))
      .filter(i => i > 0);
    if (!paid.includes(partIndex)) return;
    set({ queue: paid.filter(i => i !== partIndex) });
    goToPart(s.chapterIndex, partIndex);
  },

  async playQuarter(partIndex) {
    const s = get();
    if (s.stage !== 'quarters' || s.unlocking) return;
    const part = partAt(s.chapterIndex, partIndex);
    if (!part?.momentId) return;
    if (part.unlocked) {
      goToPart(s.chapterIndex, partIndex);
      return;
    }
    // Tapping a locked quarter IS the decision to unlock it: no offer in between.
    lockAt(s.chapterIndex, partIndex, { silent: true, stage: 'quarters' });
    await get().unlock();
  },

  continueReveal() {
    const s = get();
    if (s.stage !== 'reveal') return;
    generation += 1;
    startPart(s.chapterIndex, s.partIndex, generation);
  },

  later() {
    const s = get();
    if (s.moment !== 'locked' || s.unlocking) return;
    stopBeatVoice();
    get().nextStation();
  },

  nextStation() {
    const s = get();
    const journey = journeyOf(s.journeyId);
    if (!journey) return;
    if (s.chapterIndex >= journey.chapters.length - 1) finishJourney();
    else travelTo(s.chapterIndex + 1);
  },

  finish() {
    if (get().stage !== 'ending') return;
    finishJourney();
  },

  async unlock() {
    const s = get();
    if (s.moment !== 'locked' || s.unlocking || !s.momentId || !s.journeyId || !s.counselorId || !s.tone) return;
    const { journeyId, counselorId, tone, lang, momentId: id, chapterIndex: ci, partIndex: pi } = s;
    const chapter = chapterAt(ci);
    if (!chapter) return;
    const gen = generation;
    set({ unlocking: true, unlockError: null });
    const result = await unlockMoment({ journeyId, momentId: id, tone, lang });
    if (!result.ok) {
      // Nothing was charged and nothing is recorded: the moment stays locked. From the quarter
      // list the lock was only ever the tap's; the list stays up.
      if (result.reason === 'insufficient' && result.coinBalance != null) useCoins.getState().setBalance(result.coinBalance);
      if (get().momentId === id) {
        set({ unlocking: false, unlockError: result.reason, ...(get().stage === 'quarters' ? { moment: '', momentId: null } : {}) });
      }
      return;
    }
    // The part is in the content from now on — even if the player has moved on meanwhile.
    const now = get();
    if (now.journeyId === journeyId && now.counselorId === counselorId && now.content) {
      set({ content: withPart(now.content, chapter.id, result.part, result.summary) });
    }
    useSavedJourneys.getState().addUnlock(journeyId, counselorId, chapter.id, result.part, result.summary);
    if (result.coinBalance != null) useCoins.getState().setBalance(result.coinBalance);
    set({ unlocking: false });
    urls.delete(clipKey(ci, pi));
    if (gen !== generation || get().momentId !== id || get().moment !== 'locked') return;
    // locked → premium at once: that change IS the cabin's unlock burst. The part's voice follows.
    stopBeatVoice();
    set({ moment: 'premium', teaserSpeaking: false, voice: null });
    generation += 1;
    const g = generation;
    const cue = momentPresentation(journeyId, id).cue ?? 'stars';
    clearCueTimer();
    cueTimer = setTimeout(() => {
      cueTimer = null;
      if (g === generation) fireCue(cue);
    }, CUE_AFTER_UNLOCK_MS);
    // A topic's first paid part opens on its card (mockup panel 15) before the voice goes on; the
    // card is then not raised a second time from the narration.
    const card = result.part.cards[0];
    if (chapter.interaction !== 'quarters' && id.endsWith('#0') && card) {
      set(st => ({
        stage: 'reveal', reveal: card, status: 'paused',
        shownCards: [...st.shownCards, cardKey(chapter.id, pi, 0)],
      }));
      return;
    }
    await startPart(ci, pi, g);
  },

  stop() {
    generation += 1;
    stopPoll();
    if (transitionTimer) clearTimeout(transitionTimer);
    clearCueTimer();
    releaseVoice();
    stopLayers();
    urls.clear();
    set({
      journeyId: null,
      counselorId: null,
      tone: null,
      content: null,
      chapterIndex: 0,
      partIndex: 0,
      queue: [],
      stage: '',
      pickedCard: null,
      reveal: null,
      status: 'idle',
      position: 0,
      duration: 0,
      transitionTo: null,
      activeCard: null,
      shownCards: [],
      error: null,
      voice: null,
      moment: '',
      momentId: null,
      unlocking: false,
      unlockError: null,
      teaserSpeaking: false,
      // cue/cueSeq are kept: the sequence must never go back.
    });
  },

  openSaved(saved) {
    get().stop();
    generation += 1;
    const journey = journeyOf(saved.journeyId);
    if (!journey) return;
    set({
      journeyId: saved.journeyId,
      counselorId: saved.counselorId,
      tone: saved.tone,
      lang: saved.lang,
      content: saved.content,
      chapterIndex: Math.max(0, journey.chapters.length - 1),
      partIndex: 0,
      status: 'done',
      position: 0,
      duration: 0,
      transitionTo: null,
      activeCard: null,
      shownCards: [],
      error: null,
    });
  },

  replay(index = 0) {
    const s = get();
    if (!s.journeyId || !s.content) return;
    set({ shownCards: [], activeCard: null });
    startLayers(journeyOf(s.journeyId)!);
    travelTo(index);
  },
}));

/** The paid-moment part of the cabin's JOURNEY_STATE. A locked moment brings the camera in close
 *  on the counsellor's offer; the premium segment sits back to the table's built view; otherwise
 *  the camera is the player's. */
export function cabinMomentOf(
  s: Pick<JourneyState, 'moment' | 'cue' | 'cueSeq'>,
): Required<Pick<JourneyStatePayload, 'moment' | 'cue' | 'cueSeq' | 'shot'>> {
  return {
    moment: s.moment,
    cue: s.cue,
    cueSeq: s.cueSeq,
    // 'wide' (the start framing) between moments, never '': Unity keeps the camera on '' and the
    // close-up of the last lock stayed on through the next stations (sim QA 01-10). Unity applies a
    // shot only when it CHANGES, so the player's own pinch still holds within a stretch.
    shot: s.moment === 'locked' ? 'close' : s.moment === 'premium' ? 'built' : 'wide',
  };
}

/** True while a journey is under way (the mini player's condition). */
export const journeyActive = (s: JourneyState) =>
  s.status === 'playing' || s.status === 'paused' || s.status === 'transition' || s.status === 'boarding' || s.status === 'platform';
