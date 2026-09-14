/**
 * The app's own background music — everywhere OUTSIDE the consultation room.
 *
 * Until now the app was silent apart from the splash chime: the only audio in the product came
 * from embedded Unity, and only while the room was on screen. So the player heard a bell at
 * launch, nothing at all while choosing a counselor, and then a full soundtrack the moment they
 * sat down. This fills the first half of that.
 *
 * WHO OWNS THE SPEAKER
 * Exactly one side at a time, and the route decides — the same rule App.tsx already applies to
 * Unity's audio (`enforceUnitySilence`). On a Unity screen the engine owns the mix, so this stops;
 * anywhere else Unity is silenced and this plays. Two music beds crossing each other is worse than
 * either alone, and on iOS they would not even duck each other.
 *
 * The native module is optional on purpose, exactly as the splash treats it: a build without
 * RNSound linked must lose the music, not the app.
 */
import { AppState, AppStateStatus } from 'react-native';
import { musicEnabled, useSoundStore } from './store';
import { bundledSoundPath, bundledSoundBase } from './bundledSound';

let SoundModule: any = null;
try {
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

/** Bundled natively via react-native.config.js `assets` + react-native-asset, like the splash cue. */
const TRACK_FILE = 'prayers_ambient.m4a';

/**
 * Under the interface, not over it. The splash chime is an event and can be heard; this is a room
 * tone and should be the thing you notice only when it stops.
 */
const TARGET_VOLUME = 0.35;

const FADE_MS = 800;
const FADE_STEP_MS = 50;

let sound: any = null;
let loading = false;
let wanted = false; // what the app has asked for, independent of load state
let fadeTimer: ReturnType<typeof setInterval> | null = null;
let appStateSub: { remove: () => void } | null = null;
let backgrounded = false;

const clearFade = () => {
  if (fadeTimer) {
    clearInterval(fadeTimer);
    fadeTimer = null;
  }
};

/** Ramp the volume, then run `done`. Instant when the module has no volume control. */
const fadeTo = (target: number, done?: () => void) => {
  clearFade();
  if (!sound || typeof sound.setVolume !== 'function') {
    done?.();
    return;
  }
  const from = typeof sound.getVolume === 'function' ? sound.getVolume() : wanted ? 0 : TARGET_VOLUME;
  const steps = Math.max(1, Math.round(FADE_MS / FADE_STEP_MS));
  let i = 0;
  fadeTimer = setInterval(() => {
    i += 1;
    const v = from + (target - from) * (i / steps);
    try {
      sound.setVolume(Math.max(0, Math.min(1, v)));
    } catch {
      // A released sound throws here; stop rather than spin.
      clearFade();
      return;
    }
    if (i >= steps) {
      clearFade();
      done?.();
    }
  }, FADE_STEP_MS);
};

const ensureLoaded = (then: () => void) => {
  if (sound || loading || !SoundModule) {
    if (sound) then();
    return;
  }
  loading = true;
  try {
    // Ambient: mixes with other apps and OBEYS THE SILENT SWITCH. Background music the player
    // cannot mute with the hardware switch is the kind of thing that gets an app deleted.
    SoundModule.setCategory?.('Ambient');
    const s: any = new SoundModule(
      bundledSoundPath(TRACK_FILE),
      bundledSoundBase(SoundModule),
      (error: unknown) => {
      loading = false;
      if (error) {
        // Not a crash and not a retry loop: the track is missing from the bundle (react-native-asset
        // not re-run after adding it, most likely) and the app is simply quiet.
        // eslint-disable-next-line no-console
        console.warn('[bgm] could not load', TRACK_FILE, error);
        sound = null;
        return;
      }
      sound = s;
      sound.setNumberOfLoops?.(-1);
      sound.setVolume?.(0);
      then();
    });
  } catch (e) {
    loading = false;
    sound = null;
    // eslint-disable-next-line no-console
    console.warn('[bgm] sound module unavailable', e);
  }
};

/** Stop without the fade — for a switch, where a slow fade reads as "it did not work". */
const stopNow = () => {
  clearFade();
  sound?.stop?.();
};

const onAppState = (next: AppStateStatus) => {
  if (next === 'active') {
    backgrounded = false;
    if (wanted) start();
  } else {
    backgrounded = true;
    // Stop rather than pause: a music bed does not need to resume mid-phrase, and a paused
    // AudioSession still holds the category.
    clearFade();
    sound?.stop?.();
  }
};

/**
 * Start (or keep) the background music. Idempotent — calling it on every navigation change is the
 * intended use, and a track already playing is left alone rather than restarted.
 */
export const start = () => {
  wanted = true;
  if (backgrounded) return;
  // The player's own switch. Checked here rather than at every call site, so a route change, an
  // app resume and the toggle itself all go through one door.
  if (!musicEnabled()) {
    stopNow();
    return;
  }
  if (!appStateSub) appStateSub = AppState.addEventListener('change', onAppState);

  ensureLoaded(() => {
    if (!wanted || !sound) return;
    if (sound.isPlaying?.()) {
      fadeTo(TARGET_VOLUME);
      return;
    }
    sound.setVolume?.(0);
    sound.play?.((ok: boolean) => {
      if (!ok) {
        // eslint-disable-next-line no-console
        console.warn('[bgm] playback failed');
      }
    });
    fadeTo(TARGET_VOLUME);
  });
};

/** Fade out and stop. Safe before the track has loaded, and safe to call repeatedly. */
export const stop = () => {
  wanted = false;
  if (!sound) return;
  fadeTo(0, () => {
    if (wanted) return; // asked for again mid-fade — leave it playing
    sound?.stop?.();
  });
};

/** Free the native player. For a full teardown; ordinary navigation should use stop(). */
export const release = () => {
  wanted = false;
  clearFade();
  appStateSub?.remove();
  appStateSub = null;
  sound?.release?.();
  sound = null;
};

/**
 * React to the setting being changed while the app is open.
 *
 * Subscribing here rather than in a component: the music has no UI of its own, and a screen that
 * happens to be mounted is the wrong owner of a bed that plays across all of them. `wanted` is
 * what the ROUTE asked for, so turning the switch back on inside the consultation room correctly
 * does nothing until the player leaves it.
 */
useSoundStore.subscribe((state, prev) => {
  if (state.musicEnabled === prev.musicEnabled) return;
  if (!state.musicEnabled) stopNow();
  else if (wanted) start();
});

export const backgroundMusic = { start, stop, release };
