import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { ActiveCard } from '../player/journeyPlayer';
import { monthsLabel } from '../format';

/** How long a card stays before it drifts away on its own. */
const CARD_MS = 6500;

/**
 * A key moment, lifted out of the narration: it rises over the window when the voice reaches it,
 * stays a few seconds, and goes — so the journey never turns into an audiobook with no pictures,
 * and never into a results page either.
 */
export const FortuneCardOverlay: React.FC<{
  card: ActiveCard;
  year: number;
  onDone(): void;
  onSave(card: ActiveCard): void;
}> = ({ card, year, onDone, onSave }) => {
  const t = useT();
  const lang = useLang();
  const a = useRef(new Animated.Value(0)).current;
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    const id = setTimeout(() => {
      Animated.timing(a, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onDone());
    }, card.holdMs ?? CARD_MS);
    return () => clearTimeout(id);
  }, [a, onDone, card.key, card.holdMs]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: a,
          transform: [
            { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
            { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
          ],
        },
      ]}>
      <Text style={styles.eyebrow}>{t('journey.card.eyebrow', { year })}</Text>
      {card.months.length > 0 && <Text style={styles.months}>{monthsLabel(card.months, lang)}</Text>}
      <Text style={styles.title}>{card.title}</Text>
      <Text style={styles.stars}>{'★'.repeat(card.stars)}{'☆'.repeat(5 - card.stars)}</Text>
      {card.saveable && (
        <Pressable
          style={[styles.save, saved && styles.saved]}
          disabled={saved}
          onPress={() => {
            sfx.select();
            onSave(card);
            setSaved(true);
          }}>
          <Text style={styles.saveText}>{saved ? t('journey.card.saved') : t('journey.card.save')}</Text>
        </Pressable>
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    alignSelf: 'center',
    width: '82%',
    // A landscape window is ~520pt wide: 82% of it is a banner, not a card.
    maxWidth: 420,
    maxHeight: '100%',
    padding: spacing.xl,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(18,14,40,0.88)',
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.5)',
    alignItems: 'center',
    gap: spacing.sm,
    shadowColor: colors.gold,
    shadowOpacity: 0.35,
    shadowRadius: 22,
  },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 2 },
  months: { ...typography.h1, color: colors.textPrimary },
  title: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  stars: { fontSize: 18, color: colors.gold, letterSpacing: 3 },
  save: {
    marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.violetSoft,
  },
  saved: { borderColor: colors.textMuted },
  saveText: { ...typography.caption, color: colors.violetSoft },
});

