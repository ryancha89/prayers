import type { TranslationKey } from '../../../shared/i18n';
import type { MyRoomLayout, MyRoomLayoutReason, MyRoomOwned, MyRoomSelect } from '../../counseling/types';
import type { CatalogItem, CatalogTheme } from '../api/myRoomApi';

/**
 * Decorate mode's arithmetic (spec 005 T025), kept out of the components so it can be pinned:
 * what the tray may still offer, what a selected piece may be swapped for, and what a refusal is
 * called. Every count here is the server's `owned` against the layout Unity last reported — the
 * room itself (geometry, validity) is Unity's and is never judged here.
 */

/** Copies of each piece standing in `layout`. A layout Unity has not spelled out (`items: null`, the
 *  default room) counts nothing — Unity reports concrete items once edit mode is on. */
export function placedCounts(layout: MyRoomLayout | null | undefined): Record<string, number> {
  const n: Record<string, number> = {};
  for (const it of layout?.items ?? []) n[it.item] = (n[it.item] ?? 0) + 1;
  return n;
}

/** Owned copies minus placed copies, per piece, for pieces with at least one copy left. */
export function copiesLeft(owned: MyRoomOwned | null | undefined, layout: MyRoomLayout | null | undefined): Record<string, number> {
  const placed = placedCounts(layout);
  const left: Record<string, number> = {};
  for (const [id, copies] of Object.entries(owned?.items ?? {})) {
    const l = copies - (placed[id] ?? 0);
    if (l > 0) left[id] = l;
  }
  return left;
}

/**
 * What the selected piece can be swapped for: an owned piece with a copy left, of the same `kind`
 * (it fits the same place) AND the same catalog `category` (a lamp for a lamp, not a lamp for a
 * sofa), other than the piece itself. A piece the catalog does not list (off sale, unknown to this
 * build's names) has no category to match and is never offered.
 */
export function swapCandidates(
  selected: MyRoomSelect | null,
  owned: MyRoomOwned | null | undefined,
  layout: MyRoomLayout | null | undefined,
  catalog: CatalogItem[] | null | undefined,
  known: (id: string) => boolean = () => true,
): string[] {
  if (!selected || !selected.uid || !catalog) return [];
  const byId = new Map(catalog.map(c => [c.id, c]));
  const category = byId.get(selected.item)?.category;
  if (!category) return [];
  const left = copiesLeft(owned, layout);
  return Object.keys(left).filter(id => {
    const c = byId.get(id);
    return id !== selected.item && !!c && c.kind === selected.kind && c.category === category && known(id);
  });
}

/** The reason Done is disabled, or an ADD came back, in the player's words. */
export function reasonKey(reason: MyRoomLayoutReason | string): TranslationKey | null {
  switch (reason) {
    case 'overlap': return 'myroom.edit.reason.overlap';
    case 'bounds': return 'myroom.edit.reason.bounds';
    case 'blocked_path': return 'myroom.edit.reason.blockedPath';
    case 'no_space': return 'myroom.edit.reason.noSpace';
    case 'unknown_item': return 'myroom.edit.reason.unknownItem';
    case 'unknown_theme': return 'myroom.edit.reason.unknownTheme';
    case '': return null;
    // A reason a newer player build invented: still a refusal, said generically.
    default: return 'myroom.edit.reason.other';
  }
}

/** Reasons that answer one ADD or one THEME rather than describe the room: a note, not a Done
 *  state. (`unknown_theme`: this player build has no material set for it; the old skin stays.) */
export const isAddRefusal = (reason: string) => reason === 'no_space' || reason === 'unknown_item' || reason === 'unknown_theme';

/* ---- skins (themes), spec 005 US3 ---------------------------------------------------------- */

/** A skin the tray can offer: from the catalog (on sale) or owned (on sale or not). `price` is
 *  null for one the catalog does not list — it can only be owned then. */
export interface Skin {
  id: string;
  price: number | null;
  owned: boolean;
}

/** Owned = in the account's `owned.themes`, or a starter (everyone has Basic, no row needed). */
export function themeOwned(id: string, owned: MyRoomOwned | null | undefined, themes: CatalogTheme[] | null | undefined): boolean {
  return (owned?.themes ?? []).includes(id) || !!themes?.find(th => th.id === id)?.starter;
}

/** The catalog's themes in its order, then owned themes it does not list. A theme this build has no
 *  name for is left out, as the shop does. */
export function skinList(
  themes: CatalogTheme[] | null | undefined,
  owned: MyRoomOwned | null | undefined,
  known: (id: string) => boolean = () => true,
): Skin[] {
  const list: Skin[] = (themes ?? []).map(th => ({ id: th.id, price: th.price, owned: themeOwned(th.id, owned, themes) }));
  for (const id of owned?.themes ?? []) if (!list.some(s => s.id === id)) list.push({ id, price: null, owned: true });
  return list.filter(s => known(s.id));
}

/** A skin's swatch: a few colours from its palette, until there is art. Unknown ids are neutral. */
const SWATCHES: Record<string, string[]> = {
  basic: ['#F3E6D0', '#E8B4A8', '#C9934E'],          // cream, blush, honey
  modern: ['#CFC8BD', '#9DA3A6', '#93A58C', '#3A3D40'], // greige, ash, sage, charcoal
  nature: ['#7E9C6B', '#B7C99A', '#7A5A3C'],          // moss, fern, bark
  fantasy: ['#3B3478', '#D9B45A', '#7A4A7E'],         // indigo, gold, plum
};
export const swatchFor = (id: string): string[] => SWATCHES[id] ?? ['#BDB7AE', '#8E8A84', '#5E5B57'];

/* ---- what counts as a change (Undo, Cancel's question, Done without a PUT) ------------------ */

const r3 = (v: number) => Math.round(v * 1000) / 1000;
/** A layout as the room would look: pieces by uid, positions to the millimetre the server keeps,
 *  turns modulo 360 (−15 and 345 are the same chair). List order does not matter. */
function canonical(l: MyRoomLayout | null | undefined) {
  if (!l) return null;
  return {
    theme: l.theme,
    items: l.items == null ? null : [...l.items]
      .map(i => ({
        uid: i.uid,
        item: i.item,
        slot: i.slot ?? null,
        pos: i.pos ? { x: r3(i.pos.x), z: r3(i.pos.z) } : null,
        rot: r3(((r3(i.rot) % 360) + 360) % 360),
      }))
      .sort((a, b) => (a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0)),
  };
}

export function layoutsEqual(a: MyRoomLayout | null | undefined, b: MyRoomLayout | null | undefined): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** How many undo steps are kept. */
export const UNDO_DEPTH = 20;

/* ---- the top bar's line: what the player can do right now ---------------------------------- */

export type DecorHint =
  | { kind: 'invalid'; reason: TranslationKey }
  | { kind: 'skin' }
  | { kind: 'move' }
  | { kind: 'fixed' }
  | { kind: 'pick' };

/** Most urgent first: a room that cannot be saved, then a skin that cannot be kept, then what the
 *  selection allows, then how to select. */
export function decorHint(
  pending: { valid: boolean; reason: string } | null,
  selected: MyRoomSelect | null,
  unownedSkin: unknown,
): DecorHint {
  if (pending && !pending.valid) return { kind: 'invalid', reason: reasonKey(pending.reason || 'other')! };
  if (unownedSkin) return { kind: 'skin' };
  if (selected && selected.uid) return { kind: selected.canMove ? 'move' : 'fixed' };
  return { kind: 'pick' };
}

/** Copies standing in the room, and copies in storage (named pieces only, as the tray shows). */
export function roomCounts(owned: MyRoomOwned | null | undefined, layout: MyRoomLayout | null | undefined, known: (id: string) => boolean = () => true) {
  const left = copiesLeft(owned, layout);
  return {
    room: layout?.items ? layout.items.length : null,
    storage: Object.entries(left).filter(([id]) => known(id)).reduce((n, [, c]) => n + c, 0),
  };
}
