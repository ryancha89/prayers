import type { CafeTableInfo } from '../../counseling/types';

/**
 * The table chooser's chips. Since 21-10 (user) every table of the cafe's dining floor is a seat too —
 * Unity names them "table1" … "table7" next to the three corners (bar, lounge, tarot). Ten chips would
 * bury the room, so the corners keep a chip each and the dining tables share ONE: "any free table",
 * sent as CAFE_SIT `any` — Unity seats the player at the nearest free one (only the scene knows where
 * they stand). A particular dining table is chosen by its pin in the room.
 */

/** CAFE_SIT's "the nearest free dining table" (CafeEntry.AnyTable). */
export const ANY_TABLE = 'any';

/** A dining-floor seat (CafeEntry.IsDiningTable): `table` + its number. */
export const isDiningTable = (spot: string): boolean => /^table\d+$/.test(spot);

/** The chips for CAFE_TABLES' rows, in the scene's order: every other seat as itself, then one
 *  `any` chip for the dining tables — taken only when every one of them is. */
export function tableChips(tables: CafeTableInfo[]): CafeTableInfo[] {
  const dining = tables.filter(t => isDiningTable(t.spot));
  const rows = tables.filter(t => !isDiningTable(t.spot));
  if (dining.length > 0) rows.push({ spot: ANY_TABLE, taken: dining.every(t => t.taken) });
  return rows;
}
