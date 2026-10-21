import type { CafeTableInfo } from '../../counseling/types';

/**
 * What the player came into the coffee shop for, chosen at the World door (20-10, user: "chọn ngay
 * từ ngoài rồi có người dắt vô quán mới hợp lý").
 *
 *   coffee  the coffee's confirmation opens as they sit, at whichever table they chose
 *   tarot   the reader list opens as they sit at the tarot table (user, 20-10: "let user firstly
 *           sit down on the table and select consultant"); at another table, the plain menu
 *   (none)  walk in and look around
 *
 * Since 21-10 (PM: "could you let user select tables to sit down?") the choice no longer seats the
 * player by itself: they pick the table — a pin in the room, or the list — and the door's choice only
 * SUGGESTS one (suggestTable), which the list puts first and Unity's pin breathes for.
 */
export type CafeIntent = { kind: 'coffee' } | { kind: 'tarot' };

/** The table where readings happen. Tarot chosen at any other table walks the player over first. */
export const TAROT_TABLE = 'tarot';

/**
 * The tables to suggest, best first. Coffee: the lounge sofa (the bar seat is beside the counter
 * staff); tarot: the tarot corner. Every seat has a table rig, so either service works at any of them.
 */
export const SUGGEST_ORDER: Record<CafeIntent['kind'], string[]> = {
  coffee: ['lounge', 'bar', 'tarot'],
  tarot: [TAROT_TABLE, 'lounge', 'bar'],
};

/** The order CAFE_INIT `suggest` carries for this intent (none = no suggestion). */
export function suggestOrder(intent: CafeIntent | null): string[] {
  return intent ? SUGGEST_ORDER[intent.kind] : [];
}

/** The table to suggest: the first of the intent's order the scene has and nobody else sits at.
 *  Unity picks its breathing pin by the same rule. */
export function suggestTable(intent: CafeIntent | null, tables: CafeTableInfo[]): string | null {
  return suggestOrder(intent).find(id => tables.some(t => t.spot === id && !t.taken)) ?? null;
}

/** The tables as the chooser lists them: the suggestion first, then the scene's order. */
export function tableChoices(tables: CafeTableInfo[], suggested: string | null): CafeTableInfo[] {
  if (!suggested) return tables;
  const first = tables.filter(t => t.spot === suggested);
  return [...first, ...tables.filter(t => t.spot !== suggested)];
}

/** Picking Tarot at `spot` means walking to the tarot table first: the scene has one and the
 *  player is not at it. */
export function needsTarotMove(spot: string, spots: string[]): boolean {
  return spots.includes(TAROT_TABLE) && spot !== TAROT_TABLE;
}
