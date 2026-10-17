import { zodiacOf } from '../src/features/saju/zodiac';

describe('zodiacOf', () => {
  it('reads the sign from month and day', () => {
    expect(zodiacOf('1989-12-05')?.id).toBe('sagittarius');
    expect(zodiacOf('1995-04-12')?.id).toBe('aries');
    expect(zodiacOf('2000-07-30')?.label).toBe('zodiac.leo');
  });

  it('gives the cut-off day to the sign that starts on it', () => {
    expect(zodiacOf('1990-12-21')?.id).toBe('sagittarius');
    expect(zodiacOf('1990-12-22')?.id).toBe('capricorn');
    expect(zodiacOf('1990-01-19')?.id).toBe('capricorn');
    expect(zodiacOf('1990-01-20')?.id).toBe('aquarius');
    expect(zodiacOf('1990-03-20')?.id).toBe('pisces');
    expect(zodiacOf('1990-03-21')?.id).toBe('aries');
  });

  it('has no sign for a missing or malformed date', () => {
    expect(zodiacOf(undefined)).toBeNull();
    expect(zodiacOf('')).toBeNull();
    expect(zodiacOf('1990-13-01')).toBeNull();
    expect(zodiacOf('12/05/1989')).toBeNull();
  });
});
