import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { compactNumber } from '../../../shared/utils/time';
import { useT } from '../../../shared/i18n';
import { Badge } from '../../../shared/components/Badge';
import { CounselorSummary } from '../types';
import { GradientScrim } from '../../../shared/components/GradientScrim';
import { sfx } from '../../../shared/audio/sfx';

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
  // Coming-soon wins over NEW/TRENDING: those sell a counselor, and this one is not for sale
  // yet. A card badged NEW that opens nothing is the promise the badge should have withdrawn.
  const badge = counselor.comingSoon
    ? 'comingSoon'
    : counselor.isNew
      ? 'new'
      : counselor.isTrending
        ? 'trending'
        : undefined;
  return (
    <Pressable
      onPress={() => {
        sfx.tap();
        onPress();
      }}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={[styles.portrait, { backgroundColor: counselor.accent },
                    counselor.comingSoon && styles.portraitDim]}>
        {counselor.cardImage ? (
          // `cover`, and the art is cut to this exact aspect by Tools/gen_counselor_card_art.py,
          // so nothing is cropped in practice — cover is the safety net for a card whose art
          // arrives at another ratio, since `contain` would letterbox the accent through.
          <Image source={counselor.cardImage} style={styles.portraitImg} resizeMode="cover" />
        ) : counselor.thumbnailUrl ? (
          <Image source={{ uri: counselor.thumbnailUrl }} style={styles.portraitImg} />
        ) : (
          <Text style={styles.portraitInitial}>{counselor.name.charAt(0)}</Text>
        )}
        <GradientScrim height={64} opacity={0.55} />
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
  badgeWrap: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  // Legible, not hidden: the roster still shows who is planned.
  portraitDim: { opacity: 0.45 },
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
