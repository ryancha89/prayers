import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import type { Journey } from '../types';
import { JourneyTrainArt } from './JourneyTrainArt';
import { useScreen } from '../../../shared/device/screen';

/**
 * The home's season feature: the night train crossing into 2027. The painting drifts slowly
 * (a Ken Burns pan, nothing that competes with the copy), a few stars glint, a thin gold rule
 * frames it like a ticket, and the travelling companions — the four counsellors — sit beside the
 * one gold button.
 */
export const JourneyHeroCard: React.FC<{ journey: Journey; inProgress: boolean; onPress(): void }> = ({
  journey,
  inProgress,
  onPress,
}) => {
  const t = useT();
  const lang = useLang();
  // 400pt is the whole height of a phone held sideways: there the card is a banner across the
  // centred column, short enough that the counsellor list starts on the first screen.
  const screen = useScreen();
  const height = screen.landscape ? screen.vh(0.75, 260, 320) : CARD_HEIGHT;
  const companions = journey.counselors
    .map(c => getLocalizedCounselor(c.id, lang))
    .filter((c): c is NonNullable<typeof c> => !!c?.avatarImage);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.card, { height }, pressed && styles.pressed]}>
      <JourneyTrainArt />

      {/* Dark lake under the copy; a touch of shade at the very top for the badge. */}
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        <Defs>
          <LinearGradient id="heroFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#05041A" stopOpacity={0.35} />
            <Stop offset="0.18" stopColor="#05041A" stopOpacity={0} />
            <Stop offset="0.5" stopColor="#05041A" stopOpacity={0.12} />
            <Stop offset="0.78" stopColor="#05041A" stopOpacity={0.78} />
            <Stop offset="1" stopColor="#05041A" stopOpacity={0.95} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#heroFade)" />
      </Svg>

      {/* The ticket's gold rule. */}
      <View pointerEvents="none" style={styles.rule} />

      <View style={styles.badge}>
        <Text style={styles.badgeText}>NEW SEASON</Text>
      </View>

      <View style={styles.copy}>
        <Text style={styles.eyebrow}>{t(journey.eyebrow)}</Text>
        <Text style={styles.title}>{t(journey.title)}</Text>
        <Text style={styles.sub}>{t('journey.2027.sub')}</Text>
        <View style={styles.footer}>
          <View style={styles.cta}>
            <Text style={styles.ctaText}>{t(inProgress ? 'journey.resume' : 'journey.start')}</Text>
            <Icon name="arrowRight" size={16} color="#1A1330" />
          </View>
          <View style={styles.companions} accessibilityElementsHidden>
            {companions.map((c, i) => (
              <Image key={c.id} source={c.avatarImage} style={[styles.avatar, { marginLeft: i === 0 ? 0 : -10, zIndex: 10 - i }]} />
            ))}
          </View>
        </View>
      </View>
    </Pressable>
  );
};

const CARD_HEIGHT = 400;

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing.xl,
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.35)',
    backgroundColor: '#05041A',
    shadowColor: '#8B5CF6',
    shadowOpacity: 0.35,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
  },
  pressed: { opacity: 0.94, transform: [{ scale: 0.99 }] },
  rule: {
    position: 'absolute', top: 7, left: 7, right: 7, bottom: 7,
    borderRadius: radius.xl - 5, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.55)',
  },
  badge: {
    position: 'absolute', top: spacing.lg + 2, left: spacing.lg + 2,
    paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: 'rgba(10,8,30,0.55)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.7)',
  },
  badgeText: { ...typography.tiny, color: colors.gold, letterSpacing: 1.5 },
  copy: { position: 'absolute', left: spacing.xl, right: spacing.xl, bottom: spacing.xl, gap: spacing.sm },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  title: {
    ...typography.hero, color: colors.textPrimary, lineHeight: 38,
    textShadowColor: 'rgba(5,4,26,0.8)', textShadowRadius: 10, textShadowOffset: { width: 0, height: 2 },
  },
  sub: { ...typography.body, color: 'rgba(236,232,255,0.82)', lineHeight: 22 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.pill, backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.45, shadowRadius: 12, shadowOffset: { width: 0, height: 0 },
  },
  ctaText: { ...typography.bodyStrong, color: '#1A1330' },
  companions: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    borderWidth: 1.5, borderColor: 'rgba(233,196,106,0.85)', backgroundColor: '#1A1330',
  },
});
