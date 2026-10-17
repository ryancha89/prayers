import { devlog } from '../../shared/devlog';
import { bundledSoundBase, bundledSoundPath } from '../../shared/audio/bundledSound';

/**
 * Plays one recorded lecture line (a bundled m4a) at a time.
 *
 * One line = one file, so a subtitle is exactly what is being said, and skipping a line or a whole
 * chapter is just stopping this one and starting another. Every start bumps `generation`; a load or
 * an end that belongs to an older line is ignored — without it, a line skipped while still loading
 * would start talking over the next one, and its "ended" would advance the lecture twice.
 */
let SoundModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

let sound: any = null;
let generation = 0;
let paused = false;
/** Playback rate for every line. Applied AFTER play() starts: on Android, setting a MediaPlayer's
 *  playback params on a paused player starts it, which would un-pause a paused lecture. */
let rate = 1;

function applyRate(s: any) {
  s?.setSpeed?.(rate);
}

/** Change the speed — the line playing now too. */
export function setLineSpeed(next: number): void {
  rate = next;
  if (sound && !paused) applyRate(sound);
}

function release() {
  if (sound) {
    sound.stop?.();
    sound.release?.();
  }
  sound = null;
}

/** Start `file` from the top. `onEnd` is called once when it plays out (not when it is stopped);
 *  `onFail` when the file cannot be loaded — the lecture then stops there rather than skipping
 *  every silent line to the end (and marking a chapter heard that nobody heard). */
export function playLine(file: string, onEnd: () => void, onFail?: () => void): void {
  const mine = ++generation;
  release();
  paused = false;
  if (!SoundModule) {
    // No native player (tests, a build without the module): a line still "ends", so the lecture
    // still moves on at reading pace.
    setTimeout(() => mine === generation && onEnd(), 1500);
    return;
  }
  const s = new SoundModule(bundledSoundPath(file), bundledSoundBase(SoundModule), (err: unknown) => {
    if (mine !== generation) {
      s.release?.();
      return;
    }
    if (err) {
      devlog(`[lecture] ${file} did not load`);
      onFail?.();
      return;
    }
    sound = s;
    if (paused) return;
    s.play?.((ok: boolean) => {
      if (mine !== generation || paused) return;
      if (!ok) devlog(`[lecture] ${file} did not finish cleanly`);
      onEnd();
    });
    applyRate(s);
  });
}

export function pauseLine(): void {
  paused = true;
  sound?.pause?.();
}

/** Carry on from where pause stopped; `onEnd` as for playLine. */
export function resumeLine(onEnd: () => void): void {
  const mine = generation;
  paused = false;
  sound?.play?.((ok: boolean) => {
    if (mine !== generation || paused) return;
    if (!ok) devlog('[lecture] resumed line did not finish cleanly');
    onEnd();
  });
  applyRate(sound);
}

export function stopLine(): void {
  generation += 1;
  paused = false;
  release();
}
