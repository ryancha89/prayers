import { sfxEnabled } from './store';

/**
 * The taps.
 *
 * The app had exactly two sounds — the splash chime and the ambient bed — so every press in every
 * screen was silent: counselor cards, tabs, the topic picker, send. This is the other half of the
 * feel, and it is the half you notice by its absence rather than its presence.
 *
 * Loaded once and REUSED. `new Sound()` per press costs a file open on the UI thread and, worse,
 * arrives late: the sound of a tap has to be inside ~50 ms of the finger or it reads as a glitch
 * rather than as feedback. Preloaded instances play immediately, and `setCurrentTime(0)` lets one
 * instance retrigger on a fast double-tap instead of swallowing the second press.
 *
 * The native module is optional exactly as the music treats it: a build without RNSound linked
 * loses the sound, not the app.
 */
let SoundModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

/** Bundled natively via react-native.config.js `assets` + react-native-asset. */
export type Cue = 'tap' | 'select' | 'back' | 'send';

const FILES: Record<Cue, string> = {
  tap: 'ui_tap.m4a',
  select: 'ui_select.m4a',
  back: 'ui_back.m4a',
  send: 'ui_send.m4a',
};

/** Under the music, not over it: these are punctuation, not events. `ui_send` is the one that may
 *  be felt as an event, and it is louder in the file rather than louder here. */
const VOLUME = 0.5;

const loaded = new Map<Cue, any>();
let warned = false;

function instance(cue: Cue): any | null {
  if (!SoundModule) return null;
  const existing = loaded.get(cue);
  if (existing) return existing;

  // MAIN_BUNDLE, like the splash and the bed. Failure is silent by design — a missing tick must
  // never be the reason a screen does not respond.
  const sound = new SoundModule(FILES[cue], SoundModule.MAIN_BUNDLE, (err: unknown) => {
    if (err) {
      loaded.delete(cue);
      if (__DEV__ && !warned) {
        warned = true;
        console.warn(`[sfx] ${FILES[cue]} did not load — run npx react-native-asset after adding it.`);
      }
      return;
    }
    sound.setVolume(VOLUME);
  });
  loaded.set(cue, sound);
  return sound;
}

export function play(cue: Cue) {
  if (!sfxEnabled()) return;
  const sound = instance(cue);
  if (!sound) return;
  try {
    // Rewind first: a press while the last one is still ringing should sound twice, not once.
    sound.stop(() => {
      sound.setCurrentTime(0);
      sound.play();
    });
  } catch {
    // Never let a sound break a press.
  }
}

export const sfx = {
  tap: () => play('tap'),
  select: () => play('select'),
  back: () => play('back'),
  send: () => play('send'),
};

/** Free the preloaded instances. Called when the app goes away, like the music player does. */
export function release() {
  loaded.forEach(s => {
    try {
      s.release();
    } catch {
      /* nothing to do */
    }
  });
  loaded.clear();
}
