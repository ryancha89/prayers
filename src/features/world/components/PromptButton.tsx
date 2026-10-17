import React, { useEffect, useRef } from 'react';
import { Animated, Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
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
 *
 * 16-10 (user: "이 버튼도 개선"): a flat mustard slab with a gold glow that muddied into the floor.
 * Now it has depth — a pale top rim and a dark drop shadow, so it holds against a bright room —
 * a slow halo that breathes around it (it is the one thing to do here), and, when it leads to
 * someone, their face: the room's Talk shows the counsellor's avatar and says whom you will talk to.
 */
export const PromptButton: React.FC<{
  label: string;
  onPress(): void;
  popKey?: unknown;
  testID?: string;
  /** Points above the usual spot — a second prompt shown at once (the room's Leave over Talk). */
  raise?: number;
  /** Whom the prompt leads to: a round face on its left (the room's Talk). */
  avatar?: ImageSourcePropType;
}> = ({ label, onPress, popKey, testID, raise = 0, avatar }) => {
  const safe = useSafeAreaInsets();
  const landscape = useScreen().landscape;
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [popKey, pop]);
  const halo = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(halo, { toValue: 1, duration: 1800, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [halo]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        {
          left: safe.left,
          right: safe.right,
          bottom: safe.bottom + (landscape ? PROMPT_LIFT.landscape : PROMPT_LIFT.portrait) + raise,
          opacity: pop,
          transform: [{ scale: pop }],
        },
      ]}>
      <View>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.halo,
            {
              opacity: halo.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [
                { scaleX: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
                { scaleY: halo.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
              ],
            },
          ]}
        />
        <Pressable
          testID={testID}
          onPress={() => { sfx.select(); onPress(); }}
          accessibilityRole="button"
          accessibilityLabel={label}
          style={({ pressed }) => [styles.pill, avatar != null && styles.pillWithAvatar, pressed && styles.pressed]}>
          {avatar != null && <Image source={avatar} style={styles.avatar} />}
          <Text style={styles.text} numberOfLines={1}>{label}</Text>
          <View style={styles.arrow}>
            <Icon name="arrowRight" size={14} color={colors.gold} />
          </View>
        </Pressable>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingLeft: spacing.xl, paddingRight: spacing.sm, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: colors.gold,
    borderWidth: 1.5, borderColor: 'rgba(255, 244, 214, 0.95)',
    shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 10, shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pillWithAvatar: { paddingLeft: spacing.xs },
  // The breathing ring: the pill's own shape, in gold, growing and fading behind it.
  halo: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.gold,
  },
  avatar: { width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: '#1A1330' },
  text: { ...typography.h3, color: '#1A1330' },
  // The way forward, as a dark coin with a gold arrow — the HUD's ring, small.
  arrow: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#1A1330',
  },
  pressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },
});
