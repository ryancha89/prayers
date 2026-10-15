import { speakingPlayable } from '../../counselors/data/registry';
import { localizeCounselors } from '../../counselors/data/mockCounselors';
import type { CounselorSummary } from '../../counselors/types';
import type { Lang } from '../../../shared/i18n';

/**
 * Who can be picked to read a diary entry (spec 006 Q2): the consultable counsellors — the
 * registry's speaking, playable cards (4 today: Yuna, Go Yunjung, Jiho, Theo). The entry stores the
 * card's server TONE (`details.counselor`), which is what the server writes the reflection in; the
 * card is looked up back from it for the portrait and for "Talk to Counselor".
 */
export const DEFAULT_DIARY_TONE = 'sunyeo';

export interface DiaryCounselor {
  tone: string;
  counselor: CounselorSummary;
}

export function diaryCounselors(lang: Lang): DiaryCounselor[] {
  const cards = localizeCounselors(lang);
  return speakingPlayable
    .filter(r => r.tone.length > 0)
    .map(r => ({ tone: r.tone, counselor: cards.find(c => c.characterId === r.characterId) }))
    .filter((x): x is DiaryCounselor => !!x.counselor);
}

/** The card for a stored tone; an unknown tone reads as the default, as the server does. */
export function diaryCounselorFor(tone: string | undefined, lang: Lang): DiaryCounselor | undefined {
  const all = diaryCounselors(lang);
  return all.find(c => c.tone === tone) ?? all.find(c => c.tone === DEFAULT_DIARY_TONE) ?? all[0];
}

/**
 * The picker's preselection: the counsellor of the most recent conversation, when they can read a
 * diary; else Yuna (`sunyeo`). `recentCounselorIds` = the conversation store's counselor ids, newest
 * first.
 */
export function defaultDiaryTone(recentCounselorIds: string[], lang: Lang): string {
  const all = diaryCounselors(lang);
  for (const id of recentCounselorIds) {
    const hit = all.find(c => c.counselor.id === id);
    if (hit) return hit.tone;
  }
  return DEFAULT_DIARY_TONE;
}
