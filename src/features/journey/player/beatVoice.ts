import type { Lang } from '../../../shared/i18n';
import { devlog } from '../../../shared/devlog';
import { narrationUrl, type NarrationClip } from '../api/journeyApi';

/**
 * The counsellor SPEAKS the boarding storyboard's lines (journey.beat.N: "Hello. Are you ready for the
 * journey?" … "Shall we explore your first stop?"). They were subtitles only — the player bar sat at
 * 00:00 through the whole platform and walk to the seat (30-09, "add voice for first").
 *
 * Same voice as the reading: the server's stored TTS clip for the counsellor's tone (narrationUrl),
 * fetched for every line when the journey opens.
 *
 * Lines QUEUE, they are never cut: Unity's storyboard moves on on a fixed clock, and a clip that
 * arrived late was cut by the next beat (QA 30-09: beat 2 lost 0.8 s, beat 1 fell silent). A line
 * waits for the one before it; only the newest waiting line is kept, and one that would start more
 * than MAX_LATE after its beat is dropped (logged) rather than trail the pictures. The reading's
 * first chapter waits for the last line to finish (beatVoiceSettled) instead of talking over it.
 */

let SoundModule: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

const MAX_LATE_MS = 2500;
// The first two lines (the greeting and the question) are the storyboard's reason to exist: after a
// cold start the server took ~4 s to synthesise line 1 and it was dropped (QA 30-09 16:28). They may
// be up to this late, and the line after waits for them.
const MAX_LATE_KEEP_MS = 5000;
let pendingAfter: typeof pending = null;

/** The storyboard steps that have a line (step 4, the walk, has none) — journey.beat.N. */
export const BEAT_LINES = [1, 2, 3, 5, 6, 7, 8, 9, 10];

const clips = new Map<string, Promise<NarrationClip | null>>();
let current: any = null;
let pending: { text: string; tone: string; lang: Lang; at: number; final: boolean; keep: boolean;
                onStart?: (c: NarrationClip) => void; onDone?: () => void } | null = null;
let generation = 0;
// A storyboard is running and its LAST line has not been heard yet: the reading must wait for it,
// not just for an empty queue — between line 9 ending and beat 10 arriving the queue is empty, and
// chapter 1 started in that gap and swallowed line 10 (QA 30-09 15:33).
let storyboardOpen = false;
let settledWaiters: Array<() => void> = [];

const keyOf = (text: string, tone: string, lang: Lang) => `${tone}|${lang}|${text}`;

function clipFor(text: string, tone: string, lang: Lang): Promise<NarrationClip | null> {
  const k = keyOf(text, tone, lang);
  if (!clips.has(k)) clips.set(k, narrationUrl(text, tone, lang));
  return clips.get(k)!;
}

function settle() {
  if (current || pending || storyboardOpen) return;
  const w = settledWaiters; settledWaiters = [];
  w.forEach(f => f());
}

/** Start synthesising every line now, ONE AFTER ANOTHER in storyboard order. The server synthesises
 *  on every call (no cache by text); fired together, line 1 queued behind eight others and the
 *  chapter narration and was ready ~8 s after the journey opened — 4 s after its beat, so it was
 *  dropped (QA 30-09). In order, line 1 is back in about a second. */
export function prefetchBeatLines(texts: string[], tone: string, lang: Lang): void {
  let chain: Promise<unknown> = Promise.resolve();
  for (const t of texts) {
    if (!t.trim()) continue;
    chain = chain.then(() => clipFor(t, tone, lang)).catch(() => undefined);
  }
}

/** Queue one line for the beat that just started. `onStart` gets its clip when it actually plays
 *  (for the mouth), `onDone` when it has been heard to the end. */
export function sayBeatLine(text: string, tone: string, lang: Lang,
                            onStart?: (c: NarrationClip) => void, onDone?: () => void, final = false,
                            keep = false): void {
  if (pending && !pending.keep) devlog(`[journey] beat line skipped, the next beat came first: "${pending.text}"`);
  // A `keep` line (the greeting) is never replaced by the next one: it plays, late if it must.
  if (pending?.keep) {
    if (pendingAfter) devlog(`[journey] beat line skipped, the next beat came first: "${pendingAfter.text}"`);
    pendingAfter = { text, tone, lang, at: Date.now(), final, keep, onStart, onDone };
    return;
  }
  pending = { text, tone, lang, at: Date.now(), final, keep, onStart, onDone };
  if (!current) void playNext();
}

async function playNext(): Promise<void> {
  const job = pending;
  if (!job || current) return;
  pending = pendingAfter; pendingAfter = null;
  const mine = generation;
  current = 'loading';
  const clip = await clipFor(job.text, job.tone, job.lang);
  let sound: any = null;
  if (clip && SoundModule && mine === generation) {
    sound = await new Promise(resolve => {
      const s = new SoundModule(clip.url, '', (err: unknown) => resolve(err ? null : s));
    });
  }
  if (mine !== generation) { sound?.release?.(); return; }
  const late = Date.now() - job.at;
  const tooLate = late > (job.keep ? MAX_LATE_KEEP_MS : MAX_LATE_MS);
  if (!clip || !sound || tooLate || (pending && !job.keep)) {
    devlog(!clip ? `[journey] beat line has no voice: "${job.text}"`
      : !sound ? `[journey] beat line did not load: ${clip.url}`
      : `[journey] beat line dropped (${pending ? 'a newer beat is waiting' : `${late} ms late`}): "${job.text}"`);
    sound?.release?.();
    current = null;
    if (job.final) storyboardOpen = false;
    if (pending) void playNext(); else settle();
    return;
  }
  current = sound;
  // The recording has no audio: this line is how QA knows the storyboard was voiced.
  devlog(`[journey] beat line voiced (${clip.duration.toFixed(1)} s, ${late} ms after its beat): "${job.text}"`);
  job.onStart?.(clip);
  sound.play?.(() => {
    sound.release?.();
    if (current !== sound) return;
    current = null;
    job.onDone?.();
    if (job.final) storyboardOpen = false;
    if (pending) void playNext(); else settle();
  });
}

/** No more lines for this storyboard (the reading has begun): what is queued is dropped, the line
 *  being spoken is heard to the end. */
export function dropPendingBeatLines(): void {
  pending = null;
  pendingAfter = null;
  storyboardOpen = false;
  settle();
}

/** A new storyboard starts: the reading will wait for its final line (sayBeatLine `final`). */
export function openStoryboard(): void {
  storyboardOpen = true;
}

/** No more lines for this storyboard: the reading need not wait for a final line. */
export function closeStoryboard(): void {
  storyboardOpen = false;
  settle();
}

/** Resolves when the storyboard's final line has been heard (or none is running) and nothing is
 *  playing or waiting — at most `capMs` later. */
export function beatVoiceSettled(capMs = 6000): Promise<void> {
  if (!current && !pending && !storyboardOpen) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(resolve, capMs);
    settledWaiters.push(() => { clearTimeout(timer); resolve(); });
  });
}

/** Cut everything off (leaving the screen). */
export function stopBeatVoice(): void {
  generation++;
  pending = null;
  pendingAfter = null;
  storyboardOpen = false;
  if (current && current !== 'loading') {
    try { current.stop?.(); current.release?.(); } catch { /* already gone */ }
  }
  current = null;
  settle();
}
