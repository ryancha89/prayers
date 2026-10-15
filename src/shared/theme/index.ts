/**
 * Prayers design tokens — dark-first, premium & atmospheric (spec §46).
 * Background near-black, charcoal cards, violet primary, warm gold secondary.
 */

export const colors = {
  // Surfaces
  bg: '#0A0A0F', // near-black app background
  bgElevated: '#12121A',
  card: '#1A1A24', // dark charcoal cards
  cardPressed: '#232330',
  border: '#26263400',

  // Accents
  violet: '#8B5CF6', // primary accent
  violetSoft: '#A78BFA',
  violetDim: 'rgba(139, 92, 246, 0.16)',
  gold: '#E9C46A', // secondary warm accent
  goldDim: 'rgba(233, 196, 106, 0.16)',

  // Text
  textPrimary: '#FFFFFF',
  textSecondary: '#B4B4C4',
  textMuted: '#6E6E82',

  // Status / badges
  new: '#34D399',
  trending: '#F472B6',
  popular: '#E9C46A',

  overlay: 'rgba(0,0,0,0.55)',
  scrim: 'rgba(10,10,15,0.92)',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
  pill: 999,
} as const;

export const typography = {
  hero: { fontSize: 30, fontWeight: '800' as const, letterSpacing: -0.5 },
  h1: { fontSize: 24, fontWeight: '800' as const, letterSpacing: -0.3 },
  h2: { fontSize: 19, fontWeight: '700' as const },
  h3: { fontSize: 16, fontWeight: '700' as const },
  body: { fontSize: 15, fontWeight: '500' as const },
  bodyStrong: { fontSize: 15, fontWeight: '700' as const },
  caption: { fontSize: 13, fontWeight: '500' as const },
  tiny: { fontSize: 11, fontWeight: '600' as const },
} as const;

/** Plain-object equivalent of StyleSheet.absoluteFillObject (stable across RN type versions). */
export const absoluteFill = {
  position: 'absolute' as const,
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
};

export const theme = { colors, spacing, radius, typography };
export type Theme = typeof theme;
