import React from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { compactNumber } from '../../../shared/utils/time';
import { useT } from '../../../shared/i18n';
import { Badge } from '../../../shared/components/Badge';
import { CounselorSummary } from '../types';

/**
 * Character-first discovery card (spec §6). Emphasises the portrait; feels like
 * a story card, not a booking card. Uses an accent placeholder when no artwork
 * asset is bundled (spec §51-P2).
 */
export const CounselorCard: React.FC<{
  counselor: CounselorSummary;
  onPress: () => void;
}> = ({ counselor, onPress }) => {
  const t = useT();
  const badge = counselor.isNew ? 'new' : counselor.isTrending ? 'trending' : undefined;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.portrait, { backgroundColor: counselor.accent }]}>
        {counselor.thumbnailUrl ? (
          <Image source={{ uri: counselor.thumbnailUrl }} style={styles.portraitImg} />
        ) : (
          <Text style={styles.portraitInitial}>{counselor.name.charAt(0)}</Text>
        )}
        <View style={styles.portraitScrim} />
        {badge && (
          <View style={styles.badgeWrap}>
            <Badge kind={badge} />
          </View>
        )}
      </View>

      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {counselor.name}
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {counselor.title}
        </Text>
        <Text style={styles.hook} numberOfLines={2}>
          {counselor.hook}
        </Text>

        <View style={styles.tagsRow}>
          {counselor.tags.slice(0, 3).map(tag => (
            <Text key={tag} style={styles.tag} numberOfLines={1}>
              {tag}
            </Text>
          ))}
        </View>

        {!!counselor.conversationCount && (
          <Text style={styles.meta}>
            {t('card.conversations', { count: compactNumber(counselor.conversationCount) })}
          </Text>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  pressed: { backgroundColor: colors.cardPressed, opacity: 0.95 },
  portrait: {
    aspectRatio: 0.82,
    justifyContent: 'center',
    alignItems: 'center',
  },
  portraitImg: { ...absoluteFill, width: '100%', height: '100%' },
  portraitInitial: {
    fontSize: 72,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.9)',
  },
  portraitScrim: {
    ...absoluteFill,
    backgroundColor: 'transparent',
    borderBottomWidth: 48,
    borderBottomColor: 'rgba(0,0,0,0.25)',
  },
  badgeWrap: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  body: { padding: spacing.md, gap: 3 },
  name: { ...typography.h3, color: colors.textPrimary },
  title: { ...typography.caption, color: colors.violetSoft },
  hook: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 18,
  },
  tagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  tag: { ...typography.tiny, color: colors.textMuted },
  meta: { ...typography.tiny, color: colors.gold, marginTop: 6 },
});
