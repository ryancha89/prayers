import { apiBase } from '../../../shared/config/api';
import { apiHeaders } from '../../auth/api/headers';
import { devlog } from '../../../shared/devlog';
import { useArchiveStore } from '../store/archiveStore';
import type { ArchiveMemory } from '../types';
import { CATEGORIES } from '../types';
import { readPhotos, readReflection, useDiaryStore } from '../../myroom/diary/diaryStore';
import { pruneDiary } from '../../myroom/diary/photos';

/**
 * The 아카이브's trip to the server — push what changed, pull what the account has.
 *
 * Best effort, never awaited by a screen: the tab works from the phone, and the server copy only
 * has to be current by the next consultation turn. Call it on tab focus and after each edit; both
 * are cheap when nothing changed (an empty batch is not sent).
 */
const BASE = () => apiBase();
const PUSH_TIMEOUT_MS = 10000;

export async function pushArchive(): Promise<boolean> {
  const { memories, dirty, deleted } = useArchiveStore.getState();
  if (dirty.length === 0 && deleted.length === 0) return true;
  const headers = await apiHeaders();
  if (!headers) return false;

  const upserts = memories.filter(m => dirty.includes(m.id));
  const pushedIds = upserts.map(m => m.id);
  const deletes = [...deleted];
  // A stalled connection must not hold a Save (spec 006 SC-003): give up and stay dirty.
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), PUSH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/memories/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ upserts, deletes }),
      signal: abort.signal,
    });
    if (!res.ok) {
      if (__DEV__) devlog(`[archive] sync ${res.status}`);
      return false;
    }
    // A 200 can still refuse rows (`rejected`, e.g. a category an older server does not know).
    // Those stay dirty for the next push instead of being marked synced and lost.
    let body: any = null;
    try {
      body = await res.json();
    } catch {}
    const rejected = new Set<string>(
      Array.isArray(body?.rejected) ? body.rejected.map((r: any) => String(r?.id ?? '')).filter(Boolean) : [],
    );
    if (rejected.size > 0 && __DEV__) devlog(`[archive] sync rejected ${[...rejected].join(',')}`);
    useArchiveStore.getState().pushed(pushedIds.filter(id => !rejected.has(id)), deletes);
    return rejected.size === 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function pullArchive(): Promise<boolean> {
  const headers = await apiHeaders();
  if (!headers) return false;
  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/memories`, { headers });
    if (!res.ok) return false;
    const payload: any = await res.json();
    if (payload?.success !== true || !Array.isArray(payload.memories)) return false;
    const known = payload.memories.filter(
      (r: any) => r && typeof r.id === 'string' && (CATEGORIES as string[]).includes(r.category),
    );
    const rows: ArchiveMemory[] = known
      .map((r: any) => ({
        id: r.id,
        category: r.category,
        content: String(r.content ?? ''),
        details: r.details && typeof r.details === 'object' ? r.details : {},
        importance: [1, 2, 3].includes(r.importance) ? r.importance : 2,
        confidence: typeof r.confidence === 'number' ? r.confidence : 1,
        source: r.source ?? 'manual',
        aiEnabled: r.aiEnabled !== false,
        createdAt: r.createdAt ?? new Date().toISOString(),
        updatedAt: r.updatedAt ?? r.createdAt ?? new Date().toISOString(),
        lastUsedAt: r.lastUsedAt ?? undefined,
      }));
    useArchiveStore.getState().merge(rows);
    // The server-owned halves of a diary entry (spec 006): its reflection and photos ride on the
    // same rows, read-only, and are kept apart from the row so a push can never overwrite them.
    useDiaryStore.getState().mergeServer(
      known.map((r: any) => ({ id: r.id, reflection: readReflection(r.reflection), photos: readPhotos(r.photos) })),
    );
    await pruneDiary(new Set(useArchiveStore.getState().memories.map(m => m.id)));
    return true;
  } catch {
    return false;
  }
}

/** Push first so a pull cannot hand back a row the phone just changed. */
export async function syncArchive(): Promise<void> {
  await pushArchive();
  await pullArchive();
}
