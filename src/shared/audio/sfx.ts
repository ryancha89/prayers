import { sfxEnabled } from './store';
import { devlog } from '../devlog';
import { bundledSoundPath, bundledSoundBase } from './bundledSound';

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
export type Cue = 'tap' | 'select' | 'back' | 'send' | 'bellIn' | 'bellOut';

const FILES: Record<Cue, string> = {
  tap: 'ui_tap.m4a',
  select: 'ui_select.m4a',
  back: 'ui_back.m4a',
  send: 'ui_send.m4a',
  bellIn: 'med_bell_in.m4a',
  bellOut: 'med_bell_out.m4a',
};

/**
 * The two bells are the odd pair in this module and are meant to be.
 *
 * Everything else here is punctuation — 55 ms, under the music, noticed by its absence. The bells
 * are the opposite: seconds long, listened to, and the only sound in the app a player WAITS for. A
 * ten-minute session with eyes shut has no other way of being told it has started, or ended.
 *
 * They still ride the interface-sounds switch rather than the music one. Someone who turned the
 * taps off has said they do not want the app making noises at them, and a bowl is a noise the app
 * makes; the room's music is the thing they came for and has its own switch.
 */
const LONG_CUES = new Set<Cue>(['bellIn', 'bellOut']);

/** Under the music, not over it: these are punctuation, not events. `ui_send` is the one that may
 *  be felt as an event, and it is louder in the file rather than louder here — that spread is real
 *  now; until 2026-09-14 gen_ui_sfx.py normalised all four to the same peak and threw it away.
 *
 *  0.7, not 0.5. The files peaked at -20 dBFS and this halved them again, so a press arrived at
 *  -26 dBFS while the counselor's voice played at 0 — 26 dB apart, which is the gap the user heard
 *  as "the clicks are tiny". The files are now -13..-9 dBFS and this trims 3 dB, landing a tap
 *  around -16 dBFS: audible over the ambient bed (-23 dBFS mean) without competing with speech. */
const VOLUME = 0.7;

const loaded = new Map<Cue, any>();
let warned = false;

function instance(cue: Cue): any | null {
  if (!SoundModule) return null;
  const existing = loaded.get(cue);
  if (existing) return existing;

  // MAIN_BUNDLE, like the splash and the bed. Failure is silent by design — a missing tick must
  // never be the reason a screen does not respond.
  const sound = new SoundModule(
    bundledSoundPath(FILES[cue]),
    bundledSoundBase(SoundModule),
    (err: unknown) => {
    if (err) {
      loaded.delete(cue);
      if (__DEV__ && !warned) {
        warned = true;
        console.warn(`[sfx] ${FILES[cue]} did not load — run npx react-native-asset after adding it.`);
      }
      return;
    }
    // The bells sit UNDER the room's music rather than over it: they are an invitation, and an
    // invitation does not need to be the loudest thing in the room. Same switch, different gain.
    sound.setVolume(LONG_CUES.has(cue) ? VOLUME * 0.8 : VOLUME);
  });
  loaded.set(cue, sound);
  return sound;
}

/**
 * Open all four files now, so the first press of each is not the one that loads it.
 *
 * ⚠️ It is not merely late — it is SILENT. `play()` rewinds through `Sound.stop(cb)`, and
 * react-native-sound's stop is `if (this._loaded) { … }` with no else: on a sound still loading the
 * callback never runs, so the play inside it never happens. The press that warms the cache is the
 * press that makes no sound, once per cue per launch, which reads exactly like "the taps don't
 * work". Called once at boot; `instance()` is already idempotent.
 */
export function preload() {
  (Object.keys(FILES) as Cue[]).forEach(instance);
}

/** Dev-only: one line per launch, not one per press — the taps are too frequent to log each. */
let mutedReported = false;

export function play(cue: Cue) {
  if (!sfxEnabled()) {
    if (!mutedReported) {
      mutedReported = true;
      devlog('[sfx] swallowed \'' + cue + '\' — interface sounds are off (further ones silent)');
    }
    return;
  }
  const sound = instance(cue);
  if (!sound) return;
  try {
    // Still opening (a press in the first moments after launch). Play it straight rather than
    // through stop() — see preload().
    if (typeof sound.isLoaded === 'function' && !sound.isLoaded()) {
      sound.play();
      return;
    }
    // Rewind first: a press while the last one is still ringing should sound twice, not once.
    sound.stop(() => {
      sound.setCurrentTime(0);
      // The bells are the only cues anyone waits on, and they are also the only ones nobody can
      // confirm from a screenshot — so their result goes to the sink. `play`'s callback fires with
      // false when the decode or the route failed, which is the difference between "the file is
      // missing" and "your simulator is muted".
      sound.play(
        LONG_CUES.has(cue)
          ? (ok: boolean) => devlog(`[sfx] ${cue} ${ok ? 'rang through' : 'FAILED to play'}`)
          : undefined,
      );
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
  /** Struck once as a session begins — "settle". */
  bellIn: () => play('bellIn'),
  /** Lower and longer, as it ends — a release, not another instruction. */
  bellOut: () => play('bellOut'),
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
