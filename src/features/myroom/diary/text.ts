/**
 * Diary text is counted the way the server counts it: Unicode code points (Ruby's `first(1000)`),
 * not UTF-16 units. `TextInput maxLength` counts units, so an emoji would cost 2 there and 1 on the
 * server, and the two counters would disagree at the limit (spec 006 R16).
 */
export const DIARY_MAX = 1000;

export const codePoints = (s: string): number => [...s].length;

/** The first `max` code points — never half of a surrogate pair. */
export const clampCodePoints = (s: string, max: number): string => {
  const cps = [...s];
  return cps.length <= max ? s : cps.slice(0, max).join('');
};

/** The server's topic ids (spec 006 R8). An id not listed here is shown as `other`, not dropped:
 *  the server may add topics before the app learns their names. */
export const TOPICS = [
  'self_growth', 'people', 'future', 'work', 'love', 'health', 'money', 'family', 'rest', 'gratitude',
] as const;
export const topicKey = (id: string) =>
  `diary.topic.${(TOPICS as readonly string[]).includes(id) ? id : 'other'}` as const;

/** "YYYY-MM-DD" in the phone's own day — the date a diary is written on. */
export const localDay = (d = new Date()): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** One calendar day either side of a "YYYY-MM-DD". */
export const shiftDay = (day: string, by: number): string => {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + by));
};

/**
 * A "YYYY-MM-DD" in the app language, e.g. "2026년 10월 7일 (수)" / "Wed, October 7, 2026". Read as a
 * calendar date, not an instant: formatted in UTC so no time zone moves it a day.
 */
export const formatDay = (day: string, lang: string): string => {
  const m = day.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return day;
  const at = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  try {
    return new Intl.DateTimeFormat(lang, {
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC',
    }).format(at);
  } catch {
    return day;
  }
};
