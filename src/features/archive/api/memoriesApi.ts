import { apiBase } from '../../../shared/config/api';
import { apiHeaders } from '../../auth/api/headers';
import { devlog } from '../../../shared/devlog';
import { useArchiveStore } from '../store/archiveStore';
import type { ArchiveMemory } from '../types';
import { CATEGORIES } from '../types';

/**
 * The 아카이브's trip to the server — push what changed, pull what the account has.
 *
 * Best effort, never awaited by a screen: the tab works from the phone, and the server copy only
 * has to be current by the next consultation turn. Call it on tab focus and after each edit; both
 * are cheap when nothing changed (an empty batch is not sent).
 */
const BASE = () => apiBase();

export async function pushArchive(): Promise<boolean> {
  const { memories, dirty, deleted } = useArchiveStore.getState();
  if (dirty.length === 0 && deleted.length === 0) return true;
  const headers = await apiHeaders();
  if (!headers) return false;

  const upserts = memories.filter(m => dirty.includes(m.id));
  const pushedIds = upserts.map(m => m.id);
  const deletes = [...deleted];
  try {
    const res = await fetch(`${BASE()}/api/v1/prayers/memories/sync`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ upserts, deletes }),
    });
    if (!res.ok) {
      if (__DEV__) devlog(`[archive] sync ${res.status}`);
      return false;
    }
    useArchiveStore.getState().pushed(pushedIds, deletes);
    return true;
  } catch {
    return false;
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
    const rows: ArchiveMemory[] = payload.memories
      .filter((r: any) => r && typeof r.id === 'string' && (CATEGORIES as string[]).includes(r.category))
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
