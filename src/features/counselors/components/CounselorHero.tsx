import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { useScreen } from '../../../shared/device/screen';
import {
  absoluteFill,
  colors,
  spacing,
  typography,
} from '../../../shared/theme';
import { CounselorSummary } from '../types';
import { GradientScrim } from '../../../shared/components/GradientScrim';

/**
 * Large portrait / looped-render area at the top of the detail screen (spec §11).
 * Shows the counselor's own artwork; the accent block is the fallback for one with no art yet.
 * Swap to a pre-rendered loop video (Option A) by dropping a <Video> over the Image — Unity is
 * NOT used here.
 *
 * The art is cut to 0.82 and this well is 460 tall and full-bleed wide, so `cover` crops the sides
 * on a wide phone. That is the right way round: the art is drawn with the head centred, so the
 * sides are background and the face survives every phone width.
 *
 * `overflow: hidden` on the frame and an explicit 100%/100% on the Image are both load-bearing.
 * iOS does not clip children by default, and an absolutely-positioned Image given only insets was
 * painting past the 460 and straight over the tags, the Preview heading and the chips below it.
 */
export const CounselorHero: React.FC<{ counselor: CounselorSummary }> = ({
  counselor,
}) => {
  // 460 was measured on a 844pt phone, where it is 55% of the screen. Kept as a share of the
  // window so it stays a hero on a small phone instead of eating the whole first screen, and the
  // scrim keeps its proportion of it rather than covering a different amount of the art.
  const screen = useScreen();
  const height = screen.vh(0.55, 320, 460);
  return (
    <View style={[styles.hero, { height, backgroundColor: counselor.accent }]}>
      {counselor.cardImage ? (
        <Image
          source={counselor.cardImage}
          style={styles.art}
          resizeMode="cover"
        />
      ) : counselor.heroUrl ? (
        <Image source={{ uri: counselor.heroUrl }} style={absoluteFill} />
      ) : (
        <Text style={styles.initial}>{counselor.name.charAt(0)}</Text>
      )}
      <GradientScrim height={Math.round(height * 0.57)} />
      <View style={styles.caption}>
        <Text style={styles.name}>{counselor.name}</Text>
        <Text style={styles.title}>{counselor.title}</Text>
        <Text style={styles.hook}>“{counselor.hook}”</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  hero: {
    // height comes from useScreen at the call site.
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  art: { ...absoluteFill, width: '100%', height: '100%' },
  initial: {
    fontSize: 180,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.85)',
  },
  caption: {
    position: 'absolute',
    left: spacing.xl,
    right: spacing.xl,
    bottom: spacing.xl,
    gap: 4,
  },
  name: { ...typography.hero, color: colors.textPrimary },
  title: { ...typography.body, color: colors.violetSoft },
  hook: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    lineHeight: 22,
  },
});
