/**
 * The creator's outfit colours (29-10, the "Outfit" step). Each gender has ONE rigged player body
 * (xb_f01, xb_m01), so there are no other outfits to list yet; a recolour is the choice there is.
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

/** A stored colour the palette no longer has falls back to the model's own. */
export function knownOutfit(hex: string | undefined): string {
  return OUTFIT_COLORS.some(c => c.hex === hex) ? (hex as string) : '';
}
