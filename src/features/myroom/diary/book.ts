import type { ArchiveMemory } from '../../archive/types';
import { isDiaryKind } from '../../archive/types';
import type { MyRoomBook } from '../../counseling/types';
import { formatDay } from './text';

/** How much of the entry the book is sent (spec 006 R14): more than any one page holds in any
 *  script, so Unity always has enough to fill the page and end it with "…". */
export const BOOK_TEXT_MAX = 400;

/** Newest first: the entry's own date, then when it was written (several entries on one day). */
export const byNewest = (a: ArchiveMemory, b: ArchiveMemory): number =>
  (b.details.date ?? '').localeCompare(a.details.date ?? '') || b.createdAt.localeCompare(a.createdAt);

/** The desk's entries — the four diary kinds — newest first. */
export const diaryEntries = (memories: ArchiveMemory[]): ArchiveMemory[] =>
  memories.filter(m => isDiaryKind(m.category)).sort(byNewest);

/**
 * The page the desk book shows: the newest entry, its date in the app language, and the first 400
 * code points of its text. null when there is no entry — Unity then draws the blank page.
 */
export function bookFor(memories: ArchiveMemory[], lang: string): MyRoomBook | null {
  const newest = diaryEntries(memories)[0];
  if (!newest) return null;
  const day = newest.details.date || newest.createdAt.slice(0, 10);
  return {
    id: newest.id,
    kind: newest.category as MyRoomBook['kind'],
    date: formatDay(day, lang),
    text: [...newest.content].slice(0, BOOK_TEXT_MAX).join(''),
  };
}

/** Same page? — so a pull that changed nothing on the book sends nothing to Unity. */
export const sameBook = (a: MyRoomBook | null, b: MyRoomBook | null): boolean =>
  a === b || (!!a && !!b && a.id === b.id && a.kind === b.kind && a.date === b.date && a.text === b.text);
