import React from 'react';
import { Animated, type ImageSourcePropType, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { SERIF } from '../../../shared/components/hud/Hud';
import { BREATH } from '../session';

/**
 * The meditation room's own visual language (13-10 redesign, after "UI không hợp lý"): the room is
 * lit by a paper lantern and has a bronze singing bowl on its shelf, so the breath is drawn as THOSE —
 * not as a white UI ring with a dot on it, which read as a targeting reticle over her.
 *
 *   · The breath's light itself is NOT here: it lives in the room (Unity's MeditationBreathLight),
 *     behind her and on the rug, because an overlay can only lie on top of her (13-10).
 *   · PaceLine — the 4·4·6 rhythm as one hairline in three lengths, a spark travelling it.
 *   · Vignette — the room darkens toward the edges, never over her; a flat wash muddied the whole room.
 *   · ArtWait — what shows while a room loads: a picture of the girl, full screen, drifting slowly,
 *     its name over it. From 13-10 to 22-10 it was a lone lantern on dusk (Threshold, removed): the
 *     PM's screenshot of exactly that asked for the character instead.
 */

/** The room's world, as tokens. */
export const MED = {
  lantern: '#F6C98A', // the paper lanterns' amber
  ember: '#FFE3B3', // the spark, a little hotter than the lantern
  paper: '#F4EBDD', // ivory, the HUD's text colour
  dusk: '#1B1222', // plum, the room's shadow side
  ash: 'rgba(244,235,221,0.62)', // incense-ash secondary text
};

/** How much of one breath each phase takes (4·4·6 → 0.286 · 0.286 · 0.428). */
const SPANS = (() => {
  const total = BREATH.reduce((s, b) => s + b.seconds, 0);
  return BREATH.map(b => b.seconds / total);
})();

/** The rhythm on a hairline: three lengths for in · hold · out, the spark at where the breath is. */
export const PaceLine: React.FC<{ width: number; cycle: Animated.Value }> = ({ width, cycle }) => {
  const x = cycle.interpolate({ inputRange: [0, 1], outputRange: [0, width] });
  return (
    <View style={[styles.pace, { width }]} pointerEvents="none" testID="med-pace">
      {SPANS.map((s, i) => (
        <View key={i} style={[styles.paceSeg, { width: width * s - (i < SPANS.length - 1 ? GAP : 0) }, i < SPANS.length - 1 && { marginRight: GAP }]} />
      ))}
      <Animated.View style={[styles.spark, { transform: [{ translateX: x }] }]} />
    </View>
  );
};
const GAP = 4;

/** Edges into shadow, the middle clear: the room recedes, she does not. `strength` 0–1. */
export const Vignette: React.FC<{ width: number; height: number; strength: Animated.Value | Animated.AnimatedInterpolation<number> | number }> = ({
  width, height, strength,
}) => (
  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: strength }]}>
    <Svg width={width} height={height}>
      <Defs>
        <RadialGradient id="vignette" cx="50%" cy="46%" rx="70%" ry="70%">
          <Stop offset="0.35" stopColor={MED.dusk} stopOpacity={0} />
          <Stop offset="1" stopColor={MED.dusk} stopOpacity={0.85} />
        </RadialGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#vignette)" />
    </Svg>
  </Animated.View>
);

/** Behind the bottom band's words: the floor fades into dusk, so they read without a box. */
export const BottomFade: React.FC<{ width: number; height: number }> = ({ width, height }) => (
  <View pointerEvents="none" style={[styles.fade, { height }]}>
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={MED.dusk} stopOpacity={0} />
          <Stop offset="1" stopColor={MED.dusk} stopOpacity={0.82} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill="url(#floor)" />
    </Svg>
  </View>
);

/**
 * What a room shows while Unity loads it, and all it shows without the player: the room's own
 * picture of the girl, full screen, drifting slowly with `pulse` (a night light, not a spinner),
 * shaded toward the words at the bottom, its name over it. `blur` softens a picture smaller than the
 * screen (the sleep card is 700 × 854, ~3.7× up) so it reads as dreamy rather than low-res.
 */
export const ArtWait: React.FC<{
  source: ImageSourcePropType;
  title: string;
  pulse: Animated.Value;
  width: number;
  height: number;
  blur?: number;
  testID?: string;
}> = ({ source, title, pulse, width, height, blur = 0, testID }) => {
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1.03, 1.08] });
  return (
    <View style={styles.artFrame} testID={testID}>
      {/* An explicit size, not just absoluteFill: an Image laid out from four zero insets takes the
          bitmap's own size (the 23-09 lesson, "sao đang ở góc này?"). */}
      <Animated.Image source={source} resizeMode="cover" blurRadius={blur}
        style={[styles.art, { transform: [{ scale }] }]} />
      <View style={styles.artShade} />
      <Vignette width={width} height={height} strength={0.85} />
      <BottomFade width={width} height={Math.round(height * 0.45)} />
      <Text style={styles.artTitle}>{title}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  pace: { flexDirection: 'row', alignItems: 'center', height: 10 },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  paceSeg: { height: 1, backgroundColor: 'rgba(244,235,221,0.38)' },
  spark: {
    position: 'absolute', left: -3, width: 6, height: 6, borderRadius: 3, backgroundColor: MED.ember,
    shadowColor: MED.lantern, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  artFrame: { ...StyleSheet.absoluteFill, overflow: 'hidden', alignItems: 'center', backgroundColor: MED.dusk },
  art: { ...StyleSheet.absoluteFill, width: '100%', height: '100%' },
  artShade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(16,10,30,0.30)' },
  artTitle: {
    position: 'absolute',
    top: '17%',   // over the window's sky in both pictures, clear of her face (at 38% it crossed her chest)
    fontFamily: SERIF,
    fontSize: 22,
    letterSpacing: 6,
    color: MED.paper,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 10,
    textShadowOffset: { width: 0, height: 1 },
  },
});
