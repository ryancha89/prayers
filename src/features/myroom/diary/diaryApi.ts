import { apiBase } from '../../../shared/config/api';
import { apiHeaders, authedFetch } from '../../auth/api/headers';
import { devlog } from '../../../shared/devlog';
import { pushArchive, syncArchive } from '../../archive/api/memoriesApi';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { isDiaryKind } from '../../archive/types';
import { useLanguageStore } from '../../../shared/i18n/store';
import { currentLocalUri } from './photos';
import { readPhotos, readReflection, useDiaryStore, type DiaryReflection, type ServerPhoto } from './diaryStore';

/**
 * The diary's own calls (spec 006): the counsellor's reflection, and the photos. The entry itself
 * travels with the 아카이브 (`pushArchive` / `pullArchive`) — these only ever name it by its id.
 *
 * Every call here answers rather than throws: the Saved screen and the upload queue each have one
 * thing to show for "it did not work", and an exception would only reach a catch that shows it.
 */
const BASE = () => `${apiBase()}/api/v1/prayers/memories`;

/** The account headers minus the JSON Content-Type: an <Image> sends none, and multipart must set
 *  its own boundary. */
const withoutContentType = (h: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'Content-Type'));

export type ReflectionAnswer =
  | { ok: true; reflection: DiaryReflection }
  /** 404: the row is not on the server yet. 422: not a diary kind. 0: no network / no credential. */
  | { ok: false; status: number; code?: string };

async function readAnswer(res: Response | null): Promise<ReflectionAnswer> {
  if (!res) return { ok: false, status: 0 };
  let body: any = null;
  try {
    body = await res.json();
  } catch {
    return { ok: false, status: res.status };
  }
  const reflection = readReflection(body?.reflection);
  if (res.ok && reflection) return { ok: true, reflection };
  return { ok: false, status: res.status, code: typeof body?.error_code === 'string' ? body.error_code : undefined };
}

/**
 * Ask for the entry's reflection in the app language. The server answers at once — `pending` (202)
 * while it writes, or the `ready` / `fallback` it already has. A 404 means the row has not reached
 * the server: push the 아카이브 and ask once more (one retry; a second 404 is reported).
 */
export async function requestReflection(memoryId: string, lang: string): Promise<ReflectionAnswer> {
  const ask = async () => {
    try {
      return await readAnswer(
        await authedFetch(`${BASE()}/${encodeURIComponent(memoryId)}/reflection`, {
          method: 'POST',
          body: JSON.stringify({ lang }),
        }),
      );
    } catch {
      return { ok: false as const, status: 0 };
    }
  };
  let answer = await ask();
  if (!answer.ok && answer.status === 404) {
    const pushed = await pushArchive();
    if (pushed) answer = await ask();
  }
  if (answer.ok) useDiaryStore.getState().setReflection(memoryId, answer.reflection);
  else if (__DEV__) devlog(`[diary] reflection ${answer.status} ${answer.code ?? ''}`);
  return answer;
}

export async function fetchReflection(memoryId: string): Promise<ReflectionAnswer> {
  try {
    const res = await authedFetch(`${BASE()}/${encodeURIComponent(memoryId)}/reflection`);
    if (!res) return { ok: false, status: 0 };
    let body: any = null;
    try {
      body = await res.json();
    } catch {
      return { ok: false, status: res.status };
    }
    const reflection = readReflection(body?.reflection);
    if (res.ok && reflection) {
      useDiaryStore.getState().setReflection(memoryId, reflection);
      return { ok: true, reflection };
    }
    return { ok: false, status: res.status, code: body?.error_code };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** Plan R5: poll every 3 s for up to 45 s. */
export const REFLECTION_POLL_MS = 3000;
export const REFLECTION_WAIT_MS = 45000;

/**
 * Request, then poll until the reflection is no longer `pending` or the wait runs out. `onUpdate`
 * gets every answer worth showing, in order. Returns the last reflection, or null when there never
 * was one (offline, not synced, signed out). Stops early when `signal` aborts.
 *
 * Past 45 s the caller shows the server's fallback if it has one; a reflection that lands later is
 * picked up by the next pull (it is in `GET memories`) and replaces it in Detail.
 */
export async function awaitReflection(
  memoryId: string,
  lang: string,
  opts: {
    onUpdate?: (r: DiaryReflection) => void;
    signal?: { aborted: boolean };
    pollMs?: number;
    waitMs?: number;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): Promise<DiaryReflection | null> {
  const pollMs = opts.pollMs ?? REFLECTION_POLL_MS;
  const waitMs = opts.waitMs ?? REFLECTION_WAIT_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const first = await requestReflection(memoryId, lang);
  if (!first.ok) return null;
  let last = first.reflection;
  opts.onUpdate?.(last);
  let waited = 0;
  while (last.status === 'pending' && waited < waitMs) {
    if (opts.signal?.aborted) return last;
    await sleep(pollMs);
    waited += pollMs;
    if (opts.signal?.aborted) return last;
    const next = await fetchReflection(memoryId);
    if (next.ok) {
      last = next.reflection;
      opts.onUpdate?.(last);
    }
  }
  return last;
}

/* ── Photos ──────────────────────────────────────────────────────────────────────────── */

/**
 * The headers an <Image> needs for a server photo. On R2 the url is presigned and needs nothing;
 * on the dev disk store it is a path under the API base that answers only with the account's
 * credentials (server R10).
 */
export async function photoSource(url: string): Promise<{ uri: string; headers?: Record<string, string> }> {
  if (/^https?:\/\//.test(url) && !url.startsWith(apiBase())) return { uri: url };
  const uri = url.startsWith('/') ? `${apiBase()}${url}` : url;
  const h = await apiHeaders();
  if (!h) return { uri };
  const headers = withoutContentType(h);
  return { uri, headers };
}

export type UploadAnswer = { ok: true; photo: ServerPhoto } | { ok: false; status: number; code?: string };

/**
 * One photo, multipart. Idempotent on `client_photo_id`, so a retry after a lost response returns
 * the photo the server already has. Not through `authedFetch`: its JSON Content-Type would break the
 * multipart boundary, so the headers are built here without it.
 */
export async function uploadPhoto(
  memoryId: string,
  photo: { id: string; localUri: string; position: number },
): Promise<UploadAnswer> {
  const h = await apiHeaders();
  if (!h) return { ok: false, status: 0 };
  const headers = withoutContentType(h);
  const form = new FormData();
  form.append('photo', { uri: photo.localUri, name: `${photo.id}.jpg`, type: 'image/jpeg' } as any);
  form.append('client_photo_id', photo.id);
  form.append('position', String(photo.position));
  try {
    const res = await fetch(`${BASE()}/${encodeURIComponent(memoryId)}/photos`, { method: 'POST', headers, body: form });
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    const [p] = readPhotos(body?.photo ? [body.photo] : []);
    if (res.ok && p) return { ok: true, photo: p };
    return { ok: false, status: res.status, code: body?.error_code };
  } catch {
    return { ok: false, status: 0 };
  }
}

export async function deleteServerPhoto(memoryId: string, photoId: string): Promise<boolean> {
  try {
    const res = await authedFetch(
      `${BASE()}/${encodeURIComponent(memoryId)}/photos/${encodeURIComponent(photoId)}`,
      { method: 'DELETE' },
    );
    // 404 = already gone, which is what was asked for.
    return !!res && (res.ok || res.status === 404);
  } catch {
    return false;
  }
}

/**
 * The upload queue, run after a sync: every local photo whose entry is on the server and that the
 * server does not have yet, then every server delete still owed. A failure leaves the photo queued
 * for the next run — the entry is never blocked on it (spec US4 2). An entry still waiting to push
 * is skipped: its upload would only 404.
 */
let flushing: Promise<void> | null = null;
export function flushPhotos(): Promise<void> {
  if (!flushing) flushing = runFlush().finally(() => { flushing = null; });
  return flushing;
}

async function runFlush(): Promise<void> {
  // Deletes first: the server counts a photo still owed a delete toward the entry's limit, so a
  // replaced photo uploaded before the delete would be refused as over it.
  for (const d of [...useDiaryStore.getState().photoDeletes]) {
    if (await deleteServerPhoto(d.memoryId, d.photoId)) useDiaryStore.getState().photoDeleted(d.memoryId, d.photoId);
  }
  const diary = useDiaryStore.getState();
  const { dirty, memories } = useArchiveStore.getState();
  const known = new Set(memories.map(m => m.id));
  for (const [memoryId, list] of Object.entries(diary.photos)) {
    if (!known.has(memoryId) || dirty.includes(memoryId)) continue;
    for (const p of list) {
      if (p.uploaded || p.refused || !p.localUri) continue;
      const localUri = currentLocalUri(p.localUri)!;
      const r = await uploadPhoto(memoryId, { id: p.id, localUri, position: p.position });
      if (r.ok) useDiaryStore.getState().markUploaded(memoryId, r.photo);
      else if (__DEV__) devlog(`[diary] photo upload ${r.status} ${r.code ?? ''}`);
      // A refusal that retrying cannot fix (too big, wrong type, over the limit) is not retried
      // forever: the photo stays on the phone, and the queue moves on. Over the limit is final only
      // when no delete is still owed on the entry — one that failed this run frees a slot later.
      const deletesOwed = useDiaryStore.getState().photoDeletes.some(d => d.memoryId === memoryId);
      const limit = r.ok ? false : r.code === 'PHOTO_LIMIT' && !deletesOwed;
      if (!r.ok && (r.status === 413 || r.status === 415 || limit || r.code === 'PHOTO_TYPE')) {
        useDiaryStore.getState().markRefused(memoryId, p.id);
      }
    }
  }
}

/** How far back a sync looks for an entry that never got its reflection (written offline, or in the
 *  아카이브 tab), and how many it asks for at once: older rows predate the feature, and the server
 *  caps reflections per day. */
const CATCH_UP_DAYS = 14;
const CATCH_UP_MAX = 3;

/**
 * Ask for the reflections a Save could not: an entry saved offline, or written or edited in the
 * 아카이브 tab, has none (or a stale one) until something requests it — the Saved screen is the only
 * other caller. Only rows already on the server; no polling, the next pull brings the result.
 */
export async function catchUpReflections(lang: string): Promise<number> {
  const { memories, dirty } = useArchiveStore.getState();
  const { reflections } = useDiaryStore.getState();
  const since = Date.now() - CATCH_UP_DAYS * 86400000;
  const due = memories
    // An entry with its AI switch off is never asked about (US2-3).
    .filter(m => isDiaryKind(m.category) && m.aiEnabled !== false && !dirty.includes(m.id))
    .filter(m => {
      const r = reflections[m.id];
      if (r) return r.stale;
      return Date.parse(m.updatedAt) >= since;
    })
    .slice(0, CATCH_UP_MAX);
  for (const m of due) await requestReflection(m.id, lang);
  return due.length;
}

/** The diary's sync: the 아카이브 both ways (entries, and their reflections and photos on the
 *  pull), then the photo queue — after the push, so every entry it uploads to exists. */
export async function syncDiary(): Promise<void> {
  await syncArchive();
  await flushPhotos();
  await catchUpReflections(useLanguageStore.getState().lang);
}
