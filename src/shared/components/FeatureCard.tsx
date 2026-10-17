import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { Icon } from './Icon';
import { colors, radius, spacing, typography } from '../theme';

const ON_GOLD = '#1A1330';

/**
 * Home's card for something that is not a counsellor — the Schopenhauer lectures, the meditation
 * room (16-10, user: "이것도 카드형식으로"): a tall picture on the left, a gold line saying what it
 * is (free, how long), the title, one line about it, optional progress, and one gold button.
 * One shape for both, so the two read as the same kind of thing on the list.
 */
export const FeatureCard: React.FC<{
  image: ImageSourcePropType;
  badge: string;
  title: string;
  tagline: string;
  cta: string;
  /** 0..1 and its caption ("3/12 완료"); omitted until there is any. */
  progress?: { share: number; label: string };
  onPress(): void;
  testID?: string;
}> = ({ image, badge, title, tagline, cta, progress, onPress, testID }) => (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={`${title} · ${cta}`}
    style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    onPress={onPress}>
    <Image source={image} style={styles.portrait} resizeMode="cover" />
    <View style={styles.body}>
      <Text style={styles.badge}>{badge}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.tagline} numberOfLines={2}>{tagline}</Text>
      {progress && (
        <View style={styles.progressRow}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.round(progress.share * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{progress.label}</Text>
        </View>
      )}
      <View style={styles.cta}>
        <Icon name="play" size={12} color={ON_GOLD} />
        <Text style={styles.ctaText}>{cta}</Text>
      </View>
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.3)',
    overflow: 'hidden',
    marginTop: spacing.md,
  },
  portrait: { width: 118, height: 176 },
  body: { flex: 1, padding: spacing.md, gap: 4, justifyContent: 'center' },
  badge: { ...typography.tiny, color: colors.gold, letterSpacing: 0.5 },
  title: { ...typography.h3, color: colors.textPrimary },
  tagline: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4 },
  track: { flex: 1, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', overflow: 'hidden' },
  fill: { height: 4, backgroundColor: colors.gold },
  progressText: { ...typography.tiny, color: colors.textMuted },
  cta: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 7, paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  ctaText: { ...typography.caption, color: ON_GOLD, fontWeight: '700' },
  pressed: { opacity: 0.85 },
});
