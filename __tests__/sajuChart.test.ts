/**
 * The four pillars, computed the way the sister app computes them — including the two clock
 * corrections that decide the hour pillar: Seoul's −30 min and Korean summer time.
 */
import { adjustTime, chartFromFields, computeChart, isSummerTime, locationFor, pillarsText, timePillar } from '../src/features/saju/chart';

describe('summer time', () => {
  it('knows the Korean daylight-saving years', () => {
    expect(isSummerTime(1988, 7, 28)).toBe(true);
    expect(isSummerTime(1987, 10, 11)).toBe(true); // the end day counts
    expect(isSummerTime(1987, 5, 10)).toBe(false); // the start day (02:00) does not
    expect(isSummerTime(1989, 7, 28)).toBe(false);
    expect(isSummerTime(1959, 6, 1)).toBe(true);
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
