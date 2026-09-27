import React, { useCallback, useEffect, useMemo } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { JOURNEYS } from '../data/journeys';
import { useJourneyPlayer, type ActiveCard } from '../player/journeyPlayer';
import { TrainWindow } from '../components/TrainWindow';
import { JourneyBackdrop } from '../components/JourneyBackdrop';
import { RailwayProgress } from '../components/RailwayProgress';
import { FortuneCardOverlay } from '../components/FortuneCardOverlay';
import { StationTransition } from '../components/StationTransition';
import { clock, monthsLabel } from '../format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Sentences, and where each starts as a share of the whole — so the line on screen follows the
 *  voice without word timings: a sentence is on while the voice is in its share of the chapter. */
function sentencesOf(text: string) {
  const parts = text.match(/[^.!?。！？]+[.!?。！？]?/g)?.map(s => s.trim()).filter(Boolean) ?? [];
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  let acc = 0;
  return parts.map(p => {
    const start = acc / total;
    acc += p.length;
    return { text: p, start };
  });
}

/**
 * The train. The window is the screen — the counsellor is a small face below it, the narrator of
 * a view that belongs to the player. Only the sentence being said is on screen, never the reading.
 */
export const JourneyScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const s = useJourneyPlayer();
  const addMemory = useArchiveStore(a => a.add);
  const journey = s.journeyId ? JOURNEYS[s.journeyId] : null;

  // The last station reached → the destination.
  useEffect(() => {
    if (s.status === 'done') navigation.replace('JourneyResult');
  }, [s.status, navigation]);

  // Boarding refused for want of birth data → the player went to the form → came back with it.
  // Leave again on their behalf; a "try again" tap after filling in a form reads as the app not
  // having noticed.
  const selfReady = useSubjectsStore(st => hasBirthData(st.self));
  const reboard = useCallback(() => {
    if (s.journeyId && s.counselorId && s.tone) void s.board(s.journeyId, s.counselorId, s.tone, lang);
  }, [s, lang]);
  useFocusEffect(
    useCallback(() => {
      if (s.status === 'error' && s.error === 'no-chart' && selfReady) reboard();
    }, [s.status, s.error, selfReady, reboard]),
  );

  const index = s.transitionTo ?? s.chapterIndex;
  const chapter = journey?.chapters[index];
  const guide = s.counselorId ? getLocalizedCounselor(s.counselorId, lang) : undefined;
  const narration = s.content?.chapters.find(c => c.id === chapter?.id)?.narration ?? '';
  const sentences = useMemo(() => sentencesOf(narration), [narration]);
  const progress = s.duration > 0 ? Math.min(1, s.position / s.duration) : 0;
  const line = s.status === 'transition' || s.status === 'boarding'
    ? ''
    : [...sentences].reverse().find(x => x.start <= progress)?.text ?? sentences[0]?.text ?? '';

  const saveCard = useCallback(
    (card: ActiveCard) => {
      if (!journey) return;
      addMemory({
        category: 'story',
        content: `${journey.year} ${monthsLabel(card.months, lang)} · ${card.title}`,
        details: { year: String(journey.year), kind: 'travel', note: card.description },
        importance: 2,
      });
    },
    [addMemory, journey, lang],
  );

  if (!journey || !chapter) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable style={styles.header} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} />
        </Pressable>
      </SafeAreaView>
    );
  }

  // "Chapter 2/6": the stations with a reading on them — departure counts, the terminus does not.
  const numbered = journey.chapters.length - 1;
  const chapterLabel =
    index >= numbered ? t('journey.destination') : t('journey.chapter', { n: index + 1, total: numbered });
  const speed = s.status === 'transition' ? 3.2 : s.status === 'boarding' ? 0.25 : s.status === 'paused' ? 0 : 1;

  return (
    <SafeAreaView edges={['top', 'bottom']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          hitSlop={12}
          onPress={() => {
            sfx.back();
            navigation.goBack(); // the journey keeps going; the mini player carries it
          }}
          accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
        <Text style={styles.brand}>{t('journey.header', { year: journey.year })}</Text>
        <Text style={styles.chapter}>{chapterLabel}</Text>
      </View>

      <TrainWindow style={styles.window}>
        <JourneyBackdrop media={chapter.background} speed={speed} />
        {s.status === 'transition' && chapter.subtitle && (
          <StationTransition station={chapter.subtitle} final={index === journey.chapters.length - 1} />
        )}
        {s.status === 'boarding' && (
          <View style={styles.boarding}>
            <ActivityIndicator color={colors.gold} />
            <Text style={styles.boardingTitle}>{t('journey.boarding')}</Text>
            <Text style={styles.boardingSub}>{t('journey.boarding.sub', { year: journey.year })}</Text>
          </View>
        )}
        {s.status === 'error' && s.error === 'no-chart' && (
          <View style={styles.boarding}>
            <Text style={styles.boardingTitle}>{t('journey.error.noChart')}</Text>
            <Text style={styles.boardingSub}>{t('journey.error.noChart.sub')}</Text>
            <Pressable
              style={styles.retry}
              onPress={() => {
                sfx.select();
                navigation.navigate('AddSubject', { subjectId: 'self' });
              }}>
              <Text style={styles.retryText}>{t('journey.error.addProfile')}</Text>
            </Pressable>
          </View>
        )}
        {s.status === 'error' && s.error !== 'no-chart' && (
          <View style={styles.boarding}>
            <Text style={styles.boardingTitle}>{t('journey.error')}</Text>
            <Pressable style={styles.retry} onPress={reboard}>
              <Text style={styles.retryText}>{t('journey.retry')}</Text>
            </Pressable>
          </View>
        )}
        {s.activeCard && (
          <View style={styles.cardLayer} pointerEvents="box-none">
            <FortuneCardOverlay card={s.activeCard} year={journey.year} onDone={s.dismissCard} onSave={saveCard} />
          </View>
        )}
      </TrainWindow>

      <View style={styles.narrator}>
        {guide?.avatarImage ? <Image source={guide.avatarImage} style={styles.avatar} /> : null}
        <Text style={styles.guideName}>{guide?.name}</Text>
        <Text style={styles.station}>{chapter.subtitle ? t(chapter.subtitle) : ''}</Text>
      </View>

      <View style={styles.lineBox}>
        <Text style={styles.line} numberOfLines={3}>
          {line}
        </Text>
      </View>

      <View style={styles.progress}>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.knob, { left: `${progress * 100}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>{clock(s.position)}</Text>
          <Text style={styles.time}>{clock(s.duration)}</Text>
        </View>
      </View>

      <View style={styles.controls}>
        <Pressable hitSlop={10} onPress={() => { sfx.tap(); s.prev(); }} accessibilityRole="button">
          <Icon name="prev" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => s.seekBy(-15)} accessibilityRole="button">
          <Icon name="back15" size={30} />
        </Pressable>
        <Pressable
          onPress={() => { sfx.tap(); s.toggle(); }}
          style={styles.playBtn}
          disabled={s.status === 'boarding' || s.status === 'transition'}
          accessibilityRole="button">
          <Icon name={s.status === 'playing' ? 'pause' : 'play'} size={26} color="#1A1330" />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => s.seekBy(15)} accessibilityRole="button">
          <Icon name="fwd15" size={30} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => { sfx.tap(); s.next(); }} accessibilityRole="button">
          <Icon name="next" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <RailwayProgress
        chapters={journey.chapters}
        current={index}
        progress={s.status === 'transition' ? 0 : progress}
        onStation={i => { sfx.tap(); s.goTo(i); }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07061A' },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.xl, paddingVertical: spacing.sm,
  },
  brand: { ...typography.tiny, color: colors.gold, letterSpacing: 3, flex: 1 },
  chapter: { ...typography.tiny, color: colors.textSecondary, letterSpacing: 1 },
  window: { flex: 1, marginHorizontal: spacing.md, marginTop: spacing.xs },
  boarding: {
    ...absoluteFill,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(5,4,20,0.45)',
  },
  boardingTitle: { ...typography.h3, color: colors.textPrimary },
  boardingSub: { ...typography.caption, color: colors.textSecondary },
  retry: { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold },
  retryText: { ...typography.bodyStrong, color: '#1A1330' },
  cardLayer: { ...absoluteFill, justifyContent: 'center' },
  narrator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)' },
  guideName: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  station: { ...typography.caption, color: colors.textMuted },
  lineBox: { minHeight: 76, justifyContent: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  line: { fontSize: 18, lineHeight: 27, fontWeight: '600', color: colors.textPrimary },
  progress: { paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  bar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: colors.gold },
  knob: { position: 'absolute', width: 11, height: 11, marginLeft: -5.5, borderRadius: 6, backgroundColor: colors.gold },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { ...typography.tiny, color: colors.textMuted },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, marginVertical: spacing.md,
  },
  playBtn: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
});
