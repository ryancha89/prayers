/**
 * Spec 006 T019 — what the desk book is sent: the newest entry, its date in the app language, and
 * the first 400 code points of its text (never half a surrogate pair). null = the blank page.
 */
import { bookFor, BOOK_TEXT_MAX, diaryEntries, sameBook } from '../src/features/myroom/diary/book';
import { clampCodePoints, codePoints, formatDay } from '../src/features/myroom/diary/text';
import type { ArchiveMemory } from '../src/features/archive/types';

const row = (over: Partial<ArchiveMemory> & { id: string }): ArchiveMemory => ({
  category: 'diary', content: 'x', details: {}, importance: 2, confidence: 1, source: 'diary',
  aiEnabled: true, createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', ...over,
});

describe('the desk book page', () => {
  it('is null with no desk entry (other archive rows do not count)', () => {
    expect(bookFor([row({ id: 'a', category: 'like' })], 'en')).toBeNull();
  });

  it('shows the newest entry by its own date, then by when it was written', () => {
    const rows = [
      row({ id: 'old', details: { date: '2026-10-05' }, createdAt: '2026-10-07T09:00:00Z' }),
      row({ id: 'early', category: 'wish', details: { date: '2026-10-07' }, createdAt: '2026-10-07T08:00:00Z' }),
      row({ id: 'late', category: 'plan', details: { date: '2026-10-07' }, createdAt: '2026-10-07T10:00:00Z' }),
    ];
    expect(diaryEntries(rows).map(r => r.id)).toEqual(['late', 'early', 'old']);
    expect(bookFor(rows, 'en')).toMatchObject({ id: 'late', kind: 'plan' });
  });

  it('formats the date in each of the six languages', () => {
    const r = [row({ id: 'a', details: { date: '2026-10-07' } })];
    const dates = (['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const).map(l => bookFor(r, l)!.date);
    expect(dates[0]).toContain('2026년');
    expect(dates[0]).toContain('10월');
    expect(dates[1]).toMatch(/October 7, 2026/);
    expect(dates[2]).toContain('2026年10月7日');
    expect(dates[3]).toContain('2026年10月7日');
    expect(dates[4]).toContain('2026年10月7日');
    expect(dates[5]).toContain('2026');
    expect(new Set(dates).size).toBeGreaterThanOrEqual(5);
    // A calendar date, not an instant: no time zone moves it a day.
    expect(formatDay('2026-01-01', 'en')).toMatch(/January 1, 2026/);
  });

  it('cuts at 400 code points and never splits a surrogate pair', () => {
    const text = '😀'.repeat(399) + '가나다';
    const page = bookFor([row({ id: 'a', content: text, details: { date: '2026-10-07' } })], 'ko')!;
    expect(codePoints(page.text)).toBe(BOOK_TEXT_MAX);
    expect(page.text.endsWith('😀가')).toBe(true);
    expect(clampCodePoints('a😀b', 2)).toBe('a😀');
  });

  it('carries every script through untouched', () => {
    for (const s of ['똠 꽦 오늘', 'ひらがな漢字', '们这说国', '們說國', 'ặ ữ tiếng Việt']) {
      expect(bookFor([row({ id: 'a', content: s, details: { date: '2026-10-07' } })], 'en')!.text).toBe(s);
    }
  });

  it('compares pages by content', () => {
    const a = bookFor([row({ id: 'a', details: { date: '2026-10-07' } })], 'en');
    const b = bookFor([row({ id: 'a', details: { date: '2026-10-07' } })], 'en');
    expect(sameBook(a, b)).toBe(true);
    expect(sameBook(a, null)).toBe(false);
    expect(sameBook(null, null)).toBe(true);
  });
});
