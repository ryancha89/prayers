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
/** Never on screen for less than this, however long it waited to rise. */
const MIN_SHOWN_MS = 2500;

/**
 * A key moment, lifted out of the narration: it rises over the window when the voice reaches it,
 * stays a few seconds, and goes — so the journey never turns into an audiobook with no pictures,
 * and never into a results page either.
 */
type Props = {
  card: ActiveCard;
  year: number;
  onDone(): void;
  onSave(card: ActiveCard): void;
  /** Wait this long before rising — the counsellor's reaction to the month plays first. Taken out of
   *  the card's hold, so the next card is not pushed back. */
  delayMs?: number;
};

/**
 * A delayed card is not MOUNTED until it rises. Mounted at once and revealed by a state change, the
 * re-render that state change caused committed the Animated value's JS-side 0 over the native-driven
 * spring on Fabric, and the card never showed at all (sim 07-10).
 */
export const FortuneCardOverlay: React.FC<Props> = props => {
  const { card, delayMs = 0 } = props;
  const [risen, setRisen] = useState(delayMs <= 0);
  useEffect(() => {
    if (delayMs <= 0) { setRisen(true); return undefined; }
    setRisen(false);
    const id = setTimeout(() => setRisen(true), delayMs);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.key]);
  if (!risen) return null;
  const holdMs = Math.max(card.holdMs ?? CARD_MS, delayMs + MIN_SHOWN_MS) - delayMs;
  return <RisenCard {...props} holdMs={holdMs} />;
};

const RisenCard: React.FC<Props & { holdMs: number }> = ({ card, year, onDone, onSave, holdMs }) => {
  const t = useT();
  const lang = useLang();
  const a = useRef(new Animated.Value(0)).current;
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Animated.spring(a, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    const id = setTimeout(() => {
      Animated.timing(a, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => onDone());
    }, holdMs);
    return () => clearTimeout(id);
  }, [a, onDone, card.key, holdMs]);

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
  // The in-world ghost button (the diary's): gold outline, gold word.
  save: {
    marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.gold,
  },
  saved: { borderColor: colors.textMuted },
  saveText: { ...typography.caption, color: colors.gold },
});

