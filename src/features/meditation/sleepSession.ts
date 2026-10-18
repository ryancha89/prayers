import type { Lang } from '../../shared/i18n';
import { MeditationSession, realClock, type Clock } from './session';
import { sleepAudio as defaultAudio, type SleepAudio, type SleepTrack } from './sleepAudio';

/**
 * A sleep session, without a screen: the voice guide and the music bed start together, the music
 * carries on alone when the voice ends, and everything stops at 30:00. Nothing plays after that until
 * the player presses Replay, which starts both again from the top.
 *
 * Same shape as the meditation session (session.ts) and for the same reason: a pure state machine
 * with an injectable clock, so thirty minutes can be walked in a millisecond of fake time. The
 * elapsed-time bookkeeping IS the meditation session's — `MeditationSession` owns nothing but
 * elapsed time with pause-keeps-the-elapsed semantics, which is exactly what this needs too.
 *
 * WHEN IT ENDS
 * The bed is the session: the file is exactly 30:00 and fades out over its last 20 s. So the end is
 * the bed's own end callback, with the clock at SLEEP_MS as the guard — a bed that failed to load, or
 * an end callback lost while the app was suspended, still ends the session on time. Whichever comes
 * first wins; the other finds the session already done.
 */
export const SLEEP_MS = 30 * 60 * 1000;

export const SLEEP_BED = 'sleep_bed.m4a';

/** Only Korean and English were recorded; every other language hears the English guide. */
export const SLEEP_VOICES = { ko: 'sleep_voice_ko.m4a', en: 'sleep_voice_en.m4a' } as const;
export type SleepVoice = keyof typeof SLEEP_VOICES;

export const sleepVoiceFor = (lang: Lang | string): SleepVoice => (lang === 'ko' ? 'ko' : 'en');

export type SleepStatus = 'idle' | 'loading' | 'running' | 'paused' | 'done' | 'unavailable';

export interface SleepState {
  status: SleepStatus;
  elapsedMs: number;
  /** Rounded UP, so the clock never reads 0:00 with time still to run. */
  remainingSeconds: number;
  /** The voice has reached its end; only the music is left. */
  voiceDone: boolean;
  /** Which recording this session speaks. */
  voice: SleepVoice;
}

export class SleepSession {
  private timer: MeditationSession;
  private audio: SleepAudio;
  private status: SleepStatus = 'idle';
  private voice: SleepVoice = 'en';
  private voiceDone = false;
  /** Bumped by every start and stop, so a load that lands after the player left does nothing. */
  private generation = 0;
  private listeners = new Set<(s: SleepState) => void>();

  constructor(clock: Clock = realClock, audio: SleepAudio = defaultAudio) {
    this.timer = new MeditationSession(clock);
    this.audio = audio;
  }

  /** Called on every change the screen did not cause itself (a load landing, a track ending). */
  subscribe(fn: (s: SleepState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    const s = this.read();
    this.listeners.forEach(fn => fn(s));
  }

  /** From the top: both tracks from 0. Also what Replay does. */
  start(lang: Lang | string): void {
    this.audio.stop();
    this.timer.reset();
    this.generation += 1;
    const gen = this.generation;
    this.voice = sleepVoiceFor(lang);
    this.voiceDone = false;
    this.status = 'loading';
    this.audio.start(
      { bed: SLEEP_BED, voice: SLEEP_VOICES[this.voice] },
      ok => {
        if (gen !== this.generation) return;
        if (!ok) {
          this.status = 'unavailable';
          this.emit();
          return;
        }
        // The clock starts when the sound does, not when the button was pressed: the two must
        // agree on what 30:00 means.
        this.timer.start();
        this.status = 'running';
        this.emit();
      },
      (track: SleepTrack) => {
        if (gen !== this.generation) return;
        if (track === 'voice') {
          this.voiceDone = true;
          this.emit();
        } else {
          this.finish();
        }
      },
    );
  }

  replay(lang: Lang | string): void {
    this.start(lang);
  }

  pause(): void {
    if (this.status !== 'running') return;
    this.timer.pause();
    this.audio.pause();
    this.status = 'paused';
  }

  resume(): void {
    if (this.status !== 'paused') return;
    this.timer.start();
    this.audio.resume();
    this.status = 'running';
  }

  /** The player left. Silence, and the next start is from the top. */
  stop(): void {
    this.generation += 1;
    this.audio.stop();
    this.timer.reset();
    this.status = 'idle';
    this.voiceDone = false;
  }

  /** The clock guard. The screen calls this on its tick and when the app comes back to the front. */
  tick(): SleepState {
    if (this.status === 'running' && this.timer.elapsed() >= SLEEP_MS) this.finish();
    return this.read();
  }

  private finish() {
    if (this.status === 'done') return;
    this.generation += 1;
    this.timer.pause();
    this.audio.stop();
    this.status = 'done';
    this.emit();
  }

  read(): SleepState {
    const elapsedMs = this.status === 'done' ? SLEEP_MS : Math.min(SLEEP_MS, this.timer.elapsed());
    return {
      status: this.status,
      elapsedMs,
      remainingSeconds: Math.ceil((SLEEP_MS - elapsedMs) / 1000),
      voiceDone: this.voiceDone,
      voice: this.voice,
    };
  }
}
