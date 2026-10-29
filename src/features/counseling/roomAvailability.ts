import type { TranslationKey } from '../../shared/i18n';
import type { CounselorSummary } from '../counselors/types';
import type { CounselingSubject } from './types';

/**
 * Why a room cannot be opened from here, or null when it can (29-10).
 *
 * A past conversation names a counsellor card and a subject. The subject is a saved person, and saved
 * people live only on the phone (subjectsStore) — the server derives the subject id from the session
 * id (`session_<card>_<subjectId>`, Prayers::History) and has no person behind it. After a reinstall
 * or on another phone that thread names someone this device has never heard of. The counsellor can
 * be gone too: a card the roster no longer has, or one with no built room (`comingSoon`).
 *
 * UnityEntryScreen used to return quietly in both cases, under a loading veil that waited for a
 * READY no room would send: an endless spinner whose only way out was an edge swipe. The entry
 * screen and the Conversations list both ask this, so they cannot disagree about a row.
 */
export type RoomBlock = 'subject' | 'counselor';

export function roomBlock(counselor: CounselorSummary | undefined, subject: CounselingSubject | undefined): RoomBlock | null {
  if (!counselor || counselor.comingSoon) return 'counselor';
  if (!subject) return 'subject';
  return null;
}

/** The one line that says why, shown on the entry screen and on the conversation's row. */
export const ROOM_BLOCK_LINE: Record<RoomBlock, TranslationKey> = {
  subject: 'conv.personMissing',
  counselor: 'conv.counselorMissing',
};
