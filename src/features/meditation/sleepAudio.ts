import { devlog } from '../../shared/devlog';
import { bundledSoundBase, bundledSoundPath } from '../../shared/audio/bundledSound';

/**
 * The two players behind a sleep session: the music bed and the spoken guide, started together.
 *
 * WHY NOT backgroundMusic.ts
 * That module is the app's bed: it fades in and out, ducks under voices, and STOPS when the app goes
 * to the background — all right for music under an interface, all wrong here. A sleep session is
 * listened to with the phone locked on the pillow, so it needs the Playback audio-session category
 * (keeps playing with the screen off, ignores the silent switch) and the `audio` background mode in
 * Info.plist. It also needs neither fades nor ducking: both files were levelled before bundling
 * (bed −34 LUFS, voice −20 LUFS — the voice sits 14 dB over the music by construction), so they play
 * at one volume and nothing moves it during the session.
 *
 * WHY THERE IS NO LOOPING
 * The bed is exactly the session: 30:00, pre-looped offline with 8 s equal-power crossfades, faded in
 * over 6 s and out over the last 20 s. Looping at runtime is where the gaps came from in the
 * meditation room; here there is nothing to loop.
 *
 * The native module is a guarded require like every other optional one: without RNSound linked the
 * feature reports itself unavailable and the app runs on.
 */
export type SleepTrack = 'bed' | 'voice';

export interface SleepFiles {
  bed: string;
  voice: string;
}

export interface SleepAudio {
  /** Whether a sound module is linked at all. The Home card hides itself when it is not. */
  available(): boolean;
  /**
   * Load both files, then start both from 0 in the same JS turn. `onReady(ok)` once they are
   * playing (ok = at least one file loaded); `onEnd` when a track reaches its own end.
   */
  start(files: SleepFiles, onReady: (ok: boolean) => void, onEnd: (track: SleepTrack) => void): void;
  /** Hold both where they are. */
  pause(): void;
  /** Carry on. The voice is re-seeked to the bed's position, so the two cannot drift apart. */
  resume(): void;
  /** Silence and release both; a load still in flight is discarded when it lands. */
  stop(): void;
}

/** One volume for both. The levels are in the files; this only must not differ between them. */
const SLEEP_VOLUME = 1;

/** Built against an injected module so tests can drive it with a fake. */
export function createSleepAudio(SoundModule: any): SleepAudio {
  let bed: any = null;
  let voice: any = null;
  let voiceDone = false;
  let held = false;
  /** Bumped by stop() and every start(): a callback from an older session must do nothing. */
  let generation = 0;

  const release = () => {
    for (const s of [bed, voice]) {
      s?.stop?.();
      s?.release?.();
    }
    bed = null;
    voice = null;
  };

  /** Load one file. The callback may fire before `new` returns (a cached file, a test double), so
   *  it only records the outcome and `settle` acts once both the player and the outcome exist. */
  const load = (file: string, done: (s: any | null) => void) => {
    let s: any = null;
    let outcome: { error: unknown } | null = null;
    const settle = () => {
      if (!s || !outcome) return;
      if (outcome.error) {
        // Missing from the bundle — `npx react-native-asset` not re-run after adding the file.
        console.warn('[sleep] could not load', file, outcome.error);
        s.release?.();
        done(null);
        return;
      }
      done(s);
    };
    try {
      s = new SoundModule(bundledSoundPath(file), bundledSoundBase(SoundModule), (error: unknown) => {
        outcome = { error };
        settle();
      });
    } catch (e) {
      console.warn('[sleep] sound module failed', file, e);
      done(null);
      return;
    }
    settle();
  };

  const playVoice = (gen: number, onEnd: (track: SleepTrack) => void) => {
    voice?.play?.((ok: boolean) => {
      // Fired at the natural end, and when the native player gives up; a pause does not fire it.
      if (gen !== generation || held) return;
      voiceDone = true;
      if (!ok) devlog('[sleep] voice did not finish cleanly');
      onEnd('voice');
    });
  };

  const playBed = (gen: number, onEnd: (track: SleepTrack) => void) => {
    bed?.play?.((ok: boolean) => {
      if (gen !== generation || held) return;
      if (!ok) devlog('[sleep] bed did not finish cleanly');
      onEnd('bed');
    });
  };

  let endHandler: (track: SleepTrack) => void = () => {};

  return {
    available: () => !!SoundModule,

    start(files, onReady, onEnd) {
      generation += 1;
      const gen = generation;
      release();
      held = false;
      voiceDone = false;
      endHandler = onEnd;
      if (!SoundModule) {
        onReady(false);
        return;
      }
      // Playback, not the app's Ambient: keep playing with the screen locked and the app in the
      // background (needs UIBackgroundModes `audio`), and do not mix under another app's music.
      SoundModule.setCategory?.('Playback', false);

      const loaded: Partial<Record<SleepTrack, any | null>> = {};
      const both = () => {
        if (!('bed' in loaded) || !('voice' in loaded)) return;
        if (gen !== generation) {
          // Left (or replayed) while loading: these players belong to nobody.
          loaded.bed?.release?.();
          loaded.voice?.release?.();
          return;
        }
        bed = loaded.bed ?? null;
        voice = loaded.voice ?? null;
        if (!bed && !voice) {
          onReady(false);
          return;
        }
        bed?.setVolume?.(SLEEP_VOLUME);
        voice?.setVolume?.(SLEEP_VOLUME);
        // Same JS turn, bed first: the two calls reach the native side back to back.
        playBed(gen, onEnd);
        playVoice(gen, onEnd);
        devlog(`[sleep] playing ${files.bed} + ${files.voice}`);
        onReady(true);
        // No voice file: the session is music-only from the first second, and says so.
        if (!voice) {
          voiceDone = true;
          onEnd('voice');
        }
      };
      load(files.bed, s => {
        loaded.bed = s;
        both();
      });
      load(files.voice, s => {
        loaded.voice = s;
        both();
      });
    },

    pause() {
      if (held || (!bed && !voice)) return;
      held = true;
      bed?.pause?.();
      if (!voiceDone) voice?.pause?.();
      devlog('[sleep] pause (holding position)');
    },

    resume() {
      if (!held) return;
      const gen = generation;
      const go = (bedSeconds: number | null) => {
        if (gen !== generation || !held) return;
        held = false;
        if (voice && !voiceDone) {
          const length = voice.getDuration?.() ?? -1;
          if (bedSeconds != null && length > 0 && bedSeconds >= length) {
            // The bed is past where the voice ends: the guide is over, only music is left.
            voiceDone = true;
            endHandler('voice');
          } else {
            if (bedSeconds != null) voice.setCurrentTime?.(bedSeconds);
            playVoice(gen, endHandler);
          }
        }
        playBed(gen, endHandler);
        devlog('[sleep] resume');
      };
      // The bed's position is the truth; the voice follows it. No bed (failed to load): the voice
      // simply carries on from where it held.
      if (bed?.getCurrentTime) bed.getCurrentTime((seconds: number) => go(seconds));
      else go(null);
    },

    stop() {
      generation += 1;
      held = false;
      release();
      // Hand the session back to what the rest of the app uses (backgroundMusic, the splash, sfx):
      // Ambient obeys the silent switch, and the app bed must not inherit Playback.
      SoundModule?.setCategory?.('Ambient', false);
    },
  };
}

let SoundModule: any = null;
try {
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

/** The app's instance, on the real module (or none). */
export const sleepAudio: SleepAudio = createSleepAudio(SoundModule);
