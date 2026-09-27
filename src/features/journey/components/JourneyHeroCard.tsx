import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import type { Journey } from '../types';
import { JourneyBackdrop } from './JourneyBackdrop';

/**
 * The home's season feature: a night train under the stars, not a "신년운세" banner. The scenery
 * moves (slowly — the train is waiting at the platform), the copy sits low over a dark fade, and
 * the one button is gold.
 */
export const JourneyHeroCard: React.FC<{ journey: Journey; inProgress: boolean; onPress(): void }> = ({
  journey,
  inProgress,
  onPress,
}) => {
  const t = useT();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={StyleSheet.absoluteFill}>
        <JourneyBackdrop media={journey.thumbnail} speed={0.35} />
      </View>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#05041A" stopOpacity={0.1} />
            <Stop offset="0.45" stopColor="#05041A" stopOpacity={0.15} />
            <Stop offset="1" stopColor="#05041A" stopOpacity={0.92} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
      </Svg>
      <View style={styles.badge}>
        <Text style={styles.badgeText}>NEW SEASON</Text>
      </View>
      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{t(journey.eyebrow)}</Text>
        <Text style={styles.title}>{t(journey.title)}</Text>
        <Text style={styles.sub}>{t('journey.2027.sub')}</Text>
        <View style={styles.cta}>
          <Text style={styles.ctaText}>{t(inProgress ? 'journey.resume' : 'journey.start')}</Text>
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    height: 360,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(167,139,250,0.35)',
    backgroundColor: '#05041A',
  },
  pressed: { opacity: 0.92, transform: [{ scale: 0.995 }] },
  badge: {
    position: 'absolute', top: spacing.lg, left: spacing.lg,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: 'rgba(233,196,106,0.18)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
  badgeText: { ...typography.tiny, color: colors.gold, letterSpacing: 1.5 },
  copy: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xl, gap: spacing.sm },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  title: { ...typography.hero, color: colors.textPrimary, lineHeight: 38 },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  cta: {
    alignSelf: 'flex-start', marginTop: spacing.sm,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.gold,
  },
  ctaText: { ...typography.bodyStrong, color: '#1A1330' },
});
