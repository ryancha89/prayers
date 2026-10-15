import { starSign, zodiacAnimal } from '../src/features/saju/signs';
import { chartFromFields } from '../src/features/saju/chart';

describe('star sign', () => {
  it.each([
    [1, 19, 'Capricorn'], [1, 20, 'Aquarius'], [3, 20, 'Pisces'], [3, 21, 'Aries'],
    [12, 5, 'Sagittarius'], [12, 21, 'Sagittarius'], [12, 22, 'Capricorn'], [8, 23, 'Virgo'],
  ])('%i/%i → %s', (m, d, name) => {
    expect(starSign(m, d, 'en').name).toBe(name);
  });

  it('speaks the player’s language', () => {
    expect(starSign(12, 5, 'ko').name).toBe('사수자리');
  });
});

describe('zodiac animal', () => {
  it('is the year pillar’s branch, so it turns at 立春 with the pillars', () => {
    // 1989-12-05: 己巳 year → Snake.
    expect(zodiacAnimal(chartFromFields('1989-12-05')!.zodiacYear, 'en')?.name).toBe('Snake');
    // 1990-02-01 is before 立春: still the 己巳 year.
    expect(zodiacAnimal(chartFromFields('1990-02-01')!.zodiacYear, 'en')?.name).toBe('Snake');
    expect(zodiacAnimal(chartFromFields('1990-03-01')!.zodiacYear, 'en')?.name).toBe('Horse');
  });

  it('shows nothing for a date still being typed', () => {
    expect(chartFromFields('1989-12-0')).toBeNull();
    expect(chartFromFields('1989-1')).toBeNull();
  });
});
