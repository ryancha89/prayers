import type { ArchiveMemory } from '../../archive/types';
import type { DiaryReflection } from './diaryStore';
import { diaryEntries } from './book';

/**
 * What the diary's later screens (07-10 mockup: Calendar, Browse by Mood / Topic, My Journey) read
 * from the entries. All derived on the phone from the 아카이브 rows and the server's reflections —
 * nothing here is stored or sent anywhere.
 */

/** The five moods in the mockup's order, best first. */
export const MOODS = ['great', 'good', 'okay', 'down', 'tired'] as const;
export type Mood = (typeof MOODS)[number];

/** One colour per mood: the calendar's dots and the coloured faces. Warm for good days, cool for hard ones. */
export const MOOD_COLOR: Record<Mood, string> = {
  great: '#F6C453',
  good: '#F4A261',
  okay: '#A78BFA',
  down: '#60A5FA',
  tired: '#F87171',
};
export const moodColor = (mood?: string): string | undefined =>
  mood && (MOODS as readonly string[]).includes(mood) ? MOOD_COLOR[mood as Mood] : undefined;

/** The day an entry belongs to: its own date, else the day it was written. */
export const entryDay = (m: ArchiveMemory): string => m.details.date || m.createdAt.slice(0, 10);

/** The Favorites tab's mark. In `details`, so it syncs with the row like any other field. */
export const isFavorite = (m: ArchiveMemory): boolean => m.details.favorite === '1';
export const withFavorite = (details: Record<string, string>, on: boolean): Record<string, string> => {
  const next = { ...details };
  if (on) next.favorite = '1';
  else delete next.favorite;
  return next;
};

/** "YYYY-MM" of a "YYYY-MM-DD". */
export const monthOf = (day: string): string => day.slice(0, 7);

/** One month on, or back: "2026-10" + 1 → "2026-11". */
export const shiftMonth = (month: string, by: number): string => {
  const [y, m] = month.split('-').map(Number);
  const at = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${at.getUTCFullYear()}-${String(at.getUTCMonth() + 1).padStart(2, '0')}`;
};

/** A month's grid, Sunday first, as "YYYY-MM-DD" with null padding before the 1st and after the last
 *  day, in whole weeks. */
export function monthGrid(month: string): (string | null)[] {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells: (string | null)[] = Array(first).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${month}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

/** The diary entries of each day, newest first within the day. */
export function entriesByDay(memories: ArchiveMemory[]): Record<string, ArchiveMemory[]> {
  const out: Record<string, ArchiveMemory[]> = {};
  diaryEntries(memories).forEach(m => { (out[entryDay(m)] ??= []).push(m); });
  return out;
}

/** The mood a day shows on the calendar: its newest diary entry's. */
export const dayMood = (entries: ArchiveMemory[] | undefined): string | undefined =>
  entries?.find(m => m.category === 'diary' && moodColor(m.details.mood))?.details.mood;

export interface MonthStats {
  /** Days with at least one entry of any kind. */
  days: number;
  /** Days whose mood was great or good. */
  goodDays: number;
  /** Days whose mood was down or tired. */
  toughDays: number;
}

export function monthStats(memories: ArchiveMemory[], month: string): MonthStats {
  const byDay = entriesByDay(memories);
  const days = Object.keys(byDay).filter(d => monthOf(d) === month);
  const moods = days.map(d => dayMood(byDay[d]));
  return {
    days: days.length,
    goodDays: moods.filter(x => x === 'great' || x === 'good').length,
    toughDays: moods.filter(x => x === 'down' || x === 'tired').length,
  };
}

/** Which of the calendar's encouragement lines fits the month (the line itself is a string table key). */
export function monthCheer(stats: MonthStats): 'none' | 'tough' | 'steady' | 'start' {
  if (stats.days === 0) return 'none';
  if (stats.toughDays > stats.goodDays) return 'tough';
  if (stats.days >= 7) return 'steady';
  return 'start';
}

/** The topics of an entry: its reflection's, when the reflection is ready. */
export const entryTopics = (m: ArchiveMemory, reflections: Record<string, DiaryReflection>): string[] =>
  reflections[m.id]?.status === 'ready' ? reflections[m.id].topics : [];

/** Diary entries that match a mood and a topic (`'all'` matches anything). Only `diary` rows carry a mood. */
export function browse(
  memories: ArchiveMemory[],
  reflections: Record<string, DiaryReflection>,
  mood: string,
  topic: string,
): ArchiveMemory[] {
  return diaryEntries(memories).filter(m =>
    (mood === 'all' || (m.category === 'diary' && m.details.mood === mood)) &&
    (topic === 'all' || entryTopics(m, reflections).includes(topic)),
  );
}

export interface Tally { id: string; count: number; share: number }

/** Counts, most first, with each one's share of the total (0–1). Ties keep first-seen order. */
function tally(ids: string[]): Tally[] {
  const counts = new Map<string, number>();
  ids.forEach(id => counts.set(id, (counts.get(id) ?? 0) + 1));
  const total = ids.length || 1;
  return [...counts.entries()]
    .map(([id, count]) => ({ id, count, share: count / total }))
    .sort((a, b) => b.count - a.count);
}

export const topicTally = (memories: ArchiveMemory[], reflections: Record<string, DiaryReflection>): Tally[] =>
  tally(diaryEntries(memories).flatMap(m => entryTopics(m, reflections)));

export const moodTally = (memories: ArchiveMemory[]): Tally[] =>
  tally(diaryEntries(memories).filter(m => m.category === 'diary' && moodColor(m.details.mood)).map(m => m.details.mood));

export interface JourneyMonth {
  month: string;
  entries: ArchiveMemory[];
  /** The month's line: the newest ready reflection's first sentence, else the newest entry's opening. */
  line: string;
  /** The entry whose first photo stands for the month, if any has one. */
  coverId?: string;
}

const firstSentence = (s: string): string => {
  const m = s.match(/^.+?[.!?。！？](\s|$)/s);
  return (m ? m[0] : s).trim();
};

/** My Journey's timeline: one row per month with entries, newest month first. */
export function journeyMonths(
  memories: ArchiveMemory[],
  reflections: Record<string, DiaryReflection>,
  hasPhoto: (id: string) => boolean,
): JourneyMonth[] {
  const byMonth = new Map<string, ArchiveMemory[]>();
  diaryEntries(memories).forEach(m => {
    const key = monthOf(entryDay(m));
    byMonth.set(key, [...(byMonth.get(key) ?? []), m]);
  });
  return [...byMonth.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, entries]) => {
      const read = entries.find(m => reflections[m.id]?.status === 'ready' && reflections[m.id].text);
      const line = read ? firstSentence(reflections[read.id].text) : [...firstSentence(entries[0].content)].slice(0, 80).join('');
      return { month, entries, line, coverId: entries.find(m => hasPhoto(m.id))?.id };
    });
}

/** The longest run of consecutive days with an entry, and the run that ends today or yesterday. */
export function streaks(memories: ArchiveMemory[], today: string): { longest: number; current: number } {
  const days = [...new Set(diaryEntries(memories).map(entryDay))].sort();
  const next = (d: string) => {
    const [y, m, dd] = d.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, dd + 1)).toISOString().slice(0, 10);
  };
  let longest = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && next(days[i - 1]) === d ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  const last = days[days.length - 1];
  const current = last && (last === today || next(last) === today) ? run : 0;
  return { longest, current };
}
