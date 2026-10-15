import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * A transparent-to-dark wash along the bottom of an image, so text laid over artwork stays legible.
 *
 * This replaces a `borderBottomWidth` block. That trick paints a rectangle of flat colour, which
 * over a flat accent block was invisible — but over real artwork it draws a hard horizontal seam
 * across the picture, which is exactly what it looked like: a bar, not a fade.
 *
 * `react-native-svg` is already a dependency (the icon set uses it), so this costs nothing new.
 */
export const GradientScrim: React.FC<{
  /** How far up from the bottom the wash reaches. */
  height: number;
  /** Opacity at the very bottom. */
  opacity?: number;
  color?: string;
}> = ({ height, opacity = 0.88, color = '#0A0A0F' }) => (
  <View style={[styles.wrap, { height }]} pointerEvents="none">
    <Svg width="100%" height="100%">
      <Defs>
        <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={color} stopOpacity={0} />
          {/* Weighted towards the bottom: a straight ramp leaves the middle too light to read on. */}
          <Stop offset="0.45" stopColor={color} stopOpacity={opacity * 0.45} />
          <Stop offset="1" stopColor={color} stopOpacity={opacity} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#scrim)" />
    </Svg>
  </View>
);

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
