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
 * Outfit sets (02-11): each body's clothes texture repainted — each garment its own colour or pattern
 * (Saju `tools/outfits/gen_outfits.py`). Same mesh and rig, so only the cloth changes. Picked as
 * `set:<id>` (Unity's OutfitTint swaps the texture); the ids must match the PNGs Unity imported
 * (`xuan_basic/<body>/Textures/outfits/<body>_Clothes_<id>.png`). A body without sets lists none.
 */
export type OutfitSet = { id: string; value: string; thumb: number; label: string };

const set = (id: string, thumb: number): OutfitSet => ({ id, value: `set:${id}`, thumb, label: `character.outfit.set.${id}` });

export const OUTFIT_SETS: Record<string, OutfitSet[]> = {
  xb_f01: [
    set('school', require('./assets/outfits/xb_f01_school.png')),
    set('winter', require('./assets/outfits/xb_f01_winter.png')),
    set('spring', require('./assets/outfits/xb_f01_spring.png')),
    // 02-11: garment sets — new meshes on her rig (Saju tools/outfits/{hoodie_f,jeans_f,midi_f}).
    set('hoodie', require('./assets/outfits/xb_f01_hoodie.png')),
    set('jeans', require('./assets/outfits/xb_f01_jeans.png')),
    set('midi', require('./assets/outfits/xb_f01_midi.png')),
  ],
  xb_m01: [
    set('smart', require('./assets/outfits/xb_m01_smart.png')),
    set('earth', require('./assets/outfits/xb_m01_earth.png')),
    set('denim', require('./assets/outfits/xb_m01_denim.png')),
    // 02-11: the first GARMENT set — a new mesh (Saju tools/outfits/hoodie), not a repaint.
    set('hoodie', require('./assets/outfits/xb_m01_hoodie.png')),
  ],
};

export function outfitSetsFor(characterId: string | undefined): OutfitSet[] {
  return (characterId && OUTFIT_SETS[characterId]) || [];
}

/**
 * A stored outfit this body can draw: a palette colour, or one of ITS sets. Anything else (a colour
 * the palette dropped, another body's set after switching character) falls back to the model's own.
 */
export function knownOutfit(value: string | undefined, characterId?: string): string {
  if (OUTFIT_COLORS.some(c => c.hex === value)) return value as string;
  if (value && outfitSetsFor(characterId).some(s => s.value === value)) return value;
  return '';
}
