/**
 * The creator's outfit catalog (04-11, the "Outfit" step redone). Each gender has ONE rigged player
 * body (xb_f01, xb_m01). Its outfit is TWO SLOTS — a top and a bottom — and each slot holds an item
 * with an optional variant:
 *
 *   item     `orig` (the artist's own piece for that slot: his shirt jacket / trousers, her cardigan /
 *            skirt) or a garment id of that body (a new mesh on the rig, Saju `tools/outfits/<garment>`)
 *   variant  `#RRGGBB` — a tint from OUTFIT_COLORS, valid on EVERY item (Unity's OutfitTint multiplies
 *            a grey copy of the piece's texture, so folds and stripes survive — mid-tones that read as
 *            cloth), or a painted set id — a repainted texture of the artist's own pieces (Saju
 *            `tools/outfits/gen_outfits.py`), valid ONLY on `orig`.
 *
 * Stored in `playerOutfit` (≤ 64 chars) as `t=<item>[:<variant>];b=<item>[:<variant>]`; a part that is
 * `orig` with no variant is left out, so the artist's own look is "". Shared with Unity (OutfitTint /
 * OutfitSets / OutfitGarments) and Rails (the settings column) — change it in all three.
 *
 * Older values still read (parseOutfit): "" · "#RRGGBB" · "set:<painted>" · "set:<garment>" ·
 * "s=S;t=T;b=B" (the 02-11 three-part form; S became the variant of each slot left on `orig`).
 */
export const OUTFIT_COLORS: { hex: string; swatch: string }[] = [
  { hex: '', swatch: '' },            // the item's own colour (drawn as a split swatch)
  { hex: '#EDE4D0', swatch: '#EDE4D0' }, // ivory
  { hex: '#C9AE85', swatch: '#C9AE85' }, // sand
  { hex: '#8FA48A', swatch: '#8FA48A' }, // sage
  { hex: '#2E3A5C', swatch: '#2E3A5C' }, // navy
  { hex: '#7A2E3B', swatch: '#7A2E3B' }, // burgundy
  { hex: '#3E3E44', swatch: '#3E3E44' }, // charcoal
  { hex: '#D49AA2', swatch: '#D49AA2' }, // dusty pink
  { hex: '#A99BC9', swatch: '#A99BC9' }, // lavender
];

/** The id of the artist's own piece in either slot. */
export const ORIG = 'orig';
/** The stored value's cap (the settings column). */
export const OUTFIT_MAX_LENGTH = 64;

export type Slot = 'top' | 'bottom';
export type ItemRef = { id: string; variant: string };
export type Outfit = { top: ItemRef; bottom: ItemRef };

/** One tile of the Clothes tab: `orig` or a garment, with its square thumbnail. */
export type OutfitItem = { id: string; thumb: number };
/** One card of the Sets tab: a full look, both parts set in one tap, with its portrait thumbnail. */
export type OutfitSet = { id: string; top: ItemRef; bottom: ItemRef; thumb: number };

export type BodyCatalog = {
  tops: OutfitItem[];
  bottoms: OutfitItem[];
  /** The painted sets of this body — variants of `orig` only. */
  painted: string[];
  sets: OutfitSet[];
};

const ref = (id: string, variant = ''): ItemRef => ({ id, variant });
const paintedSet = (id: string, thumb: number): OutfitSet => ({ id, top: ref(ORIG, id), bottom: ref(ORIG, id), thumb });
const set = (id: string, top: string, bottom: string, thumb: number): OutfitSet => ({ id, top: ref(top), bottom: ref(bottom), thumb });

/**
 * Thumbnails: `assets/outfits/<body>/top_<item>.png` and `bottom_<item>.png` (square), `set_<id>.png`
 * (portrait 3:4). Rendered by Unity (CharacterPreview) into these paths; placeholders until then.
 */
export const CATALOG: Record<string, BodyCatalog> = {
  xb_m01: {
    tops: [
      { id: ORIG, thumb: require('./assets/outfits/xb_m01/top_orig.png') },       // "Shirt jacket"
      { id: 'hoodie', thumb: require('./assets/outfits/xb_m01/top_hoodie.png') },
      { id: 'knit', thumb: require('./assets/outfits/xb_m01/top_knit.png') },
      { id: 'tee', thumb: require('./assets/outfits/xb_m01/top_tee.png') },
    ],
    bottoms: [
      { id: ORIG, thumb: require('./assets/outfits/xb_m01/bottom_orig.png') },    // "Trousers"
      { id: 'jeans', thumb: require('./assets/outfits/xb_m01/bottom_jeans.png') },
      { id: 'chinos', thumb: require('./assets/outfits/xb_m01/bottom_chinos.png') },
    ],
    painted: ['smart', 'earth', 'denim'],
    sets: [
      set('original', ORIG, ORIG, require('./assets/outfits/xb_m01/set_original.png')),
      paintedSet('smart', require('./assets/outfits/xb_m01/set_smart.png')),
      paintedSet('earth', require('./assets/outfits/xb_m01/set_earth.png')),
      paintedSet('denim', require('./assets/outfits/xb_m01/set_denim.png')),
      set('casual', 'hoodie', 'jeans', require('./assets/outfits/xb_m01/set_casual.png')),
      set('campus', 'knit', 'chinos', require('./assets/outfits/xb_m01/set_campus.png')),
      set('street', 'tee', 'jeans', require('./assets/outfits/xb_m01/set_street.png')),
    ],
  },
  xb_f01: {
    tops: [
      { id: ORIG, thumb: require('./assets/outfits/xb_f01/top_orig.png') },       // "Cardigan"
      { id: 'hoodie', thumb: require('./assets/outfits/xb_f01/top_hoodie.png') },
      { id: 'knit', thumb: require('./assets/outfits/xb_f01/top_knit.png') },
      { id: 'shirt', thumb: require('./assets/outfits/xb_f01/top_shirt.png') },
    ],
    bottoms: [
      { id: ORIG, thumb: require('./assets/outfits/xb_f01/bottom_orig.png') },    // "Skirt"
      { id: 'jeans', thumb: require('./assets/outfits/xb_f01/bottom_jeans.png') },
      { id: 'midi', thumb: require('./assets/outfits/xb_f01/bottom_midi.png') },
      { id: 'chinos', thumb: require('./assets/outfits/xb_f01/bottom_chinos.png') },
    ],
    painted: ['school', 'winter', 'spring'],
    sets: [
      set('original', ORIG, ORIG, require('./assets/outfits/xb_f01/set_original.png')),
      paintedSet('school', require('./assets/outfits/xb_f01/set_school.png')),
      paintedSet('winter', require('./assets/outfits/xb_f01/set_winter.png')),
      paintedSet('spring', require('./assets/outfits/xb_f01/set_spring.png')),
      set('casual', 'hoodie', 'jeans', require('./assets/outfits/xb_f01/set_casual.png')),
      set('campus', 'knit', 'midi', require('./assets/outfits/xb_f01/set_campus.png')),
      set('weekend', 'shirt', 'chinos', require('./assets/outfits/xb_f01/set_weekend.png')),
    ],
  },
};

export function catalogFor(characterId: string | undefined): BodyCatalog | undefined {
  return characterId ? CATALOG[characterId] : undefined;
}

/** The artist's own look: both slots `orig`, untinted. */
export const ORIGINAL_OUTFIT: Outfit = { top: ref(ORIG), bottom: ref(ORIG) };

/** A palette tint, in the palette's spelling (upper-case hex), or '' when it is not one. */
export function paletteHex(v: string): string {
  const up = v.trim().toUpperCase();
  return OUTFIT_COLORS.some(c => c.hex && c.hex === up) ? up : '';
}

export const isHex = (v: string): boolean => /^#[0-9A-Fa-f]{6}$/.test(v);

export function sameRef(a: ItemRef, b: ItemRef): boolean {
  return a.id === b.id && a.variant === b.variant;
}

/** The set the outfit IS (both parts equal, variant included), or undefined when it is a custom mix. */
export function wornSet(outfit: Outfit, characterId: string | undefined): OutfitSet | undefined {
  return catalogFor(characterId)?.sets.find(s => sameRef(s.top, outfit.top) && sameRef(s.bottom, outfit.bottom));
}

/**
 * One slot's item + variant, kept only as this body can draw it: an unknown or other-body item falls
 * back to `orig`; a variant stays if it is a palette tint, or a painted set of this body on `orig`.
 */
function normalise(cat: BodyCatalog | undefined, slot: Slot, id: string, variant: string): ItemRef {
  const items = slot === 'top' ? cat?.tops : cat?.bottoms;
  const item = id && items?.some(i => i.id === id) ? id : ORIG;
  const hex = paletteHex(variant);
  if (hex) return ref(item, hex);
  if (item === ORIG && variant && cat?.painted.includes(variant)) return ref(item, variant);
  return ref(item);
}

/** `<item>[:<variant>]` → its two halves (a missing item is `orig`). */
function splitPart(v: string): [string, string] {
  const i = v.indexOf(':');
  return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
}

/** A stored value → the two slots, keeping only what this body has; the older forms still read. */
export function parseOutfit(value: string | undefined, characterId?: string): Outfit {
  const cat = catalogFor(characterId);
  const v = (value ?? '').trim();
  if (!v) return { top: ref(ORIG), bottom: ref(ORIG) };
  if (v.includes('=')) {
    let top: ItemRef | undefined;
    let bottom: ItemRef | undefined;
    let style = '';
    for (const part of v.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0) continue;
      const k = part.slice(0, eq).trim();
      const val = part.slice(eq + 1).trim();
      if (k === 't') top = normalise(cat, 'top', ...splitPart(val));
      else if (k === 'b') bottom = normalise(cat, 'bottom', ...splitPart(val));
      else if (k === 's') style = val;   // the 02-11 form: the artist's pieces' look
    }
    top = top ?? ref(ORIG);
    bottom = bottom ?? ref(ORIG);
    if (style) {
      // The old style applies to each slot still on the artist's piece (and without a variant of its own).
      if (top.id === ORIG && !top.variant) top = normalise(cat, 'top', ORIG, style);
      if (bottom.id === ORIG && !bottom.variant) bottom = normalise(cat, 'bottom', ORIG, style);
    }
    return { top, bottom };
  }
  if (v.startsWith('#')) {
    const hex = paletteHex(v);
    return { top: ref(ORIG, hex), bottom: ref(ORIG, hex) };
  }
  if (v.startsWith('set:')) {
    const id = v.slice(4).trim();
    if (cat?.painted.includes(id)) return { top: ref(ORIG, id), bottom: ref(ORIG, id) };
    if (cat?.tops.some(i => i.id === id && id !== ORIG)) return { top: ref(id), bottom: ref(ORIG) };
    if (cat?.bottoms.some(i => i.id === id && id !== ORIG)) return { top: ref(ORIG), bottom: ref(id) };
  }
  return { top: ref(ORIG), bottom: ref(ORIG) };
}

/** The two slots → the stored value: `orig` without a variant is left out, so the artist's own look is "". */
export function encodeOutfit(o: Outfit): string {
  const part = (k: 't' | 'b', r: ItemRef) => {
    if (r.id === ORIG && !r.variant) return '';
    return `${k}=${r.id}${r.variant ? `:${r.variant}` : ''}`;
  };
  return [part('t', o.top), part('b', o.bottom)].filter(Boolean).join(';').slice(0, OUTFIT_MAX_LENGTH);
}

/** A stored outfit this body can draw, normalised (unknown or other-body parts fall back to the artist's own). */
export function knownOutfit(value: string | undefined, characterId?: string): string {
  return encodeOutfit(parseOutfit(value, characterId));
}

/** The outfit with one slot's item swapped: a tint stays on the new item, a painted set (orig only) drops. */
export function withItem(o: Outfit, slot: Slot, id: string): Outfit {
  const cur = o[slot];
  const variant = isHex(cur.variant) ? cur.variant : '';
  return { ...o, [slot]: ref(id, variant) };
}

/** The outfit with one slot's tint set ('' = the item's own colour; replaces a painted set too). */
export function withTint(o: Outfit, slot: Slot, hex: string): Outfit {
  return { ...o, [slot]: ref(o[slot].id, hex) };
}

/**
 * The dice (04-11): a random set of this body, then — with a 50% chance each — a random palette tint on
 * either part. `rand` is Math.random unless a test hands in its own.
 */
export function randomOutfit(characterId: string | undefined, rand: () => number = Math.random): Outfit {
  const cat = catalogFor(characterId);
  if (!cat || cat.sets.length === 0) return { top: ref(ORIG), bottom: ref(ORIG) };
  const pick = <T,>(list: T[]): T => list[Math.min(list.length - 1, Math.floor(rand() * list.length))];
  const tints = OUTFIT_COLORS.filter(c => c.hex).map(c => c.hex);
  const s = pick(cat.sets);
  const maybeTint = (r: ItemRef): ItemRef => (rand() < 0.5 ? ref(r.id, pick(tints)) : ref(r.id, r.variant));
  return { top: maybeTint(s.top), bottom: maybeTint(s.bottom) };
}
