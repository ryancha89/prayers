import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { journeyActive, useJourneyPlayer } from '../player/journeyPlayer';
import { sfx } from '../../../shared/audio/sfx';
import { JOURNEYS } from '../data/journeys';
import { JOURNEY_HERO_ART } from './JourneyTrainArt';

/**
 * The journey, kept alive while the player looks at something else: 🚂 title, the station and the
 * guide, a thin progress line, play/pause. Tapping it goes back to the train.
 *
 * Mounted once, above the navigator (App.tsx), and told where it sits: above the tab bar on the
 * tabs, just above the home indicator elsewhere.
 */
export const JourneyMiniPlayer: React.FC<{ aboveTabs: boolean; hidden: boolean; onOpen(): void }> = ({
  aboveTabs,
  hidden,
  onOpen,
}) => {
  const t = useT();
  const lang = useLang();
  const insets = useSafeAreaInsets();
  const s = useJourneyPlayer();
  if (hidden || !journeyActive(s) || !s.journeyId) return null;
  const journey = JOURNEYS[s.journeyId];
  const chapter = journey?.chapters[s.transitionTo ?? s.chapterIndex];
  const guide = s.counselorId ? getLocalizedCounselor(s.counselorId, lang) : undefined;
  const progress = s.duration > 0 ? Math.min(1, s.position / s.duration) : 0;
  const bottom = insets.bottom + (aboveTabs ? 49 + spacing.sm : spacing.sm);

  return (
    <Pressable style={[styles.bar, { bottom }]} onPress={() => { sfx.tap(); onOpen(); }} accessibilityRole="button">
      <View style={styles.row}>
        {/* The key art, not 🚂: the emoji drew as a "?" box on the simulator's font set. */}
        <Image source={JOURNEY_HERO_ART} style={styles.thumb} />
        <View style={styles.body}>
          <Text style={styles.title} numberOfLines={1}>
            {t('journey.mini.title', { year: journey?.year ?? '' })}
          </Text>
          <Text style={styles.sub} numberOfLines={1}>
            {chapter?.subtitle ? t(chapter.subtitle) : ''}
            {guide ? ` · ${guide.name}` : ''}
          </Text>
        </View>
        <Pressable hitSlop={12} onPress={() => { sfx.tap(); s.toggle(); }} accessibilityRole="button" style={styles.play}>
          <Icon name={s.status === 'playing' ? 'pause' : 'play'} size={16} color={colors.bg} />
        </Pressable>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${progress * 100}%` }]} />
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  bar: {
    position: 'absolute', left: spacing.md, right: spacing.md,
    borderRadius: radius.lg, backgroundColor: 'rgba(26,20,52,0.97)',
    borderWidth: 1, borderColor: 'rgba(167,139,250,0.35)', overflow: 'hidden',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  thumb: { width: 40, height: 40, borderRadius: radius.sm, borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)' },
  body: { flex: 1 },
  title: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  sub: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  play: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  track: { height: 2, backgroundColor: 'rgba(255,255,255,0.1)' },
  fill: { height: 2, backgroundColor: colors.gold },
});
