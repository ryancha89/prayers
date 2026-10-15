/**
 * The diary's later screens (07-10 mockup: Calendar, Browse by Mood / Topic, My Journey) read
 * everything from these helpers. Pinned: the month grid's shape, a day's mood = its newest diary's,
 * the month counts, browse filters, tallies, the journey's month rows and their line, streaks, and
 * the favourite flag in `details`.
 */
import type { ArchiveMemory } from '../src/features/archive/types';
import type { DiaryReflection } from '../src/features/myroom/diary/diaryStore';
import {
  browse, dayMood, entriesByDay, isFavorite, journeyMonths, monthCheer, monthGrid, monthStats, moodTally,
  shiftMonth, streaks, topicTally, withFavorite,
} from '../src/features/myroom/diary/stats';

const row = (id: string, category: ArchiveMemory['category'], date: string, content: string, details: Record<string, string> = {}, at = '09'): ArchiveMemory => ({
  id, category, content, details: { date, ...details }, importance: 2, confidence: 1, source: 'manual', aiEnabled: true,
  createdAt: `${date}T${at}:00:00Z`, updatedAt: `${date}T${at}:00:00Z`,
});
const ready = (topics: string[], text = 'You kept going. That counts.'): DiaryReflection =>
  ({ status: 'ready', text, topics, counselor: 'sunyeo', lang: 'en', stale: false });

const memories = [
  row('a', 'diary', '2026-10-07', 'Tough but proud.', { mood: 'down' }, '08'),
  row('b', 'diary', '2026-10-07', 'Evening was better.', { mood: 'great' }, '20'),
  row('c', 'diary', '2026-10-06', 'Met a friend.', { mood: 'good', favorite: '1' }),
  row('d', 'goal', '2026-10-05', 'Run 10k'),
  row('e', 'diary', '2026-09-30', 'Rainy. Tired.', { mood: 'tired' }),
  row('x', 'like', '2026-10-07', 'Rain'),
];
const reflections = { a: ready(['self_growth', 'future']), c: ready(['people']), e: ready(['self_growth'], 'Rest is part of it. Really.') };

it('lays a month out Sunday first in whole weeks', () => {
  const g = monthGrid('2026-10');
  expect(g.length % 7).toBe(0);
  expect(g.slice(0, 5)).toEqual([null, null, null, null, '2026-10-01']); // 1 Oct 2026 is a Thursday
  expect(g.filter(Boolean)).toHaveLength(31);
  expect(shiftMonth('2026-12', 1)).toBe('2027-01');
  expect(shiftMonth('2026-01', -1)).toBe('2025-12');
});

it('gives a day the mood of its newest diary entry', () => {
  const byDay = entriesByDay(memories);
  expect(byDay['2026-10-07'].map(m => m.id)).toEqual(['b', 'a']);
  expect(dayMood(byDay['2026-10-07'])).toBe('great');
  expect(dayMood(byDay['2026-10-05'])).toBeUndefined(); // a goal has no mood
  expect(byDay['2026-10-07'].some(m => m.id === 'x')).toBe(false); // not a diary kind
});

it('counts the month', () => {
  expect(monthStats(memories, '2026-10')).toEqual({ days: 3, goodDays: 2, toughDays: 0 });
  expect(monthStats(memories, '2026-09')).toEqual({ days: 1, goodDays: 0, toughDays: 1 });
  expect(monthCheer({ days: 0, goodDays: 0, toughDays: 0 })).toBe('none');
  expect(monthCheer({ days: 3, goodDays: 1, toughDays: 2 })).toBe('tough');
  expect(monthCheer({ days: 8, goodDays: 5, toughDays: 1 })).toBe('steady');
  expect(monthCheer({ days: 2, goodDays: 1, toughDays: 0 })).toBe('start');
});

it('browses by mood and by the reflections’ topics', () => {
  expect(browse(memories, reflections, 'all', 'all').map(m => m.id)).toEqual(['b', 'a', 'c', 'd', 'e']);
  expect(browse(memories, reflections, 'down', 'all').map(m => m.id)).toEqual(['a']);
  expect(browse(memories, reflections, 'all', 'self_growth').map(m => m.id)).toEqual(['a', 'e']);
  expect(browse(memories, { ...reflections, c: { ...reflections.c, status: 'pending' } }, 'all', 'people')).toEqual([]);
});

it('tallies topics and moods, most first', () => {
  expect(topicTally(memories, reflections)[0]).toEqual({ id: 'self_growth', count: 2, share: 0.5 });
  expect(moodTally(memories).map(x => x.id)).toEqual(['great', 'down', 'good', 'tired']);
});

it('builds the journey by month, newest first, with the first ready reflection as the line', () => {
  const months = journeyMonths(memories, reflections, id => id === 'c');
  expect(months.map(m => [m.month, m.entries.length])).toEqual([['2026-10', 4], ['2026-09', 1]]);
  expect(months[0].line).toBe('You kept going.');
  expect(months[0].coverId).toBe('c');
  expect(months[1].line).toBe('Rest is part of it.');
  expect(journeyMonths(memories, {}, () => false)[0].line).toBe('Evening was better.');
});

it('measures streaks', () => {
  expect(streaks(memories, '2026-10-07')).toEqual({ longest: 3, current: 3 });
  expect(streaks(memories, '2026-10-08')).toEqual({ longest: 3, current: 3 });
  expect(streaks(memories, '2026-10-09')).toEqual({ longest: 3, current: 0 });
  expect(streaks([], '2026-10-09')).toEqual({ longest: 0, current: 0 });
});

it('keeps the favourite mark in details', () => {
  expect(isFavorite(memories[2])).toBe(true);
  expect(withFavorite({ mood: 'good' }, true)).toEqual({ mood: 'good', favorite: '1' });
  expect(withFavorite({ mood: 'good', favorite: '1' }, false)).toEqual({ mood: 'good' });
});
