import { devlog } from '../../../shared/devlog';

/**
 * Journey narration kept ON THE PHONE once heard, so riding a saved journey again plays the same
 * voice instantly and offline instead of asking the server for every line again.
 *
 * Keyed by the line itself (text + voice preset + language): the same words in the same voice are
 * the same clip. The first play still streams the server's URL; the file is downloaded alongside
 * and its meta (duration, mouth envelope) written only after the download succeeded, so a cache
 * entry is either whole or absent. Lives in Documents/journey_voice — survives restarts, and is
 * removed with everything else on sign-out (forgetLocalData sweeps it).
 */
interface FsModule {
  DocumentDirectoryPath: string;
  mkdir(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  readFile(path: string, encoding: string): Promise<string>;
  writeFile(path: string, contents: string, encoding: string): Promise<void>;
  unlink(path: string): Promise<void>;
  downloadFile(o: { fromUrl: string; toFile: string }): { promise: Promise<{ statusCode: number }> };
}

function fs(): FsModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@dr.pogodin/react-native-fs');
    const m = mod?.default ?? mod;
    return typeof m?.downloadFile === 'function' && typeof m?.DocumentDirectoryPath === 'string' ? (m as FsModule) : null;
  } catch {
    return null;
  }
}

export interface CachedClip {
  url: string;
  duration: number;
  envelope: { fps: number; levels: number[] } | null;
}

const dir = (f: FsModule) => `${f.DocumentDirectoryPath}/journey_voice`;

/** FNV-1a, two lanes — a short stable file name for a line; collisions are not a realistic risk. */
export function voiceKey(text: string, preset: string, lang: string): string {
  const s = `${lang}|${preset}|${text}`;
  let a = 0x811c9dc5;
  let b = 0x01000193 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return a.toString(16).padStart(8, '0') + b.toString(16).padStart(8, '0');
}

export async function cachedVoice(key: string): Promise<CachedClip | null> {
  const f = fs();
  if (!f) return null;
  try {
    const meta = `${dir(f)}/${key}.json`;
    const wav = `${dir(f)}/${key}.wav`;
    if (!(await f.exists(meta)) || !(await f.exists(wav))) return null;
    const m = JSON.parse(await f.readFile(meta, 'utf8'));
    return { url: wav, duration: Number(m?.duration ?? 0), envelope: m?.envelope ?? null };
  } catch {
    return null;
  }
}

/** Fire and forget: download the clip next to its meta. A failure just means the next ride streams. */
export async function storeVoice(key: string, clip: CachedClip): Promise<void> {
  const f = fs();
  if (!f || !/^https?:\/\//.test(clip.url)) return;
  const wav = `${dir(f)}/${key}.wav`;
  try {
    await f.mkdir(dir(f));
    const res = await f.downloadFile({ fromUrl: clip.url, toFile: wav }).promise;
    if (res.statusCode < 200 || res.statusCode >= 300) {
      await f.unlink(wav).catch(() => {});
      return;
    }
    await f.writeFile(`${dir(f)}/${key}.json`, JSON.stringify({ duration: clip.duration, envelope: clip.envelope }), 'utf8');
  } catch (e) {
    devlog(`[journey] voice not kept: ${String(e)}`);
  }
}

/** Sign-out / account deletion: the voices say the player's name and year. */
export async function forgetJourneyVoices(): Promise<void> {
  const f = fs();
  if (!f) return;
  try {
    if (await f.exists(dir(f))) await f.unlink(dir(f));
  } catch {
    // nothing to do
  }
}
