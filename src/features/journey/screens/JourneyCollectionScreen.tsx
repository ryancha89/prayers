import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { CoinPill } from '../../coins/components/CoinPill';
import { useSavedJourneys } from '../store/savedJourneysStore';
import { JOURNEYS } from '../data/journeys';
import { useJourneyPlayer } from '../player/journeyPlayer';
import { collectionOf } from '../collection';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The journey's collection (mockup panel 22): every numbered station with how much of it is open.
 * Tapping one rides back to it — its locks are still there to open. "내 컬렉션 보기" is the
 * keepsake: the year's summary and the Fortune Ticket (JourneyResult).
 */
export const JourneyCollectionScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const s = useJourneyPlayer();
  const journey = s.journeyId ? JOURNEYS[s.journeyId] : null;
  const heard = useSavedJourneys(x => (s.journeyId ? x.heard[s.journeyId] : undefined));
  const keepJourney = useSavedJourneys(x => x.save);
  // Reaching the end keeps the journey for the 아카이브, as arriving did before (upsert).
  useEffect(() => {
    if (!journey || !s.content || !s.counselorId || !s.tone) return;
    keepJourney({ journeyId: journey.id, counselorId: s.counselorId, tone: s.tone, lang: s.lang, year: journey.year, content: s.content });
  }, [journey, s.content, s.counselorId, s.tone, s.lang, keepJourney]);

  if (!journey) return null;
  const rows = collectionOf(journey, s.content, heard ?? []);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.header}>
        <Pressable hitSlop={12} onPress={() => { sfx.back(); navigation.goBack(); }} accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
        <View style={styles.flex} />
        <CoinPill />
      </View>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('journey.collection.title', { year: journey.year })}</Text>
        <Text style={styles.sub}>{t('journey.collection.sub')}</Text>
        {rows.map(r => {
          const chapter = journey.chapters[r.index];
          const full = r.opened >= r.total;
          return (
            <Pressable
              key={r.chapterId}
              style={styles.row}
              onPress={() => {
                sfx.select();
                s.replay(r.index);
                navigation.replace('Journey');
              }}
              accessibilityRole="button">
              <Text style={styles.number}>{r.number}</Text>
              <Text style={styles.name}>{chapter.subtitle ? t(chapter.subtitle) : ''}</Text>
              <View style={styles.flex} />
              {!full && <Icon name="lock" size={14} color={colors.textMuted} />}
              <Text style={[styles.count, full && styles.countFull]}>
                {t('journey.collection.count', { opened: r.opened, total: r.total })}
              </Text>
            </Pressable>
          );
        })}
        <Pressable style={styles.primary} onPress={() => { sfx.tap(); navigation.navigate('JourneyResult'); }} accessibilityRole="button">
          <Text style={styles.primaryText}>{t('journey.collection.mine')}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  flex: { flex: 1 },
  scroll: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.hero, color: colors.textPrimary },
  sub: { ...typography.caption, color: colors.textSecondary, marginBottom: spacing.sm },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg, borderRadius: radius.lg,
    backgroundColor: 'rgba(26,20,52,0.9)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.25)',
  },
  number: { ...typography.h3, color: colors.gold, width: 22 },
  name: { ...typography.bodyStrong, color: colors.textPrimary },
  count: { ...typography.caption, color: colors.textSecondary },
  countFull: { color: colors.gold },
  primary: { marginTop: spacing.lg, paddingVertical: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: 'center' },
  primaryText: { ...typography.h3, color: '#1A1330' },
});
