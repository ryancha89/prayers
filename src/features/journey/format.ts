import type { Lang } from '../../shared/i18n';

const EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/** "4월 · 5월", "APR · MAY", "4月 · 5月", "Th4 · Th5" — the card and the ticket's way of naming months. */
export function monthLabel(m: number, lang: Lang): string {
  switch (lang) {
    case 'ko':
      return `${m}월`;
    case 'ja':
    case 'zh-CN':
    case 'zh-TW':
      return `${m}月`;
    case 'vi':
      return `Th${m}`;
    default:
      return EN[m - 1] ?? String(m);
  }
}

/** The calendar year a journey month falls in. The months run 입춘 to 입춘 (server facts v7, 10-13):
 *  February of the journey's year through January of the next, so month 1 is the NEXT January. */
export const yearOfMonth = (journeyYear: number, m: number) => (m < 2 ? journeyYear + 1 : journeyYear);

/** A month with its year: "2027년 2월" … "2028년 1월", "Jan 2028", "2028年1月", "Th1/2028". */
export function monthWithYear(journeyYear: number, m: number, lang: Lang): string {
  const y = yearOfMonth(journeyYear, m);
  switch (lang) {
    case 'ko':
      return `${y}년 ${m}월`;
    case 'ja':
    case 'zh-CN':
    case 'zh-TW':
      return `${y}年${m}月`;
    case 'vi':
      return `Th${m}/${y}`;
    default:
      return `${EN[m - 1]?.[0]}${EN[m - 1]?.slice(1).toLowerCase()} ${y}`;
  }
}

export const monthsLabel = (months: number[], lang: Lang, sep = ' · ') =>
  months.map(m => monthLabel(m, lang)).join(sep);

/** Like `monthsLabel`, but the month that falls in the next calendar year (January) carries its
 *  year — "4월 · 2028년 1월" — so a 2027 journey's January is never read as January 2027. */
export const journeyMonthsLabel = (journeyYear: number, months: number[], lang: Lang, sep = ' · ') =>
  months.map(m => (yearOfMonth(journeyYear, m) !== journeyYear ? monthWithYear(journeyYear, m, lang) : monthLabel(m, lang))).join(sep);

/** Ticket-style months: always the three-letter English, which is what a boarding pass prints. */
export const ticketMonths = (months: number[]) => months.map(m => EN[m - 1] ?? String(m)).join(' / ');

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
