import React from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, Ellipse, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { SERIF } from '../../../shared/components/hud/Hud';
import { radius, spacing, typography } from '../../../shared/theme';

/**
 * Tree of Mind's look (spec 008): moonlit green and a warm sap-gold, so the garden reads as its own
 * place next to the meditation room's lantern-plum — the same HUD vocabulary (serif words, no boxes,
 * one gold call to action), another palette.
 */
export const GARDEN = {
  moss: '#0E1F1A', // the garden's shadow side
  leaf: '#7FD3A8', // the energy ring, new leaves
  sap: '#F2CF7A', // Gold, the call to action
  mist: '#E8F1EA', // primary words
  dew: 'rgba(232,241,234,0.64)', // secondary words
};

/** The energy ring round the tree glyph: the level in the middle, the arc = progress to the next. */
export const EnergyRing: React.FC<{ size: number; progress: number; level: number; testID?: string }> = ({
  size, progress, level, testID,
}) => {
  const stroke = 3;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size }} testID={testID} accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(232,241,234,0.18)" strokeWidth={stroke} fill="rgba(14,31,26,0.72)" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={GARDEN.leaf}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c * p} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.ringCentre]} pointerEvents="none">
        <Text style={styles.ringLevel}>{level}</Text>
      </View>
    </View>
  );
};

/**
 * The garden without the embedded player (Jest, a build without Unity, or the seconds before it
 * answers): night sky, a hill, and a placeholder tree that grows with the level — the same "tree
 * stand-in" phase 1 ships in Unity, drawn flat.
 */
export const DrawnGarden: React.FC<{ width: number; height: number; level: number; glow: number }> = ({
  width, height, level, glow,
}) => {
  const ground = height * 0.66;
  const s = 0.55 + Math.min(level, 6) * 0.12;
  const cx = width / 2;
  const trunkH = 70 * s;
  const crown = 46 * s;
  return (
    <Svg width={width} height={height} pointerEvents="none">
      <Defs>
        <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#0B1426" />
          <Stop offset="1" stopColor={GARDEN.moss} />
        </LinearGradient>
        <RadialGradient id="crown" cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={GARDEN.leaf} stopOpacity={0.55 + glow * 0.4} />
          <Stop offset="1" stopColor="#2F6B52" stopOpacity={0.9} />
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#sky)" />
      <Ellipse cx={cx} cy={ground + height * 0.22} rx={width * 0.9} ry={height * 0.26} fill="#13291F" />
      <Path d={`M ${cx - 6 * s} ${ground} L ${cx - 3 * s} ${ground - trunkH} L ${cx + 3 * s} ${ground - trunkH} L ${cx + 6 * s} ${ground} Z`} fill="#5B4636" />
      <Circle cx={cx} cy={ground - trunkH - crown * 0.4} r={crown} fill="url(#crown)" />
      {level >= 2 && <Circle cx={cx - crown * 0.7} cy={ground - trunkH} r={crown * 0.6} fill="url(#crown)" />}
      {level >= 3 && <Circle cx={cx + crown * 0.75} cy={ground - trunkH + 4} r={crown * 0.62} fill="url(#crown)" />}
    </Svg>
  );
};

/** The orb drawn by RN when there is no Unity orb to look at. `fullness` 0..1 (Animated). */
export const DrawnOrb: React.FC<{ fullness: Animated.Value; size: number }> = ({ fullness, size }) => {
  const scale = fullness.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });
  const opacity = fullness.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] });
  return (
    <Animated.View pointerEvents="none" testID="garden-orb" style={{ width: size, height: size, opacity, transform: [{ scale }] }}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id="orb" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FFFBEA" stopOpacity={1} />
            <Stop offset="0.45" stopColor={GARDEN.sap} stopOpacity={0.75} />
            <Stop offset="1" stopColor={GARDEN.leaf} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill="url(#orb)" />
      </Svg>
    </Animated.View>
  );
};

/** The garden's call to action: sap-gold pill. `quiet` = a navy plate with a hairline. */
export const GardenButton: React.FC<{ label: string; onPress: () => void; quiet?: boolean; testID?: string; disabled?: boolean }> = ({
  label, onPress, quiet, testID, disabled,
}) => (
  <Pressable
    testID={testID}
    onPress={onPress}
    disabled={disabled}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [styles.button, quiet && styles.buttonQuiet, disabled && styles.disabled, pressed && styles.pressed]}>
    <Text style={[styles.buttonText, quiet && styles.buttonTextQuiet]} numberOfLines={1}>{label}</Text>
  </Pressable>
);

export const styles = StyleSheet.create({
  ringCentre: { alignItems: 'center', justifyContent: 'center' },
  ringLevel: { fontFamily: SERIF, fontSize: 17, color: GARDEN.mist },
  button: {
    alignSelf: 'stretch',
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: GARDEN.sap,
    alignItems: 'center',
    shadowColor: GARDEN.sap,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  buttonQuiet: { backgroundColor: 'rgba(14,31,26,0.72)', borderWidth: 1, borderColor: 'rgba(242,207,122,0.6)', shadowOpacity: 0 },
  buttonText: { ...typography.h3, color: '#1B2A1F' },
  buttonTextQuiet: { color: GARDEN.mist },
  disabled: { opacity: 0.5 },
  pressed: { transform: [{ scale: 0.97 }] },
});
