/**
 * How a month card reads in the cabin (JOURNEY_STATE): `rough` makes the ride jolt on a hard month,
 * `mood` is the counsellor's face (character-setup sheet 06-10) — the same reading of the card, plus
 * the good side.
 */
type Card = { stars: number; months: number[] } | null | undefined;

/** 0-1: 1★ = 1; 2★ or a caution month = 0.5; else 0. */
export const roughOf = (card: Card, caution: number[] = []) =>
  !card ? 0 : card.stars <= 1 ? 1 : card.stars <= 2 || card.months.some(m => caution.includes(m)) ? 0.5 : 0;

/** 1★ = sad; 2★ or a caution month = serious; a best month or 4-5★ = happy; else ''. */
export const moodOf = (card: Card, best: number[] = [], caution: number[] = []): '' | 'happy' | 'serious' | 'sad' => {
  if (!card) return '';
  const rough = roughOf(card, caution);
  if (rough >= 1) return 'sad';
  if (rough > 0) return 'serious';
  return card.stars >= 4 || card.months.some(m => best.includes(m)) ? 'happy' : '';
};
