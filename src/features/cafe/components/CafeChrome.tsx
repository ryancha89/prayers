import React, { useState } from 'react';
import { Image, Pressable, StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { Icon, type IconName } from '../../../shared/components/Icon';
import { Diamond } from '../../../shared/components/Ornaments';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { IVORY, SERIF } from '../../../shared/components/hud/Hud';
import { CoinGlyph } from '../../coins/components/CoinGlyph';
import type { TarotConsultant } from '../api/cafeApi';
import { readerPortrait } from '../table/portrait';

/**
 * The coffee shop's look (20-10, "improve UI cho đẹp hơn"): one set of pieces for the World door's
 * choice and every panel inside, so the place reads as one evening room — plum glass lit from above,
 * gold hairlines, the reader's words in bubbles — instead of flat navy slabs with lines of text.
 */
export const INK = '#1A1330';
export const PLUM_TOP = '#2B1B4D';
export const PLUM_BOTTOM = '#0D0A22';
export const GOLD_LINE = 'rgba(233,196,106,0.4)';
export const GOLD_SOFT = 'rgba(233,196,106,0.14)';

/**
 * The panel's own background: plum, lighter at the edge it rises from, and one gold hairline along
 * that edge that fades out at both ends, with a small diamond in its middle. `side` = the landscape
 * column, lit from its left edge.
 */
export const PanelBackdrop: React.FC<{ side?: boolean }> = ({ side }) => {
  // Sized in numbers from the layout, not "100%": the percentage was resolved once, so a panel that
  // grew (the short question panel → the reading's) kept its old height of plum and the Next row
  // floated over the room (sim QA 20-10).
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setSize(prev => (prev.w === w && prev.h === h ? prev : { w, h }));
  };
  return (
    <View style={styles.fill} pointerEvents="none" onLayout={onLayout}>
      {size.w > 0 && size.h > 0 && (
        // Keyed by size: react-native-svg (Fabric) keeps its first frame when width/height change, so a
        // grown panel still showed the old height of plum (sim QA 20-10, twice). A new size = a new Svg.
        <Svg key={`${size.w}x${size.h}`} width={size.w} height={size.h}>
          <Defs>
            <LinearGradient id="plum" x1="0" y1="0" x2={side ? '1' : '0'} y2={side ? '0' : '1'}>
              <Stop offset="0" stopColor={PLUM_TOP} stopOpacity={0.97} />
              <Stop offset="0.45" stopColor="#170F35" stopOpacity={0.97} />
              <Stop offset="1" stopColor={PLUM_BOTTOM} stopOpacity={0.98} />
            </LinearGradient>
            <LinearGradient id="edge" x1="0" y1="0" x2={side ? '0' : '1'} y2={side ? '1' : '0'}>
              <Stop offset="0" stopColor={colors.gold} stopOpacity={0} />
              <Stop offset="0.5" stopColor={colors.gold} stopOpacity={0.9} />
              <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
            </LinearGradient>
            <RadialGradient id="glow" cx={side ? '0%' : '50%'} cy={side ? '30%' : '0%'} r="60%">
              <Stop offset="0" stopColor={colors.gold} stopOpacity={0.12} />
              <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#plum)" />
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#glow)" />
          {side ? <Rect x="0" y="0" width="1" height="100%" fill="url(#edge)" /> : <Rect x="0" y="0" width="100%" height="1" fill="url(#edge)" />}
        </Svg>
      )}
      {!side && (
        <View style={styles.diamondTop}>
          <Diamond size={9} filled />
        </View>
      )}
    </View>
  );
};

/** An icon in a gold ring with a warm glow inside: what a choice IS, at a glance. */
export const Medallion: React.FC<{ icon: IconName; size?: number; style?: StyleProp<ViewStyle> }> = ({ icon, size = 44, style }) => (
  <View style={[styles.medallion, { width: size, height: size, borderRadius: size / 2 }, style]}>
    <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient id="med" cx="50%" cy="40%" r="55%">
          <Stop offset="0" stopColor={colors.gold} stopOpacity={0.32} />
          <Stop offset="1" stopColor={colors.gold} stopOpacity={0.04} />
        </RadialGradient>
      </Defs>
      <Rect x="0" y="0" width={size} height={size} fill="url(#med)" />
    </Svg>
    <Icon name={icon} size={Math.round(size * 0.48)} color={colors.gold} />
  </View>
);

/** A price: the coin and the number. `onGold` for a gold button, where the gold coin would vanish. */
export const PriceChip: React.FC<{ price: number; label: string; onGold?: boolean }> = ({ label, onGold }) => (
  <View style={[styles.chip, onGold && styles.chipOnGold]}>
    {onGold ? <Icon name="coin" size={13} color={INK} /> : <CoinGlyph size={15} />}
    <Text style={[styles.chipText, onGold && styles.chipTextOnGold]}>{label}</Text>
  </View>
);

/** A reader's face in a gold ring. The glow sits on an outer view: iOS drops a shadow from a view
 *  that clips (overflow hidden), and the clipping is what keeps the photo round. */
export const ReaderFace: React.FC<{ reader: TarotConsultant; size: number; glow?: boolean }> = ({ reader, size, glow }) => {
  const p = readerPortrait(reader.portraitKey);
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <View style={[round, glow && styles.faceGlow]}>
      <View style={[styles.face, round, { backgroundColor: p.accent }]}>
        {p.image ? (
          <Image source={p.image} style={round} resizeMode="cover" />
        ) : (
          <Text style={[styles.initial, { fontSize: size * 0.42 }]}>{reader.name.charAt(0)}</Text>
        )}
      </View>
    </View>
  );
};

/** What someone at the table said. The reader's words lean left under their name; the player's lean
 *  right, in gold. */
/** `textID` is the words' own test id (a `testID` prop would match this component itself first). */
export const Bubble: React.FC<{ who?: string; text: string; mine?: boolean; muted?: boolean; textID?: string }> = ({ who, text, mine, muted, textID }) => (
  <View style={[styles.bubbleWrap, mine && styles.bubbleWrapMine]}>
    {who ? <Text style={[styles.who, mine && styles.whoMine]}>{who}</Text> : null}
    <View style={[styles.bubble, mine && styles.bubbleMine]}>
      <Text style={[styles.bubbleText, muted && styles.bubbleMuted]} testID={textID}>{text}</Text>
    </View>
  </View>
);

/** The gold call to action. */
export const GoldButton: React.FC<{
  label: string;
  onPress: () => void;
  icon?: IconName;
  testID?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}> = ({ label, onPress, icon, testID, disabled, style, children }) => (
  <Pressable testID={testID} onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label}
    accessibilityState={{ disabled: !!disabled }} style={({ pressed }) => [styles.gold, disabled && styles.muted, pressed && styles.pressed, style]}>
    <Text style={styles.goldText} numberOfLines={1}>{label}</Text>
    {children}
    {icon ? <Icon name={icon} size={14} color={INK} /> : null}
  </Pressable>
);

/** The quiet button beside it. */
export const GhostButton: React.FC<{ label: string; onPress: () => void; icon?: IconName; testID?: string; style?: StyleProp<ViewStyle> }> = ({
  label, onPress, icon, testID, style,
}) => (
  <Pressable testID={testID} onPress={() => { sfx.tap(); onPress(); }} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}
    style={({ pressed }) => [styles.ghost, pressed && styles.pressed, style]}>
    {icon ? <Icon name={icon} size={13} color={IVORY} /> : null}
    <Text style={styles.ghostText} numberOfLines={1}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  fill: { ...absoluteFill },
  diamondTop: { position: 'absolute', top: -4, left: 0, right: 0, alignItems: 'center' },
  medallion: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.7)', backgroundColor: 'rgba(20,14,44,0.6)',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
    paddingLeft: 5, paddingRight: spacing.sm, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: 'rgba(10,8,26,0.55)', borderWidth: 1, borderColor: GOLD_LINE,
  },
  // Inside the send pill, whose row centres its children: `chip`'s flex-start would ride it to the top.
  chipOnGold: { alignSelf: 'center', backgroundColor: 'rgba(26,19,48,0.12)', borderColor: 'rgba(26,19,48,0.25)' },
  chipText: { ...typography.caption, color: colors.gold, fontWeight: '700' },
  chipTextOnGold: { color: INK },
  face: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(233,196,106,0.85)' },
  faceGlow: { shadowColor: colors.gold, shadowOpacity: 0.55, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  initial: { fontFamily: SERIF, color: IVORY },
  bubbleWrap: { alignSelf: 'flex-start', maxWidth: '92%', gap: 3 },
  bubbleWrapMine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  who: { ...typography.tiny, color: colors.gold, letterSpacing: 0.8, textTransform: 'uppercase', marginLeft: spacing.sm },
  whoMine: { marginLeft: 0, marginRight: spacing.sm, color: colors.textSecondary },
  bubble: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: 16, borderTopLeftRadius: 4,
    backgroundColor: 'rgba(244,235,221,0.07)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.22)',
  },
  bubbleMine: { borderTopLeftRadius: 16, borderTopRightRadius: 4, backgroundColor: 'rgba(233,196,106,0.15)', borderColor: 'rgba(233,196,106,0.35)' },
  bubbleText: { ...typography.body, color: colors.textPrimary, lineHeight: 22 },
  bubbleMuted: { color: colors.textSecondary, fontStyle: 'italic' },
  gold: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, minHeight: 44, borderRadius: radius.pill, backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  goldText: { ...typography.bodyStrong, color: INK, flexShrink: 1 },
  ghost: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    paddingHorizontal: spacing.md, minHeight: 32, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)', backgroundColor: 'rgba(10,8,26,0.35)',
  },
  ghostText: { ...typography.caption, color: IVORY },
  muted: { opacity: 0.45, shadowOpacity: 0 },
  pressed: { opacity: 0.78, transform: [{ scale: 0.98 }] },
});
