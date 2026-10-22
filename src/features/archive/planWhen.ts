import type { TranslationKey } from '../../shared/i18n';

/**
 * When a 계획 is for (10-22, user: "계획은 올해 내년 등 년단위 월단위도 가능하게").
 *
 * A plan can be a day, a month or a year. `details.date` stays a real `YYYY-MM-DD` whatever the
 * scope — the first day of the month or year — because the diary book, the sort and the server
 * all read it as a day. `details.scope` says how much of it is meant; absent means a day, which is
 * every plan written before this and every one the desk writes.
 */
export type PlanScope = 'day' | 'month' | 'year';
export const PLAN_SCOPES: PlanScope[] = ['day', 'month', 'year'];

export const scopeOf = (details: Record<string, string | undefined>): PlanScope =>
  details.scope === 'month' || details.scope === 'year' ? details.scope : 'day';

/** What the input shows for a stored date: 2027-03-01 → `2027-03` (month) or `2027` (year). */
export const rawOf = (scope: PlanScope, date: string): string =>
  scope === 'year' ? date.slice(0, 4) : scope === 'month' ? date.slice(0, 7) : date;

/** What gets stored for what was typed. Unfinished input is stored as typed, so the form's date
 *  check holds the save until it is whole. */
export const storedOf = (scope: PlanScope, raw: string): string => {
  if (scope === 'year' && /^\d{4}$/.test(raw)) return `${raw}-01-01`;
  if (scope === 'month' && /^\d{4}-\d{2}$/.test(raw)) return `${raw}-01`;
  return raw;
};

/** Digits in, the scope's shape out. */
export const maskWhen = (scope: PlanScope, v: string): string => {
  const d = v.replace(/\D/g, '');
  if (scope === 'year') return d.slice(0, 4);
  const max = scope === 'month' ? 6 : 8;
  const s = d.slice(0, max);
  if (s.length <= 4) return s;
  if (s.length <= 6) return `${s.slice(0, 4)}-${s.slice(4)}`;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}`;
};

export const placeholderOf = (scope: PlanScope): string =>
  scope === 'year' ? 'YYYY' : scope === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';

/** The one-tap answers for a scope: 올해 / 내년, 이번 달 / 다음 달. A day has none. */
export const quickPicks = (scope: PlanScope, now = new Date()): { label: TranslationKey; raw: string }[] => {
  const y = now.getFullYear();
  if (scope === 'year') {
    return [
      { label: 'archive.when.thisYear', raw: String(y) },
      { label: 'archive.when.nextYear', raw: String(y + 1) },
    ];
  }
  if (scope === 'month') {
    const m = now.getMonth(); // 0-based
    const ym = (yy: number, mm: number) => `${yy}-${String(mm + 1).padStart(2, '0')}`;
    return [
      { label: 'archive.when.thisMonth', raw: ym(y, m) },
      { label: 'archive.when.nextMonth', raw: m === 11 ? ym(y + 1, 0) : ym(y, m + 1) },
    ];
  }
  return [];
};

/** How a plan's date reads in a list: `2027년`, `2027년 3월`, or the day itself. */
export const formatWhen = (
  details: Record<string, string | undefined>,
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string,
): string => {
  const date = details.date ?? '';
  const scope = scopeOf(details);
  if (scope === 'year' && /^\d{4}/.test(date)) return t('archive.when.yearFmt', { year: date.slice(0, 4) });
  if (scope === 'month' && /^\d{4}-\d{2}/.test(date)) {
    return t('archive.when.monthFmt', { year: date.slice(0, 4), month: Number(date.slice(5, 7)) });
  }
  return date;
};
