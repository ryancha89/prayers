import React, { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';

/** How far above the safe bottom the prompt floats. Portrait: clear of the stick's zone (bottom-left,
 *  220pt) and, in the world, of the run / Map / Quest / Menu stack on the right. Landscape: low, near
 *  the bottom edge — the pill is centred, so it already sits between the stick's corner and the
 *  right-hand stack, and the old 150pt put it level with the third-person player's head (08-10
 *  screenshot, the walk-in room's Talk). Exported for the tests. */
export const PROMPT_LIFT = { portrait: 250, landscape: 20 };

/**
 * The gold "you can do something here" pill: the world's Enter at a door, and the consultation
 * room's Talk when the counsellor is in reach (02-10: one look for both, so a player who learnt it
 * in the world reads it in the room).
 *
 * It pops in rather than appearing on one frame, and again whenever `popKey` changes (a different
 * door). It is centred between the safe-area edges, never at a corner: a corner is where the
 * Dynamic Island sits in landscape and the home indicator in portrait, and the room's old
 * bottom-right Talk ended up under the island (02-10 screenshot).
 */
export const PromptButton: React.FC<{
  label: string;
  onPress(): void;
  popKey?: unknown;
  testID?: string;
}> = ({ label, onPress, popKey, testID }) => {
  const safe = useSafeAreaInsets();
  const landscape = useScreen().landscape;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [popKey, pop]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          left: safe.left,
          right: safe.right,
          bottom: safe.bottom + (landscape ? PROMPT_LIFT.landscape : PROMPT_LIFT.portrait),
          opacity: pop,
          transform: [{ scale: pop }],
        },
      ]}>
      <Pressable
        testID={testID}
        onPress={() => { sfx.select(); onPress(); }}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.pill, pressed && styles.pressed]}>
        <Text style={styles.text}>{label}</Text>
        <Icon name="arrowRight" size={16} color="#1A1330" />
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  text: { ...typography.h3, color: '#1A1330' },
  pressed: { opacity: 0.75 },
});
