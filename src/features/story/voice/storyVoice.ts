import type { Lang } from '../../../shared/i18n';
import { devlog } from '../../../shared/devlog';
import { narrationUrl, type NarrationClip } from '../../journey/api/journeyApi';

/**
 * Cheese's spoken voice: the server's TTS (preset `cheese` — Gemini Algenib, low and dry) through
 * the same stored-clip route as the journey narration (`prayers/tts/url`, cached on the phone).
 * Best effort: no module, no network or a refused line means the line is simply read, not heard.
 *
 * `speak` resolves when the line has finished (or was stopped); `level()` is the clip's loudness
 * right now, 0..1, from the envelope the server measured — what the cat's mouth follows.
 */
let SoundModule: any = null;
try {
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

export const VOICE_PRESET = 'cheese';

let current: { sound: any; clip: NarrationClip; startedAt: number } | null = null;
let generation = 0;
const pending = new Map<string, Promise<NarrationClip | null>>();

function clipFor(text: string, lang: Lang) {
  const k = `${lang}|${text}`;
  if (!pending.has(k)) pending.set(k, narrationUrl(text, VOICE_PRESET, lang));
  return pending.get(k)!;
}

/** Start synthesising a line now so it is ready when it is shown. */
export function warm(text: string, lang: Lang): void {
  if (SoundModule && text.trim()) void clipFor(text, lang);
}

export function stop(): void {
  generation++;
  if (current) {
    try {
      current.sound.stop?.();
      current.sound.release?.();
    } catch {
      // already gone
    }
  }
  current = null;
}

export async function speak(text: string, lang: Lang, onStart?: () => void): Promise<boolean> {
  stop();
  const gen = generation;
  if (!SoundModule || !text.trim()) return false;
  const clip = await clipFor(text, lang);
  if (!clip || gen !== generation) return false;
  const sound: any = await new Promise(resolve => {
    const s = new SoundModule(clip.url, '', (err: unknown) => resolve(err ? null : s));
  });
  if (!sound || gen !== generation) {
    sound?.release?.();
    return false;
  }
  current = { sound, clip, startedAt: Date.now() };
  onStart?.();
  return new Promise(resolve => {
    sound.play((ok: boolean) => {
      if (!ok) devlog('[story] voice playback failed');
      if (current?.sound === sound) {
        sound.release?.();
        current = null;
      }
      resolve(ok);
    });
  });
}

/** 0..1 loudness of the line being spoken; 0 when silent or unknown. */
export function level(): number {
  if (!current?.clip.envelope) return current ? 0.5 : 0;
  const { fps, levels } = current.clip.envelope;
  const i = Math.floor(((Date.now() - current.startedAt) / 1000) * fps);
  return i >= 0 && i < levels.length ? Math.min(1, levels[i] / 60) : 0;
}

export function speaking(): boolean {
  return current != null;
}
