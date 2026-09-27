import type { Lang } from '../../shared/i18n';
import { devlog } from '../../shared/devlog';
import { bundledSoundBase, bundledSoundPath } from '../../shared/audio/bundledSound';
import { backgroundMusic } from '../../shared/audio/backgroundMusic';

/**
 * The spoken guide for a meditation session, where a language has one.
 *
 * 15-09 decided "no guided voice": text and music pace the breath. On 26-09 guides were recorded
 * for English (3:50), Japanese (6:34) and Chinese (1:07); those languages have one, and every other
 * language keeps the silent session it had — a missing row here IS the decision for that language,
 * not a gap to paper over with a recording in someone else's language.
 *
 * All three are levelled to -18 LUFS (the Chinese recording came in 9 dB quieter and vanished under
 * the bed). It plays ONCE from Begin, over the start of the ten minutes; the breath carries on
 * without it after that. The bed is ducked while it talks and comes back up when it ends.
 *
 * Not governed by the music or interface-sound switches: it is the session's content, the way the
 * counselor's voice is the consultation's.
 */
export const GUIDES: Partial<Record<Lang, string>> = {
  en: 'meditation_guide_en.m4a',
  ja: 'meditation_guide_ja.m4a',
  // One Mandarin recording for both scripts: what is SPOKEN does not change between them.
  'zh-CN': 'meditation_guide_zh.m4a',
  'zh-TW': 'meditation_guide_zh.m4a',
};

let SoundModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

let sound: any = null;
let file: string | null = null;
/** Paused mid-guide — the next play() resumes rather than restarts. */
let held = false;
/** The guide has played to its end this session; Carry on must not start it again. */
let finished = false;
/** Bumped by stop(): a load that lands after the session was left must not start talking. */
let generation = 0;
/** What the session wants right now. A Pause pressed while the file is still loading must win
 *  over the load finishing a moment later. */
let wanted = false;

function playFromCurrent() {
  if (!sound) return;
  held = false;
  backgroundMusic.duck(true);
  sound.play?.((ok: boolean) => {
    // Called at the natural end AND when the native player gives up — both mean "not talking now".
    if (held) return; // paused, not ended
    finished = true;
    backgroundMusic.duck(false);
    if (!ok) devlog('[guide] playback did not finish cleanly');
    else devlog('[guide] finished');
  });
}

/**
 * Begin (from the top) or Carry on (from where it paused). A language with no guide, or a guide
 * that has already finished this session, does nothing.
 */
export function play(lang: Lang) {
  const wantFile = GUIDES[lang] ?? null;
  if (!SoundModule || !wantFile || finished) return;
  wanted = true;

  if (file === wantFile) {
    // Loaded: carry on. Still loading: the load will start it.
    if (sound) playFromCurrent();
    return;
  }

  // A different language than the one loaded (or nothing loaded yet): start over with this one.
  release();
  file = wantFile;
  const gen = generation;
  // The load callback may fire before `new` returns (a cached file, a test double), so it only
  // records the outcome; `settle` acts once both the player and the outcome exist.
  let s: any = null;
  let outcome: { error: unknown } | null = null;
  const settle = () => {
    if (!s || !outcome) return;
    if (gen !== generation) {
      s.release?.();
      return;
    }
    if (outcome.error) {
      // The file is missing from the bundle — `npx react-native-asset` not re-run after adding it.
      // eslint-disable-next-line no-console
      console.warn('[guide] could not load', wantFile, outcome.error);
      file = null;
      return;
    }
    sound = s;
    devlog(`[guide] loaded ${wantFile}`);
    if (wanted) playFromCurrent();
    else held = true; // paused before it ever spoke — the next play() starts it from the top
  };
  s = new SoundModule(bundledSoundPath(wantFile), bundledSoundBase(SoundModule), (error: unknown) => {
    outcome = { error };
    settle();
  });
  settle();
}

/** Hold the place. The session was paused (button, or the tab left). */
export function pause() {
  wanted = false;
  if (!sound || finished) return;
  held = true;
  sound.pause?.();
  backgroundMusic.duck(false);
}

/** The session is over or left: silence, and the next Begin starts the guide from the top. */
export function stop() {
  wanted = false;
  generation += 1;
  release();
  finished = false;
  backgroundMusic.duck(false);
}

function release() {
  held = false;
  sound?.stop?.();
  sound?.release?.();
  sound = null;
  file = null;
}

export const guideVoice = { play, pause, stop };
