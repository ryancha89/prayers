import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';

/** The coach's three cards, and where each sits: by the room (pick), over the tray (move/turn),
 *  under the top bar (two fingers · Undo). */
const STEPS: { text: TranslationKey; at: 'middle' | 'low' | 'high' }[] = [
  { text: 'myroom.coach.1', at: 'middle' },
  { text: 'myroom.coach.2', at: 'low' },
  { text: 'myroom.coach.3', at: 'high' },
];
export const COACH_STEPS = STEPS.length;

/**
 * Decorate mode's first-visit coach (14-10): one card at a time over a light dim, near the part of
 * the screen it is about. A tap anywhere moves on, as does Next; the last card's button is Got it.
 * The dim takes every touch while it is up, so nothing under it is edited by accident. Shown once
 * per account (myRoomStore.coachSeen) and again from the bar's "?".
 */
export const DecorateCoach: React.FC<{ step: number; topInset: number; bottomInset: number; onNext(): void }> = ({
  step, topInset, bottomInset, onNext,
}) => {
  const t = useT();
  const s = STEPS[Math.max(0, Math.min(STEPS.length - 1, step))];
  const last = step >= STEPS.length - 1;
  const next = () => { sfx.tap(); onNext(); };
  const place = s.at === 'high' ? { top: topInset + 110 }
    : s.at === 'low' ? { bottom: bottomInset + 220 }
    : { top: '40%' as const };
  return (
    <Pressable testID="myroom-coach" accessibilityRole="button" accessibilityLabel={t(s.text)} onPress={next} style={styles.dim}>
      <View style={[styles.card, place]} pointerEvents="box-none">
        <Text style={styles.step}>{`${step + 1}/${STEPS.length}`}</Text>
        <Text style={styles.text} testID="myroom-coach-text">{t(s.text)}</Text>
        <Pressable testID="myroom-coach-next" accessibilityRole="button" onPress={next} style={({ pressed }) => [styles.next, pressed && styles.pressed]}>
          <Text style={styles.nextText}>{t(last ? 'myroom.coach.gotIt' : 'myroom.coach.next')}</Text>
        </Pressable>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  dim: { ...absoluteFill, backgroundColor: 'rgba(6,5,20,0.45)' },
  card: {
    position: 'absolute', left: spacing.xl, right: spacing.xl, gap: spacing.sm, alignItems: 'center',
    padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: 'rgba(14,12,40,0.94)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
  step: { ...typography.tiny, color: colors.textSecondary },
  text: { ...typography.body, color: colors.textPrimary, textAlign: 'center' },
  next: { paddingHorizontal: spacing.xl, paddingVertical: spacing.xs, borderRadius: radius.pill, backgroundColor: colors.gold },
  nextText: { ...typography.caption, color: '#1A1330', fontWeight: '700' },
  pressed: { opacity: 0.75 },
});
