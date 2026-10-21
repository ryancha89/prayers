/**
 * Where readings happen. Since 21-10 (user) nothing is asked at the cafe's door: the player sits at any
 * free table and orders from its menu. Coffee is served wherever they sit; Tarot picked at any other
 * table walks them to this one first (PM 21-10: "if user select tarot consultation, should move to
 * the tarot table"), and the readers open there.
 */
export const TAROT_TABLE = 'tarot';

/** Picking Tarot at `spot` means walking to the tarot table first: the scene has one and the
 *  player is not at it. */
export function needsTarotMove(spot: string, spots: string[]): boolean {
  return spots.includes(TAROT_TABLE) && spot !== TAROT_TABLE;
}
