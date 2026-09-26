import type { ArchiveCategory } from './types';

/**
 * 오늘의 질문 — one a day, answered in a line, filed where it belongs.
 *
 * The tab's promise is "build the person, don't fill a form": a single question is the smallest
 * thing that can be answered on the way somewhere else, and each one names the category its
 * answer is saved to so nothing has to be sorted afterwards. The copy lives in the i18n table
 * (`archive.q.<n>`); this is only the rota and the filing.
 */
export interface DailyQuestion {
  /** i18n key suffix. */
  id: number;
  category: ArchiveCategory;
  /** Details stamped on the saved memory, so a "what do you want" answer lands as a goal in
   *  `plan`, not a bare line. */
  details?: Record<string, string>;
}

export const DAILY_QUESTIONS: DailyQuestion[] = [
  { id: 0, category: 'like' },
  { id: 1, category: 'interest', details: { level: 'like' } },
  { id: 2, category: 'relationship', details: { relation: 'other', closeness: 'high' } },
  { id: 3, category: 'manual', details: { section: 'stress' } },
  { id: 4, category: 'goal', details: { status: 'plan' } },
  { id: 5, category: 'dislike' },
  { id: 6, category: 'possession' },
  { id: 7, category: 'story' },
];

/** Deterministic by calendar day, so the question does not change under the player's thumb. */
export function questionFor(dayKey: string, answered: number[]): DailyQuestion | null {
  const remaining = DAILY_QUESTIONS.filter(q => !answered.includes(q.id));
  if (remaining.length === 0) return null;
  const seed = [...dayKey].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return remaining[seed % remaining.length];
}

export const dayKey = (d = new Date()): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
