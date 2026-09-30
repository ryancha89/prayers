import { create } from 'zustand';
import type { Lang } from '../../../shared/i18n';
import { devlog } from '../../../shared/devlog';
import { bundledSoundBase, bundledSoundPath } from '../../../shared/audio/bundledSound';
import { fetchJourneyContent, journeyBirthOf, narrationUrl, type JourneyContentError, type NarrationClip } from '../api/journeyApi';
import { beatVoiceSettled } from './beatVoice';
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { JOURNEYS } from '../data/journeys';
import type { FortuneCard, Journey, JourneyContent } from '../types';

/**
 * The Journey player — one for the whole app, so a journey keeps going when the player leaves the
 * screen (the mini player drives the same instance from anywhere).
 *
 * Three audio layers, as asked: VOICE (the counsellor's narration, streamed from the server's
 * stored TTS clip), BGM and AMBIENT (bundled loops named in the journey data; null = silence).
 * Only voice drives the clock: position, cards and "the chapter is over" all come from it.
 *
 * A chapter ends → a station transition (the train runs, arrives, the view changes) → the next
 * chapter's narration. The next chapter's audio is synthesised and loaded DURING the transition and
 * the one before it, so a station never waits on the server.
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

export interface ActiveCard extends FortuneCard {
  key: string;
  chapterId: string;
  /** How long the card stays up. Shorter when a chapter has many cards (the terminus names all
   *  twelve months), so each one is gone before the voice reaches the next. */
  holdMs?: number;
}

const CARD_HOLD_MS = 6500;

interface JourneyState {
  journeyId: string | null;
  counselorId: string | null;
  tone: string | null;
  lang: Lang;
  content: JourneyContent | null;
  chapterIndex: number;
  status: JourneyStatus;
  /** Seconds into the current chapter's narration. */
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

  /** `platform`: wait on the station platform once loaded instead of starting the reading. */
  board(journeyId: string, counselorId: string, tone: string, lang: Lang, opts?: { platform?: boolean }): Promise<void>;
  /** From the platform: start the reading (the player is seated, or the cabin never answered). */
  depart(): void;
  play(): void;
  pause(): void;
  toggle(): void;
  seekBy(seconds: number): void;
  next(): void;
  prev(): void;
  goTo(index: number): void;
  dismissCard(): void;
  /** Leave the journey entirely: silence, and the mini player goes away. */
  stop(): void;
  /** Replay from the first station with the same content and counsellor. */
  replay(): void;
  /** Open a saved journey at its terminus (no audio): the result screen shows it, `replay` rides again. */
  openSaved(saved: { journeyId: string; counselorId: string; tone: string; lang: Lang; content: JourneyContent }): void;
}

/** How long the train takes between stations. The transition component is timed to this. */
export const TRANSITION_MS = 2800;
/** Reading speed for a chapter whose audio could not be had: the text still paces itself. */
const SILENT_CHARS_PER_SECOND = 7;

// ── Engine state outside the store (native handles, timers) ─────────────────────────────────

let voice: any = null;
let voiceIsSilent = false;
let silentStart = 0;
let silentOffset = 0;
let poll: ReturnType<typeof setInterval> | null = null;
let transitionTimer: ReturnType<typeof setTimeout> | null = null;
/** Bumped on every chapter change and stop: a load that lands late must not start talking. */
let generation = 0;
const urls = new Map<number, Promise<NarrationClip | null>>();

/** The voice's envelope, re-keyed from `at` seconds — on a chapter start, a seek and a resume, the
 *  three moments the cabin's mouth clock must be put back in step with the audio. */
function syncMouth(at: number) {
  const s = useJourneyPlayer.getState();
  if (!s.voice) return;
  useJourneyPlayer.setState({ voice: { ...s.voice, key: `${generation}:${s.chapterIndex}:${Date.now()}`, startAt: at } });
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

function narrationFor(content: JourneyContent | null, journey: Journey | null, index: number): string {
  const id = journey?.chapters[index]?.id;
  return content?.chapters.find(c => c.id === id)?.narration ?? '';
}

function ensureUrl(index: number) {
  const s = useJourneyPlayer.getState();
  const journey = journeyOf(s.journeyId);
  if (!journey || index < 0 || index >= journey.chapters.length || !s.tone) return null;
  if (!urls.has(index)) {
    urls.set(index, narrationUrl(narrationFor(s.content, journey, index), s.tone, s.lang));
  }
  return urls.get(index)!;
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
    if (voiceIsSilent && t >= st.duration) chapterEnded();
  };
  if (voiceIsSilent) onPosition(silentOffset + (Date.now() - silentStart) / 1000);
  else voice?.getCurrentTime?.((t: number) => onPosition(t));
}

function raiseCard(t: number) {
  const s = useJourneyPlayer.getState();
  const journey = journeyOf(s.journeyId);
  const chapterId = journey?.chapters[s.chapterIndex]?.id;
  if (!chapterId || s.activeCard || s.duration <= 0) return;
  const cards = s.content?.chapters.find(c => c.id === chapterId)?.cards ?? [];
  cards.forEach((c, i) => {
    const key = `${chapterId}#${i}`;
    if (s.shownCards.includes(key) || t < c.at * s.duration) return;
    const holdMs = Math.max(2500, Math.min(CARD_HOLD_MS, ((s.duration / (cards.length + 1)) * 0.8) * 1000));
    useJourneyPlayer.setState(st => ({
      activeCard: { ...c, saveable: true, key, chapterId, holdMs },
      shownCards: [...st.shownCards, key],
    }));
  });
}

// ── Chapters ─────────────────────────────────────────────────────────────────────────────────

async function startChapter(index: number, gen: number) {
  const s = useJourneyPlayer.getState();
  const journey = journeyOf(s.journeyId);
  if (!journey) return;
  // Warm the station after this one while this one plays.
  ensureUrl(index + 1);

  const clip = await ensureUrl(index);
  if (gen !== generation) return;
  const sound = clip ? await loadVoice(clip.url) : null;
  if (gen !== generation) {
    sound?.release?.();
    return;
  }

  // The first chapter follows the boarding storyboard: let the counsellor finish the line they are
  // saying ("Shall we explore your first stop?") instead of talking over it (QA 30-09: cut by 0.2 s).
  if (index === 0) {
    await beatVoiceSettled();
    if (gen !== generation) { sound?.release?.(); return; }
  }
  releaseVoice();
  const text = narrationFor(useJourneyPlayer.getState().content, journey, index);
  if (sound) {
    voice = sound;
    voiceIsSilent = false;
    useJourneyPlayer.setState({
      duration: sound.getDuration?.() ?? clip?.duration ?? 0,
      voice: clip?.envelope ? { key: `${gen}:${index}:0`, ...clip.envelope, startAt: 0 } : null,
    });
  } else {
    // No voice to be had — the chapter still runs, paced by its text, rather than stalling the train.
    devlog(`[journey] chapter ${index} has no audio; running silent`);
    useJourneyPlayer.setState({ voice: null });
    voiceIsSilent = true;
    silentOffset = 0;
    silentStart = Date.now();
    useJourneyPlayer.setState({ duration: Math.max(8, text.length / SILENT_CHARS_PER_SECOND) });
  }
  useJourneyPlayer.setState({ status: 'playing', position: 0, chapterIndex: index, transitionTo: null });
  voice?.play?.((ok: boolean) => {
    if (gen !== generation) return;
    if (ok) chapterEnded();
  });
  stopPoll();
  poll = setInterval(tick, 250);
}

function chapterEnded() {
  const s = useJourneyPlayer.getState();
  const journey = journeyOf(s.journeyId);
  if (!journey) return;
  stopPoll();
  if (s.chapterIndex >= journey.chapters.length - 1) {
    releaseVoice();
    stopLayers();
    useJourneyPlayer.setState({ status: 'done', position: s.duration });
    return;
  }
  travelTo(s.chapterIndex + 1);
}

/** The train runs to station `index`: the transition plays while its audio is loaded, then the
 *  chapter starts. */
function travelTo(index: number) {
  const journey = journeyOf(useJourneyPlayer.getState().journeyId);
  if (!journey || index < 0 || index >= journey.chapters.length) return;
  generation += 1;
  const gen = generation;
  stopPoll();
  releaseVoice();
  if (transitionTimer) clearTimeout(transitionTimer);
  useJourneyPlayer.setState({ status: 'transition', transitionTo: index, activeCard: null, position: 0 });
  const arrived = new Promise<void>(r => {
    transitionTimer = setTimeout(r, TRANSITION_MS);
  });
  ensureUrl(index);
  arrived.then(() => {
    if (gen === generation) startChapter(index, gen);
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
  status: 'idle',
  position: 0,
  duration: 0,
  transitionTo: null,
  activeCard: null,
  shownCards: [],
  error: null,
  voice: null,

  async board(journeyId, counselorId, tone, lang, opts) {
    get().stop();
    generation += 1;
    const gen = generation;
    set({ journeyId, counselorId, tone, lang, status: 'boarding', chapterIndex: 0, error: null });
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
    const content = result.content;
    set({ content });
    const journey = journeyOf(journeyId)!;
    startLayer('bgm', journey.audio.bgm, 0.25);
    startLayer('ambient', journey.audio.ambient, 0.35);
    ensureUrl(1);
    if (opts?.platform) {
      set({ status: 'platform' });
      return;
    }
    await startChapter(0, gen);
  },

  depart() {
    if (get().status !== 'platform') return;
    void startChapter(0, generation);
  },

  play() {
    const s = get();
    if (s.status === 'done') return get().replay();
    if (s.status !== 'paused') return;
    set({ status: 'playing' });
    pauseLayers(false);
    if (voiceIsSilent) {
      silentStart = Date.now();
    } else {
      syncMouth(s.position);
      const gen = generation;
      voice?.play?.((ok: boolean) => {
        if (gen === generation && ok) chapterEnded();
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
    if (s.status !== 'playing' && s.status !== 'paused') return;
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
    const journey = journeyOf(s.journeyId);
    if (!journey) return;
    if (s.chapterIndex >= journey.chapters.length - 1) {
      chapterEnded();
      return;
    }
    travelTo((s.transitionTo ?? s.chapterIndex) + 1);
  },

  prev() {
    const s = get();
    // Three seconds in, "previous" means "this chapter from the top" — as every player does.
    if (s.status !== 'transition' && s.position > 3) {
      get().seekBy(-s.position);
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

  stop() {
    generation += 1;
    stopPoll();
    if (transitionTimer) clearTimeout(transitionTimer);
    releaseVoice();
    stopLayers();
    urls.clear();
    set({
      journeyId: null,
      counselorId: null,
      tone: null,
      content: null,
      chapterIndex: 0,
      status: 'idle',
      position: 0,
      duration: 0,
      transitionTo: null,
      activeCard: null,
      shownCards: [],
      error: null,
      voice: null,
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
      status: 'done',
      position: 0,
      duration: 0,
      transitionTo: null,
      activeCard: null,
      shownCards: [],
      error: null,
    });
  },

  replay() {
    const s = get();
    if (!s.journeyId || !s.content) return;
    const journey = journeyOf(s.journeyId)!;
    set({ shownCards: [], activeCard: null });
    startLayer('bgm', journey.audio.bgm, 0.25);
    startLayer('ambient', journey.audio.ambient, 0.35);
    travelTo(0);
  },
}));

/** True while a journey is under way (the mini player's condition). */
export const journeyActive = (s: JourneyState) =>
  s.status === 'playing' || s.status === 'paused' || s.status === 'transition' || s.status === 'boarding' || s.status === 'platform';
