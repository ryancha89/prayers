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

/** A month with its year. Since server v2 (01-10) the months are the journey year's calendar
 *  January–December, so the year is always the journey's: "2027년 1월", "Jan 2027", "2027年1月",
 *  "Th1/2027". (Before it they ran 입춘 to 입춘 and month 1 was the next January.) */
export function monthWithYear(journeyYear: number, m: number, lang: Lang): string {
  const y = journeyYear;
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

/** Ticket-style months: always the three-letter English, which is what a boarding pass prints. */
export const ticketMonths = (months: number[]) => months.map(m => EN[m - 1] ?? String(m)).join(' / ');

export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
