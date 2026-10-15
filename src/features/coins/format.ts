import type { TranslationKey } from '../../shared/i18n';

/**
 * How a coin count and a won price are written, everywhere. One place, so the pill, the shop, the
 * journey's lock and the mailbox cannot drift into four styles (two of them used to print the raw
 * number while the rest grouped thousands).
 */

/** Coins with the device's digit grouping ("1,200"). A missing or non-finite count reads 0. */
export function formatCoins(n: number | null | undefined): string {
  return (typeof n === 'number' && Number.isFinite(n) ? n : 0).toLocaleString();
}

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** Our own won price ("9,900원" / "₩9,900") — shown when the store has no price string of its own.
 *  Always ko-KR grouping: the amount is in won whatever the interface language. */
export function formatKrw(t: Translate, krw: number): string {
  return t('journey.pass.krw', { price: krw.toLocaleString('ko-KR') });
}
