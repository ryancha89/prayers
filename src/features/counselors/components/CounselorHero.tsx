import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { absoluteFill, colors, spacing, typography } from '../../../shared/theme';
import { CounselorSummary } from '../types';

/**
 * Large portrait / looped-render area at the top of the detail screen (spec §11).
 * MVP uses an accent placeholder; swap to a pre-rendered loop video (Option A)
 * by dropping a <Video> in place of the placeholder — Unity is NOT used here.
 */
export const CounselorHero: React.FC<{ counselor: CounselorSummary }> = ({ counselor }) => (
  <View style={[styles.hero, { backgroundColor: counselor.accent }]}>
    {counselor.heroUrl ? (
      <Image source={{ uri: counselor.heroUrl }} style={absoluteFill} />
    ) : (
      <Text style={styles.initial}>{counselor.name.charAt(0)}</Text>
    )}
    <View style={styles.scrim} />
    <View style={styles.caption}>
      <Text style={styles.name}>{counselor.name}</Text>
      <Text style={styles.title}>{counselor.title}</Text>
      <Text style={styles.hook}>“{counselor.hook}”</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  hero: {
    height: 460,
    justifyContent: 'center',
    alignItems: 'center',
  },
  initial: { fontSize: 180, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  scrim: {
    ...absoluteFill,
    backgroundColor: 'transparent',
    borderBottomWidth: 220,
    borderBottomColor: 'rgba(10,10,15,0.72)',
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
  hook: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm, lineHeight: 22 },
});
