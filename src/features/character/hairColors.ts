/**
 * The creator's hair colours (27-10, step 2). Unity's HairTint multiplies a grey copy of the hair
 * texture by the colour, so the shading and the highlight strands of the model survive — which is
 * why these are mid-tones rather than pure colours. "" = the artist's own hair, the default.
 */
export const HAIR_COLORS: { hex: string; swatch: string }[] = [
  { hex: '', swatch: '' },            // the model's own (drawn as a split swatch)
  { hex: '#2A2630', swatch: '#2A2630' }, // black
  { hex: '#5A3826', swatch: '#5A3826' }, // dark brown
  { hex: '#8A5432', swatch: '#8A5432' }, // chestnut
  { hex: '#C08A4E', swatch: '#C08A4E' }, // honey
  { hex: '#E0C08A', swatch: '#E0C08A' }, // blonde
  { hex: '#C46A86', swatch: '#C46A86' }, // rose
  { hex: '#6A5AC8', swatch: '#6A5AC8' }, // violet
  { hex: '#9AA0B0', swatch: '#9AA0B0' }, // ash
  { hex: '#D8D8E6', swatch: '#D8D8E6' }, // silver
];

/** A stored colour the palette no longer has falls back to the model's own. */
export function knownHair(hex: string | undefined): string {
  return HAIR_COLORS.some(c => c.hex === hex) ? (hex as string) : '';
}
