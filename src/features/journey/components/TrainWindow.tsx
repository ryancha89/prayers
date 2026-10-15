import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/**
 * The window frame the view is seen through: a rounded pane, a thin brass edge, glass sheen and a
 * vignette at the corners. Everything behind it is JourneyBackdrop.
 */
export const TrainWindow: React.FC<{ style?: ViewStyle; children: React.ReactNode }> = ({ style, children }) => (
  <View style={[styles.frame, style]}>
    <View style={styles.pane}>
      {children}
      {/* glass: a soft diagonal sheen and darker corners */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="sheen" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0.1} />
            <Stop offset="0.35" stopColor="#FFFFFF" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id="vig" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#000000" stopOpacity={0.35} />
            <Stop offset="0.25" stopColor="#000000" stopOpacity={0} />
            <Stop offset="0.75" stopColor="#000000" stopOpacity={0} />
            <Stop offset="1" stopColor="#000000" stopOpacity={0.45} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#sheen)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#vig)" />
      </Svg>
    </View>
  </View>
);

const styles = StyleSheet.create({
  frame: {
    borderRadius: 34,
    padding: 6,
    backgroundColor: '#1B1630',
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.35)',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
  },
  pane: { flex: 1, borderRadius: 28, overflow: 'hidden', backgroundColor: '#05041A' },
});
