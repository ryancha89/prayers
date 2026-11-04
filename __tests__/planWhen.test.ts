import { formatWhen, maskWhen, quickPicks, rawOf, scopeOf, storedOf } from '../src/features/archive/planWhen';
import { validate } from '../src/features/archive/validation';
import { FIELDS } from '../src/features/archive/types';

const t = (key: string, vars?: Record<string, string | number>) =>
  key === 'archive.when.yearFmt' ? `${vars?.year}년` : key === 'archive.when.monthFmt' ? `${vars?.year}년 ${vars?.month}월` : key;

describe('계획 — a day, a month or a year', () => {
  const field = FIELDS.plan[0];

  it('stores a whole day for every scope, so the diary and the sort still read it', () => {
    expect(storedOf('year', '2027')).toBe('2027-01-01');
    expect(storedOf('month', '2027-03')).toBe('2027-03-01');
    expect(storedOf('day', '2027-03-14')).toBe('2027-03-14');
    expect(validate(field, storedOf('year', '2027'))).toBeNull();
    expect(validate(field, storedOf('month', '2027-03'))).toBeNull();
  });

  it('holds the save while the input is unfinished or impossible', () => {
    expect(validate(field, storedOf('year', '202'))).not.toBeNull();
    expect(validate(field, storedOf('month', '2027-1'))).not.toBeNull();
    expect(validate(field, storedOf('month', '2027-13'))).not.toBeNull();
  });

  it('masks to the scope and narrows a date when the scope changes', () => {
    expect(maskWhen('year', '20271')).toBe('2027');
    expect(maskWhen('month', '202703')).toBe('2027-03');
    expect(rawOf('month', '2026-10-22')).toBe('2026-10');
    expect(rawOf('year', '2026-10-22')).toBe('2026');
  });

  it('offers 올해/내년 and 이번 달/다음 달, rolling December into January', () => {
    const dec = new Date(2026, 11, 5);
    expect(quickPicks('year', dec).map(q => q.raw)).toEqual(['2026', '2027']);
    expect(quickPicks('month', dec).map(q => q.raw)).toEqual(['2026-12', '2027-01']);
    expect(quickPicks('day', dec)).toEqual([]);
  });

  it('reads as the scope in a list; an old plan with no scope is a day', () => {
    expect(formatWhen({ date: '2027-01-01', scope: 'year' }, t)).toBe('2027년');
    expect(formatWhen({ date: '2027-03-01', scope: 'month' }, t)).toBe('2027년 3월');
    expect(formatWhen({ date: '2026-10-22' }, t)).toBe('2026-10-22');
    expect(scopeOf({})).toBe('day');
  });
});
