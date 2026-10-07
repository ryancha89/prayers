import React from 'react';
import { Platform, Pressable, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Text } from '../Text';
import { Icon, type IconName } from '../Icon';
import { CompassStar, Diamond, StarRule } from '../Ornaments';
import { colors, radius, spacing } from '../../theme';

/**
 * The HUD over a 3D scene, drawn from My Room's 07-10 mockup and shared with the World (07-10, "the
 * same UI outside"): a profile badge top-left, bare ivory icons top-right, the motto and the corner
 * buttons at the bottom. Navy translucent plates, gold hairlines, ivory text. The screen decides what
 * each one does; these only draw — so this file plays no sound (the callers do).
 */

export const IVORY = '#F4EBDD';
/** The HUD's navy plate and gold hairline: what every in-world control is drawn on. */
export const PLATE = 'rgba(14,12,40,0.72)';
export const HAIRLINE = 'rgba(233,196,106,0.75)';
/** The device's serif, for display text. The app bundles no font of its own; Georgia is on every
 *  iPhone, and Hangul falls back to the system face inside it. */
export const SERIF = Platform.select({ ios: 'Georgia', android: 'serif' });
const SHADOW = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 1 } };

const EMBLEM = 50;
/** A bare HUD icon's box (HudIcon), for the width a top row keeps for its icons. */
export const HUD_ICON = 34;
/** The badge never takes more of the screen's width than this, however long the title. */
export const BADGE_MAX_SHARE = 0.6;
/** The title's type size, and how far it may shrink before it would truncate. Georgia at 15 × 0.6 is
 *  9 pt: still legible on the plate, and enough for the longest title of the six languages on a
 *  375-pt phone (pinned in hudBadge.test). */
export const TITLE_FONT = 15;
export const TITLE_MIN_SCALE = 0.6;
/** What the plate spends on everything but its text: the emblem's half it starts under, the padding
 *  either side of the text, the two hairlines. */
const PLATE_CHROME = EMBLEM / 2 + (EMBLEM / 2 + spacing.sm) + spacing.lg + 2;

/**
 * The widest the badge may be: BADGE_MAX_SHARE of the screen, and never into what the row keeps on
 * its right (`reserved`: the icons, the gap, both paddings). Pure, for tests and both screens.
 */
export function badgeMaxWidth(screenWidth: number, reserved: number): number {
  return Math.max(EMBLEM + 60, Math.min(Math.round(screenWidth * BADGE_MAX_SHARE), Math.floor(screenWidth - reserved)));
}

/** The room the title's text gets inside a badge of `maxWidth`. */
export const titleRoom = (maxWidth: number): number => maxWidth - PLATE_CHROME;

/**
 * A rough width of `text` at `fontSize` in the badge's serif: CJK, kana and Hangul a full em, Latin
 * capitals ~0.72 em, everything else ~0.56 em (Georgia runs wide; Vietnamese marks sit above, not
 * beside). Errs wide — it decides whether the shrink floor is enough, not where the text goes.
 */
export function estimateTitleWidth(text: string, fontSize = TITLE_FONT): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    if ((c >= 0x1100 && c <= 0x11ff) || (c >= 0x2e80 && c <= 0x9fff) || (c >= 0xac00 && c <= 0xd7af) || (c >= 0xff00 && c <= 0xffef)) em += 1;
    else if (ch === ' ') em += 0.28;
    else if (ch !== ch.toLowerCase()) em += 0.72;
    else em += 0.56;
  }
  return em * fontSize;
}

/**
 * The compass emblem over a navy plate: "Lv. 12" over the title (myroom/level.ts derives both from
 * what the player has done). Before a level is known the plate carries the name alone. A tap opens
 * the profile sheet.
 *
 * The plate sizes to its title up to `maxWidth` (badgeMaxWidth); a title still too long for that
 * shrinks (down to TITLE_MIN_SCALE) instead of ending in "…" — 07-10, "Pilgrim of the…" on the sim.
 */
export const ProfileBadge: React.FC<{
  name: string;
  level?: number | null;
  title?: string | null;
  maxWidth?: number;
  onPress?: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  testID?: string;
}> = ({ name, level, title, maxWidth, onPress, onLayout, testID }) => (
  <Pressable
    style={({ pressed }) => [styles.badge, maxWidth != null && { maxWidth }, pressed && styles.pressed]}
    onLayout={onLayout}
    onPress={onPress}
    disabled={!onPress}
    testID={testID}
    accessibilityRole={onPress ? 'button' : 'text'}
    accessibilityLabel={[name, level != null ? `Lv. ${level}` : '', title ?? ''].filter(Boolean).join(' · ')}>
    <View style={styles.plate}>
      {level != null && <Text style={styles.level}>Lv. {level}</Text>}
      <Text
        style={styles.plateName}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={TITLE_MIN_SCALE}
        testID={testID ? `${testID}-title` : undefined}>
        {title || name}
      </Text>
    </View>
    <View style={styles.emblem}>
      <CompassStar size={EMBLEM - 6} />
    </View>
  </Pressable>
);

/** A bare line icon with a soft shadow, and a red dot only when there is something to see. */
export const HudIcon: React.FC<{
  icon: IconName;
  label: string;
  onPress: () => void;
  badge?: boolean;
  /** Drawn but not live yet: dimmed, and the press only explains. */
  muted?: boolean;
  testID?: string;
}> = ({ icon, label, onPress, badge, muted, testID }) => (
  <Pressable
    testID={testID}
    hitSlop={6}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={muted ? { disabled: true } : undefined}
    style={({ pressed }) => [styles.hudIcon, muted && styles.muted, pressed && styles.pressed]}>
    {/* The shadow is a second, dark copy a point lower: an SVG takes no textShadow. */}
    <Icon name={icon} size={26} color="rgba(0,0,0,0.45)" style={styles.iconShadow} />
    <Icon name={icon} size={26} color={IVORY} />
    {badge && <View style={styles.dot} testID={testID ? `${testID}-badge` : undefined} />}
  </Pressable>
);

/** The ring a top bar uses (back, sound): a size below the corner buttons, the height of the
 *  badge's plate. Its press target is still MIN_HIT (RingButton pads it). */
export const RING_COMPACT = 40;
/** The smallest press target a ring may have, whatever it draws (Apple's 44 pt). */
export const MIN_HIT = 44;

/** Dark circle, thin gold ring, an ivory glyph: run, share, the World's Map / Quest / Menu, and the
 *  back / sound pair of every in-world top bar (RING_COMPACT).
 *  `active` (the run toggle on) fills it gold with a dark glyph, so on and off read at a glance.
 *  `caption` writes the label under the ring in the HUD's small serif — inside the press target, so
 *  the word is as tappable as the ring. `muted` dims and explains (the press still arrives);
 *  `disabled` dims and takes no press at all. A ring smaller than MIN_HIT is padded out with
 *  hitSlop, so the compact size costs nothing in reach. */
export const RingButton: React.FC<{
  icon: IconName;
  label: string;
  onPress?: () => void;
  size: number;
  muted?: boolean;
  disabled?: boolean;
  active?: boolean;
  caption?: boolean;
  testID?: string;
}> = ({ icon, label, onPress, size, muted, disabled, active, caption, testID }) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    disabled={disabled || !onPress}
    hitSlop={size < MIN_HIT ? Math.ceil((MIN_HIT - size) / 2) : undefined}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={muted || disabled ? { disabled: true } : active != null ? { selected: active } : undefined}
    style={({ pressed }) => [styles.ringBox, (muted || disabled) && styles.muted, pressed && styles.pressed]}>
    <View style={[styles.ring, { width: size, height: size, borderRadius: size / 2 }, active && styles.ringOn]}>
      <Icon name={icon} size={Math.round(size * 0.44)} color={active ? '#1A1330' : IVORY} />
    </View>
    {caption && <Text style={[styles.caption, { maxWidth: size + 24 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{label}</Text>}
  </Pressable>
);

/** The dark pill of the bottom-left corner (편집). */
export const PillButton: React.FC<{ label: string; onPress: () => void; muted?: boolean; testID?: string }> = ({
  label, onPress, muted, testID,
}) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={muted ? { disabled: true } : undefined}
    style={({ pressed }) => [styles.pill, muted && styles.muted, pressed && styles.pressed]}>
    <Text style={styles.pillText} numberOfLines={1}>{label}</Text>
  </Pressable>
);

/** The gold star on its long hairlines, and the motto under it between two diamonds. */
export const Motto: React.FC<{ text: string; width: number }> = ({ text, width }) => (
  <View style={styles.motto} pointerEvents="none" testID="myroom-motto">
    <StarRule width={width} />
    <View style={styles.mottoRow}>
      <Diamond size={6} filled />
      <Text style={styles.mottoText} numberOfLines={1}>{text}</Text>
      <Diamond size={6} filled />
    </View>
  </View>
);

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', height: EMBLEM, flexShrink: 1 },
  emblem: {
    position: 'absolute', left: 0, top: 0, width: EMBLEM, height: EMBLEM, borderRadius: EMBLEM / 2,
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(14,12,40,0.88)',
    borderWidth: 1, borderColor: HAIRLINE,
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  // Starts under the emblem's centre, so the emblem overlaps the plate's left end.
  plate: {
    marginLeft: EMBLEM / 2, paddingLeft: EMBLEM / 2 + spacing.sm, paddingRight: spacing.lg, paddingVertical: 5,
    minHeight: 38, justifyContent: 'center', flexShrink: 1,
    backgroundColor: PLATE, borderWidth: 1, borderColor: HAIRLINE, borderRadius: radius.sm,
  },
  level: { fontFamily: SERIF, fontSize: 11, color: IVORY, opacity: 0.85, letterSpacing: 0.5 },
  plateName: { fontFamily: SERIF, fontSize: TITLE_FONT, fontWeight: '600', color: IVORY, letterSpacing: 0.3 },
  hudIcon: { width: HUD_ICON, height: HUD_ICON, alignItems: 'center', justifyContent: 'center' },
  iconShadow: { position: 'absolute', top: 5, left: 4 },
  dot: {
    position: 'absolute', top: 2, right: 1, width: 10, height: 10, borderRadius: 5, backgroundColor: '#E5484D',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)',
  },
  ring: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: PLATE, borderWidth: 1, borderColor: HAIRLINE,
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  ringBox: { alignItems: 'center', gap: 3 },
  caption: { fontFamily: SERIF, fontSize: 11, color: IVORY, letterSpacing: 0.5, textAlign: 'center', ...SHADOW },
  ringOn: { backgroundColor: 'rgba(233,196,106,0.95)', borderColor: IVORY },
  pill: {
    minWidth: 76, height: 40, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: PLATE, borderWidth: 1, borderColor: HAIRLINE,
  },
  pillText: { fontFamily: SERIF, fontSize: 15, fontWeight: '600', color: IVORY, letterSpacing: 1 },
  motto: { alignItems: 'center', gap: 2 },
  mottoRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  mottoText: { fontFamily: SERIF, fontSize: 11, color: colors.gold, letterSpacing: 2.5, ...SHADOW },
  muted: { opacity: 0.5 },
  pressed: { opacity: 0.7 },
});
