/**
 * 사주 four pillars, computed on the phone — a port of saju_front's `SearchSaju`
 * (src/providers/sajuProvider.js), the "fromLocal" reading that app has shipped for years.
 *
 * Why here and not only on the server: the 아카이브 stores other people (a partner, a parent) with
 * their birth data so a counsellor can read the two charts together, and the pillars should be
 * the same ones the player would get in the sister app for the same person. That app's rules
 * are the reference, so they are reproduced rather than re-derived:
 *
 *   - Day pillar: 60갑자 counted from the month's first solar-term row (the same table).
 *   - Month/year pillar: the solar term's exact time decides a birth on the term's day
 *     (before 절입 = previous month; on 立春 also the previous year).
 *   - Clock correction: longitude (Seoul −30 min under the 135°E standard) THEN Korean summer
 *     time (1948-51, 1955-60, 1987-88: −1 h). Auto-detected from the date; a caller may force it.
 *   - 야자시 (night 子時, 23:00–00:59) is the NEXT day's 子 unless `nightMouse`.
 *
 * Solar dates only, 1900–2099 (the table's range). Lunar input is converted by the sister app
 * before it gets here; the archive's forms ask for the solar date.
 */
import TERMS from './data/solarTerms.json';
import TERM_TIMES from './data/solarTermTimes.json';

export const GABJA = [
  '甲子', '乙丑', '丙寅', '丁卯', '戊辰', '己巳', '庚午', '辛未', '壬申', '癸酉',
  '甲戌', '乙亥', '丙子', '丁丑', '戊寅', '己卯', '庚辰', '辛巳', '壬午', '癸未',
  '甲申', '乙酉', '丙戌', '丁亥', '戊子', '己丑', '庚寅', '辛卯', '壬辰', '癸巳',
  '甲午', '乙未', '丙申', '丁酉', '戊戌', '己亥', '庚子', '辛丑', '壬寅', '癸卯',
  '甲辰', '乙巳', '丙午', '丁未', '戊申', '己酉', '庚戌', '辛亥', '壬子', '癸丑',
  '甲寅', '乙卯', '丙辰', '丁巳', '戊午', '己未', '庚申', '辛酉', '壬戌', '癸亥',
];
const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** The sister app's location labels, with the minutes they add to the clock. */
export type Location =
  | '서울 -30분'
  | '서울 0분'
  | '동해안 -20분'
  | '동해안 10분'
  | '부산 -24분'
  | '부산 +6분'
  | '오사카 0분'
  | '도쿄 +30분'
  | '북경 0분'
  | '대만 0분';

const LOCATION_MINUTES: Record<Location, number> = {
  '서울 -30분': -30,
  '서울 0분': 0,
  '동해안 -20분': -20,
  '동해안 10분': 10,
  '부산 -24분': -24,
  '부산 +6분': 6,
  '오사카 0분': 0,
  '도쿄 +30분': 30,
  '북경 0분': 0,
  '대만 0분': 0,
};

export interface ChartInput {
  year: number;
  month: number;
  day: number;
  /** Absent = time unknown: no hour pillar, and the day is read as-is. */
  hour?: number | null;
  minute?: number | null;
  /** Default: Seoul under the standard the country used on that date (`locationFor`). */
  location?: Location;
  /** Default: `isSummerTime(date)`. */
  summerTime?: boolean;
  /** 야자시 as the same day's 子 rather than the next day's. */
  nightMouse?: boolean;
}

export interface Chart {
  zodiacYear: string;
  zodiacMonth: string;
  zodiacDay: string;
  zodiacTime: string | null;
  /** The clock after longitude and summer-time correction — what the hour pillar was read from. */
  adjusted: { hour: number; minute: number } | null;
  summerTime: boolean;
  location: Location;
  timeUnknown: boolean;
}

// ── Korean summer time ────────────────────────────────────────────────────────────────────────
// Verbatim from the sister app (which cites ko.wikipedia 일광 절약 시간제#대한민국): a date-only
// check against local-midnight of the birth date, so the 1987/88 start days (02:00) are out and
// their end days (03:00) are in — exactly as the app has always answered.
const SUMMER_RANGES: [number, number, number, number, number, number, number, number][] = [
  // [startY, startM, startD, startH, endY, endM, endD, endH]
  [1948, 6, 1, 0, 1948, 9, 13, 0],
  [1949, 4, 3, 0, 1949, 9, 11, 0],
  [1950, 4, 1, 0, 1950, 9, 10, 0],
  [1951, 5, 6, 0, 1951, 9, 9, 0],
  [1955, 5, 5, 0, 1955, 9, 9, 0],
  [1956, 5, 20, 0, 1956, 9, 30, 0],
  [1957, 5, 5, 0, 1957, 9, 22, 0],
  [1958, 5, 4, 0, 1958, 9, 21, 0],
  [1959, 5, 3, 0, 1959, 9, 20, 0],
  [1960, 5, 1, 0, 1960, 9, 18, 0],
  [1987, 5, 10, 2, 1987, 10, 11, 3],
  [1988, 5, 8, 2, 1988, 10, 9, 3],
];

export function isSummerTime(year: number, month: number, day: number): boolean {
  const t = Date.UTC(year, month - 1, day);
  return SUMMER_RANGES.some(
    ([sy, sm, sd, sh, ey, em, ed, eh]) => t >= Date.UTC(sy, sm - 1, sd, sh) && t <= Date.UTC(ey, em - 1, ed, eh),
  );
}

/** Which standard meridian Korea kept on that date (`calculateTimezone` in the sister app):
 *  127.5°E ("kr", no correction) until 1910-08-29 and 1954-03-21 … 1961-08-09; 135°E otherwise,
 *  which puts Seoul 30 minutes behind the clock. */
export function locationFor(year: number, month: number, day: number): Location {
  const kr =
    year < 1910 ||
    (year === 1910 && (month < 8 || (month === 8 && day <= 29))) ||
    (year > 1954 && year < 1961) ||
    (year === 1954 && (month > 3 || (month === 3 && day >= 21))) ||
    (year === 1961 && (month < 8 || (month === 8 && day <= 9)));
  return kr ? '서울 0분' : '서울 -30분';
}

/** `adjutTime` — longitude minutes, then −1 h for summer time, carrying across the hour and
 *  wrapping at midnight the way the original does. */
export function adjustTime(hour: number, minute: number, location: Location, summerTime: boolean): [number, number] {
  let h = hour;
  let m = minute + LOCATION_MINUTES[location];
  if (m < 0) {
    if (m < -60) {
      h -= 2;
      m += 120;
    } else {
      m += 60;
      h -= 1;
    }
  } else if (m >= 60) {
    m -= 60;
    h += 1;
    if (h === 24) h = 0;
  }
  if (summerTime) h -= 1;
  if (h === -1) h = 23;
  else if (h === -2) h = 22;
  return [h, m];
}

const isNextDay = (location: Location, hour: number, adjustedHour: number): boolean =>
  location === '도쿄 +30분'
    ? (hour === 23 || hour === 22) && (adjustedHour === 23 || adjustedHour === 0)
    : hour === 23 && (adjustedHour === 23 || adjustedHour === 0);

/** 오서둔법: the hour stem follows the day stem; branches are 2-hour blocks from 子 (23:00). */
export function timePillar(adjustedHour: number, zodiacDay: string): string {
  const dayStem = STEMS.indexOf(zodiacDay[0]);
  const branch = Math.floor((adjustedHour + 1) / 2) % 12;
  const stem = ((dayStem % 5) * 2 + branch) % 10;
  return `${STEMS[stem]}${BRANCHES[branch]}`;
}

type TermRow = [number, number, number, string, string, string, string];
type TimeRow = [number, number, number, string];

const prev = (ganji: string) => GABJA[(GABJA.indexOf(ganji) - 1 + 60) % 60];
const next = (ganji: string) => GABJA[(GABJA.indexOf(ganji) + 1) % 60];

export function computeChart(input: ChartInput): Chart | null {
  const { year, month, day } = input;
  if (year < 1900 || year > 2099) return null;
  const timeKnown = input.hour !== null && input.hour !== undefined;
  const hour = timeKnown ? Number(input.hour) : null;
  const minute = timeKnown ? Number(input.minute ?? 0) : 0;
  const location = input.location ?? locationFor(year, month, day);
  const summerTime = input.summerTime ?? isSummerTime(year, month, day);
  const nightMouse = input.nightMouse === true;

  // The month's first solar-term row (節, always within the first ten days).
  const base = (TERMS as unknown as TermRow[]).find(r => r[0] === year && r[1] === month && r[2] <= 10);
  if (!base) return null;
  const [, , baseDay, baseYear, baseMonth, baseDayGanji] = base;

  const gap = day - baseDay;
  let index = (GABJA.indexOf(baseDayGanji) + gap) % 60;
  if (index < 0) index += 60;

  let zodiacYear = baseYear;
  let zodiacMonth = baseMonth;
  let zodiacDay = GABJA[index];

  const termRow = (TERM_TIMES as unknown as TimeRow[]).find(r => r[0] === year && r[1] === month && r[2] === baseDay);
  // The table writes the KST wall clock with a Z suffix; the birth clock is built the same way,
  // so the two compare on one axis.
  const termTime = termRow ? Date.parse(termRow[3]) : null;

  let adjusted: [number, number] | null = null;
  if (hour !== null) adjusted = adjustTime(hour, minute, location, summerTime);

  let targetTime = Date.UTC(year, month - 1, day, adjusted ? adjusted[0] : 23, adjusted ? adjusted[1] : 0);

  const previousDay = hour !== null && adjusted !== null && (adjusted[0] === 22 || adjusted[0] === 23) && hour === 0;
  if (previousDay) targetTime -= 24 * 60 * 60 * 1000;
  if (hour !== null && adjusted !== null && adjusted[0] === 22 && previousDay) zodiacDay = prev(zodiacDay);

  if (gap <= 0 && month === 2 && termTime !== null && targetTime < termTime) zodiacYear = prev(baseYear);
  if (gap <= 0 && termTime !== null && targetTime < termTime) zodiacMonth = prev(baseMonth);

  let nightBase: string | undefined;
  const isNext = hour !== null && adjusted !== null ? isNextDay(location, hour, adjusted[0]) : false;
  if (isNext) {
    if (!nightMouse) zodiacDay = next(zodiacDay);
    else nightBase = next(zodiacDay);
  } else if (nightMouse) {
    nightBase = zodiacDay;
    zodiacDay = GABJA[(index - 1 + 60) % 60];
  }

  const hourBase = nightMouse ? nightBase! : zodiacDay;
  const zodiacTime = hour !== null && adjusted !== null ? timePillar(adjusted[0], hourBase) : null;

  return {
    zodiacYear,
    zodiacMonth,
    zodiacDay,
    zodiacTime,
    adjusted: adjusted ? { hour: adjusted[0], minute: adjusted[1] } : null,
    summerTime,
    location,
    timeUnknown: hour === null,
  };
}

/** "乙亥 庚辰 癸酉 戊午" — year month day hour, hour left out when unknown. */
export const pillarsText = (c: Chart): string =>
  [c.zodiacYear, c.zodiacMonth, c.zodiacDay, c.zodiacTime].filter(Boolean).join(' ');

/** From the archive's own fields: "1988-07-28", "18:00" (optional). */
export function chartFromFields(birthDate: string, birthTime?: string): Chart | null {
  const m = birthDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const t = (birthTime ?? '').match(/^(\d{2}):(\d{2})$/);
  return computeChart({
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: t ? Number(t[1]) : null,
    minute: t ? Number(t[2]) : null,
  });
}
