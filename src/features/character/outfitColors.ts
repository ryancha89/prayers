/**
 * The creator's outfit colours (29-10, the "Outfit" step). Each gender has ONE rigged player body
 * (xb_f01, xb_m01); its outfits are recolours (below) and repainted sets (OUTFIT_SETS).
 * Unity's OutfitTint works like HairTint: a grey copy of the clothes texture (cardigan, skirt and
 * socks share it on xb_f01; shirt, jacket and trousers on xb_m01) multiplied by the colour — the
 * folds and stripes survive, which is why these are mid-tones that read as cloth, not pure colours.
 * Shoes, skin and hair are other textures and keep their own colours. "" = the artist's own clothes,
 * the default.
 */
export const OUTFIT_COLORS: { hex: string; swatch: string }[] = [
  { hex: '', swatch: '' },            // the model's own (drawn as a split swatch)
  { hex: '#EDE4D0', swatch: '#EDE4D0' }, // ivory
  { hex: '#C9AE85', swatch: '#C9AE85' }, // sand
  { hex: '#8FA48A', swatch: '#8FA48A' }, // sage
  { hex: '#2E3A5C', swatch: '#2E3A5C' }, // navy
  { hex: '#7A2E3B', swatch: '#7A2E3B' }, // burgundy
  { hex: '#3E3E44', swatch: '#3E3E44' }, // charcoal
  { hex: '#D49AA2', swatch: '#D49AA2' }, // dusty pink
  { hex: '#A99BC9', swatch: '#A99BC9' }, // lavender
];

/**
 * Outfits (02-11): picked in three parts, as Unity's OutfitTint reads them —
 *   style   the artist's own pieces' look: "" (as drawn), a palette colour "#RRGGBB", or a repainted
 *           texture (a STYLE set, Saju `tools/outfits/gen_outfits.py`)
 *   top     "" (the artist's) or a garment top (a new mesh on the rig, Saju `tools/outfits/<garment>`)
 *   bottom  "" (the artist's) or a garment bottom
 * Stored in `playerOutfit` as before when only a style is picked ("", "#RRGGBB", "set:<id>"), and as
 * "s=<style>;t=<top>;b=<bottom>" (empty parts left out) once a garment is worn. Old "set:<garment>" values
 * still read. Ids must match the sets Unity wired on the body (OutfitSets / OutfitGarments).
 */
export type OutfitPiece = { id: string; thumb: number; label: string };
export type Outfit = { style: string; top: string; bottom: string };

const piece = (id: string, thumb: number): OutfitPiece => ({ id, thumb, label: `character.outfit.set.${id}` });

type BodyOutfits = { styles: OutfitPiece[]; tops: OutfitPiece[]; bottoms: OutfitPiece[]; ownTop: number; ownBottom?: number };

export const OUTFITS: Record<string, BodyOutfits> = {
  xb_f01: {
    styles: [
      piece('school', require('./assets/outfits/xb_f01_school.png')),
      piece('winter', require('./assets/outfits/xb_f01_winter.png')),
      piece('spring', require('./assets/outfits/xb_f01_spring.png')),
    ],
    tops: [
      piece('hoodie', require('./assets/outfits/xb_f01_hoodie.png')),
      piece('knit', require('./assets/outfits/xb_f01_knit.png')),
      // 02-11 evening: a long-sleeved overshirt worn over the bottoms — covers her as his clothes cover him
      piece('shirt', require('./assets/outfits/xb_f01_shirt.png')),
    ],
    bottoms: [
      piece('jeans', require('./assets/outfits/xb_f01_jeans.png')),
      piece('midi', require('./assets/outfits/xb_f01_midi.png')),
      // 03-11: cotton chinos, the jeans' cut (tools/outfits/chinos_f). Her tee is off: no forearms under her sleeves.
      piece('chinos', require('./assets/outfits/xb_f01_chinos.png')),
    ],
    ownTop: require('./assets/outfits/xb_f01_top_original.png'),
    ownBottom: require('./assets/outfits/xb_f01_bottom_original.png'),
  },
  xb_m01: {
    styles: [
      piece('smart', require('./assets/outfits/xb_m01_smart.png')),
      piece('earth', require('./assets/outfits/xb_m01_earth.png')),
      piece('denim', require('./assets/outfits/xb_m01_denim.png')),
    ],
    tops: [
      piece('hoodie', require('./assets/outfits/xb_m01_hoodie.png')),
      piece('knit', require('./assets/outfits/xb_m01_knit.png')),
      // 03-11: short-sleeved tee and cotton chinos (tools/outfits/tee_m, chinos_m)
      piece('tee', require('./assets/outfits/xb_m01_tee.png')),
    ],
    bottoms: [
      piece('jeans', require('./assets/outfits/xb_m01_jeans.png')),
      piece('chinos', require('./assets/outfits/xb_m01_chinos.png')),
    ],
    ownTop: require('./assets/outfits/xb_m01_top_original.png'),
    ownBottom: require('./assets/outfits/xb_m01_bottom_original.png'),
  },
};

const EMPTY: Outfit = { style: '', top: '', bottom: '' };

/**
 * The garments (tops / bottoms) can be switched off here without touching Unity: off, the creator shows only
 * the styles and colours, and a stored top/bottom falls back to the artist's own. Off for an hour on 02-11,
 * back on the same evening (user: keep them, fix them).
 */
export const GARMENTS_ON = true;

export function outfitsFor(characterId: string | undefined): BodyOutfits | undefined {
  const b = characterId ? OUTFITS[characterId] : undefined;
  return b && !GARMENTS_ON ? { ...b, tops: [], bottoms: [] } : b;
}

/** A stored value → its three parts, keeping only what this body has (another body's pieces drop). */
export function parseOutfit(value: string | undefined, characterId?: string): Outfit {
  const b = outfitsFor(characterId);
  const has = (list: OutfitPiece[] | undefined, id: string) => !!list?.some(p => p.id === id);
  const styleOk = (st: string) => st === '' || OUTFIT_COLORS.some(c => c.hex === st) || has(b?.styles, st);
  const v = (value ?? '').trim();
  if (!v) return { ...EMPTY };
  if (v.includes('=')) {
    const o = { ...EMPTY };
    for (const part of v.split(';')) {
      const [k, val = ''] = part.split('=');
      if (k === 's' && styleOk(val)) o.style = val;
      if (k === 't' && has(b?.tops, val)) o.top = val;
      if (k === 'b' && has(b?.bottoms, val)) o.bottom = val;
    }
    return o;
  }
  if (v.startsWith('#')) return { ...EMPTY, style: styleOk(v) ? v : '' };
  if (v.startsWith('set:')) {
    const id = v.slice(4);
    if (has(b?.styles, id)) return { ...EMPTY, style: id };
    if (has(b?.tops, id)) return { ...EMPTY, top: id };
    if (has(b?.bottoms, id)) return { ...EMPTY, bottom: id };
  }
  return { ...EMPTY };
}

/** The three parts → the stored value (the short old forms when no garment is worn). */
export function encodeOutfit(o: Outfit): string {
  if (!o.top && !o.bottom) return !o.style ? '' : o.style.startsWith('#') ? o.style : `set:${o.style}`;
  return [o.style && `s=${o.style}`, o.top && `t=${o.top}`, o.bottom && `b=${o.bottom}`].filter(Boolean).join(';');
}

/** A stored outfit this body can draw, normalised (unknown or other-body parts fall back to the artist's own). */
export function knownOutfit(value: string | undefined, characterId?: string): string {
  return encodeOutfit(parseOutfit(value, characterId));
}
