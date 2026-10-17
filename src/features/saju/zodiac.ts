import type { TranslationKey } from '../../shared/i18n';

/**
 * The Western star sign (별자리) for a birth date — shown on 내 정보 next to the saju. Tropical
 * signs by the usual calendar cut-offs; the day a sign starts belongs to it (12-22 is Capricorn).
 * The year and the birth time play no part, so a chart without a time still has a sign.
 */
export interface ZodiacSign {
  id: string;
  glyph: string;
  label: TranslationKey;
}

/** Each sign with the month and day it starts on, in calendar order from Capricorn's January. */
const STARTS: readonly [month: number, day: number, id: string, glyph: string][] = [
  [1, 20, 'aquarius', '♒'],
  [2, 19, 'pisces', '♓'],
  [3, 21, 'aries', '♈'],
  [4, 20, 'taurus', '♉'],
  [5, 21, 'gemini', '♊'],
  [6, 22, 'cancer', '♋'],
  [7, 23, 'leo', '♌'],
  [8, 23, 'virgo', '♍'],
  [9, 23, 'libra', '♎'],
  [10, 24, 'scorpio', '♏'],
  [11, 23, 'sagittarius', '♐'],
  [12, 22, 'capricorn', '♑'],
];

/** `YYYY-MM-DD` → its sign; null for a missing or malformed date. */
export function zodiacOf(birthDate: string | null | undefined): ZodiacSign | null {
  const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(birthDate ?? '');
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // The last sign that started on or before this date; before 01-20 it is still December's Capricorn.
  let found = STARTS[STARTS.length - 1];
  for (const s of STARTS) if (month > s[0] || (month === s[0] && day >= s[1])) found = s;
  const [, , id, glyph] = found;
  return { id, glyph, label: `zodiac.${id}` as TranslationKey };
}
