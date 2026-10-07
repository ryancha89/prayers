import { useArchiveStore } from '../../archive/store/archiveStore';
import { pushArchive } from '../../archive/api/memoriesApi';
import type { ArchiveMemory, DiaryKind } from '../../archive/types';
import { flushPhotos } from './diaryApi';
import { attachPhotos, detachPhoto, dropLocalPhotos, type PickedPhoto } from './photos';
import { clampCodePoints, DIARY_MAX } from './text';

/** What the Write sheet hands over on Save. */
export interface DiaryDraft {
  kind: DiaryKind;
  /** "YYYY-MM-DD", never in the future (the sheet does not offer one). */
  date: string;
  /** Diary only. */
  mood?: string;
  /** The picked counsellor's server tone (spec 006 Q2). */
  counselor: string;
  content: string;
  aiEnabled: boolean;
  /** Photos picked in this sitting, not yet on the entry. */
  added: PickedPhoto[];
  /** Ids of the entry's photos taken off in this sitting. */
  removed: string[];
}

/**
 * Save an entry — a new 아카이브 row, or an edit of `editingId` — on the phone first, then push.
 * Nothing waits on the network: offline, the row stays dirty and goes on the next sync (US1 5),
 * and photos join the upload queue. Returns the row and whether the push went through.
 *
 * The kind is fixed once written: a row's category is not editable in the archive model, and a
 * changed kind would be a different entry.
 */
export async function saveDiaryEntry(draft: DiaryDraft, editingId?: string): Promise<{ memory: ArchiveMemory; pushed: boolean }> {
  const store = useArchiveStore.getState();
  const content = clampCodePoints(draft.content.trim(), DIARY_MAX);
  const own = { date: draft.date, counselor: draft.counselor, ...(draft.kind === 'diary' && draft.mood ? { mood: draft.mood } : {}) };

  let memory: ArchiveMemory;
  const before = editingId ? store.memories.find(m => m.id === editingId) : undefined;
  if (before) {
    store.update(before.id, { content, details: { ...before.details, ...own }, aiEnabled: draft.aiEnabled });
    memory = useArchiveStore.getState().memories.find(m => m.id === before.id)!;
  } else {
    memory = store.add({
      category: draft.kind,
      content,
      // The goals group keeps its status field; a new goal starts as a plan, as in the 아카이브 tab.
      details: draft.kind === 'goal' ? { status: 'plan', ...own } : own,
      source: draft.kind === 'diary' ? 'diary' : 'manual',
    });
    if (!draft.aiEnabled) {
      useArchiveStore.getState().setAiEnabled(memory.id, false);
      memory = useArchiveStore.getState().memories.find(m => m.id === memory.id)!;
    }
  }

  for (const id of draft.removed) await detachPhoto(memory.id, id);
  if (draft.added.length > 0) await attachPhotos(memory.id, draft.added);

  const pushed = await pushArchive();
  if (pushed) flushPhotos().catch(() => {});
  return { memory, pushed };
}

/** Delete an entry: the row (pushed as a delete), its reflection, and its photos on the phone; the
 *  server removes its own photos and reflection with the row. */
export async function deleteDiaryEntry(id: string): Promise<boolean> {
  useArchiveStore.getState().remove(id);
  await dropLocalPhotos(id);
  return pushArchive();
}
