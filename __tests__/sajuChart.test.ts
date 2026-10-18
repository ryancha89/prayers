/**
 * The four pillars, computed the way the sister app computes them — including the two clock
 * corrections that decide the hour pillar: Seoul's −30 min and Korean summer time.
 */
import { adjustTime, chartFromFields, computeChart, isSummerTime, locationFor, pillarsText, timePillar } from '../src/features/saju/chart';
import { searchKoreaPlaces } from '../src/features/saju/data/koreaPlaces';

describe('summer time', () => {
  it('knows the Korean daylight-saving years', () => {
    expect(isSummerTime(1988, 7, 28)).toBe(true);
    expect(isSummerTime(1989, 7, 28)).toBe(false);
    expect(isSummerTime(1959, 6, 1)).toBe(true);
  });

  it('switches at the hour the clocks changed, not at midnight', () => {
    // 1987: on at 05-10 02:00, off at 10-11 03:00.
    expect(isSummerTime(1987, 5, 10, 1, 59)).toBe(false);
    expect(isSummerTime(1987, 5, 10, 10, 0)).toBe(true);
    expect(isSummerTime(1987, 10, 11, 2, 30)).toBe(true);
    expect(isSummerTime(1987, 10, 11, 10, 0)).toBe(false);
    // 1948-60 ended at midnight: the listed end day is already standard time.
    expect(isSummerTime(1958, 9, 20, 23, 59)).toBe(true);
    expect(isSummerTime(1958, 9, 21, 10, 0)).toBe(false);
  });

  it('labels summer time only when it moved a known birth clock', () => {
    expect(computeChart({ year: 1987, month: 5, day: 10, hour: 10, minute: 0 })!.summerTime).toBe(true);
    expect(computeChart({ year: 1987, month: 10, day: 11, hour: 10, minute: 0 })!.summerTime).toBe(false);
    expect(computeChart({ year: 1988, month: 7, day: 28 })!.summerTime).toBe(false);
  });

  it('takes an hour off the clock after the longitude correction', () => {
    expect(adjustTime(18, 0, '서울 -30분', true)).toEqual([16, 30]);
    expect(adjustTime(18, 0, '서울 -30분', false)).toEqual([17, 30]);
    expect(adjustTime(0, 10, '서울 -30분', false)).toEqual([23, 40]);
  });
});

describe('the chart', () => {
  it('reads 1988-07-28 18:00 in Seoul as 申시, not 酉시, because summer time was on', () => {
    const c = computeChart({ year: 1988, month: 7, day: 28, hour: 18, minute: 0 })!;
    expect(c.summerTime).toBe(true);
    expect(c.location).toBe('서울 -30분');
    expect(c.adjusted).toEqual({ hour: 16, minute: 30 });
    expect(pillarsText(c)).toBe('戊辰 己未 甲申 壬申');

    const plain = computeChart({ year: 1988, month: 7, day: 28, hour: 18, minute: 0, summerTime: false })!;
    expect(pillarsText(plain)).toBe('戊辰 己未 甲申 癸酉');
  });

  it('agrees with the server calendar on a plain date and time', () => {
    // The same person the earlier tests used: 1995-04-12 12:30 → 戊午 hour, as the server said.
    expect(pillarsText(chartFromFields('1995-04-12', '12:30')!)).toBe('乙亥 庚辰 癸酉 戊午');
  });

  it('turns the month on the solar term’s exact minute', () => {
    // 立秋 1988-08-07 15:20 KST. Before it the month is still 己未; after it 庚申.
    const before = computeChart({ year: 1988, month: 8, day: 7, hour: 10, minute: 0 })!;
    const after = computeChart({ year: 1988, month: 8, day: 7, hour: 20, minute: 0 })!;
    expect(before.zodiacMonth).toBe('己未');
    expect(after.zodiacMonth).toBe('庚申');
    expect(before.zodiacDay).toBe('甲午');
  });

  it('gives 23:30 to the next day’s 子 unless asked to keep it', () => {
    const rolled = computeChart({ year: 2000, month: 1, day: 1, hour: 23, minute: 30 })!;
    const kept = computeChart({ year: 2000, month: 1, day: 1, hour: 23, minute: 30, nightMouse: true })!;
    const plain = computeChart({ year: 2000, month: 1, day: 1, hour: 12, minute: 0 })!;
    expect(rolled.zodiacDay).not.toBe(plain.zodiacDay);
    expect(kept.zodiacDay).toBe(plain.zodiacDay);
    expect(rolled.zodiacTime?.endsWith('子')).toBe(true);
  });

  it('leaves the hour out when the time is unknown', () => {
    const c = chartFromFields('1988-07-28')!;
    expect(c.timeUnknown).toBe(true);
    expect(c.zodiacTime).toBeNull();
    expect(pillarsText(c)).toBe('戊辰 己未 甲申');
  });

  it('uses the 127.5°E standard when the country did', () => {
    expect(locationFor(1958, 6, 1)).toBe('서울 0분');
    expect(locationFor(1988, 7, 28)).toBe('서울 -30분');
    expect(timePillar(0, '甲子')).toBe('甲子');
    expect(timePillar(23, '乙丑')).toBe('丙子');
  });

  it('refuses what the table cannot answer', () => {
    expect(computeChart({ year: 1850, month: 1, day: 1 })).toBeNull();
    expect(chartFromFields('1995-13-01')).toBeNull();
  });
});

// 10-17: the birthplace's longitude sets the clock correction (user: "태어난곳 검색 … 써머타임도 계산").
describe('birthplace correction', () => {
  it('reads the hour at the birthplace’s sun, then takes summer time off', () => {
    // 1988-07-28 12:00 is summer time. Seoul (no place) keeps the old −30 min.
    const seoul = chartFromFields('1988-07-28', '12:00')!;
    expect([seoul.offsetMinutes, seoul.summerTime, seoul.adjusted]).toEqual([-30, true, { hour: 10, minute: 30 }]);
    // Mokpo 126.39°E under 135°E: −34 min, then −1 h.
    const mokpo = chartFromFields('1988-07-28', '12:00', '목포')!;
    expect([mokpo.offsetMinutes, mokpo.summerTime, mokpo.adjusted]).toEqual([-34, true, { hour: 10, minute: 26 }]);
  });

  it('agrees with the sister app’s fixed Busan minutes under both meridians', () => {
    expect(chartFromFields('1990-03-10', '08:00', '부산')!.offsetMinutes).toBe(-24); // 135°E
    expect(chartFromFields('1958-03-10', '08:00', '부산')!.offsetMinutes).toBe(6); // 127.5°E years
  });

  it('an unknown place name falls back to Seoul', () => {
    expect(chartFromFields('1990-03-10', '08:00', '어딘가')!.offsetMinutes).toBe(-30);
  });
});

describe('searchKoreaPlaces', () => {
  it('finds by name, names starting with the query first, and by province', () => {
    expect(searchKoreaPlaces('전주')[0].name).toBe('전주');
    expect(searchKoreaPlaces('광주').map(p => p.name).slice(0, 2)).toEqual(['광주', '광주(경기)']);
    expect(searchKoreaPlaces('제주').map(p => p.name)).toEqual(['제주', '서귀포']);
    expect(searchKoreaPlaces('경남').length).toBeGreaterThan(5);
    expect(searchKoreaPlaces('  ')).toEqual([]);
  });
});
