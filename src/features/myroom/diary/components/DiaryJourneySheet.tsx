import React, { useMemo, useState } from 'react';
import { ImageBackground, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import { REVEAL_ART } from '../../../journey/art';
import { useDiaryStore } from '../diaryStore';
import { diaryEntries } from '../book';
import { localDay, topicKey } from '../text';
import { MOODS, journeyMonths, moodColor, moodTally, streaks, topicTally } from '../stats';
import { DiaryImage } from './DiaryImage';
import { DiaryRow } from './DiaryRow';
import { MoodFace } from './MoodFace';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

type Tab = 'timeline' | 'goals' | 'insights';
const TABS: Tab[] = ['timeline', 'goals', 'insights'];

const monthLabel = (month: string, lang: string) => {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return month;
  }
};

/**
 * My Journey (07-10 mockup, a later phase of spec 006). Timeline: one stop per month with entries —
 * how many, the first photo, and a line (the month's first ready reflection, else the newest entry's
 * opening; the app never writes words in a counsellor's name, FR-005). Goals: the goal / wish / plan
 * entries. Insights: streaks, the mood mix and the most written topics.
 */
export const DiaryJourneySheet: React.FC<{ onOpen(id: string): void; onClose(): void }> = ({ onOpen, onClose }) => {
  const t = useT();
  const lang = useLang();
  const safe = useSafeAreaInsets();
  const memories = useArchiveStore(st => st.memories);
  const reflections = useDiaryStore(st => st.reflections);
  const photos = useDiaryStore(st => st.photos);
  const [tab, setTab] = useState<Tab>('timeline');

  const months = useMemo(
    () => journeyMonths(memories, reflections, id => !!photos[id]?.length),
    [memories, reflections, photos],
  );
  const goals = useMemo(() => diaryEntries(memories).filter(m => m.category !== 'diary'), [memories]);
  const total = useMemo(() => diaryEntries(memories).length, [memories]);
  const streak = useMemo(() => streaks(memories, localDay()), [memories]);
  const moods = useMemo(() => moodTally(memories), [memories]);
  const topics = useMemo(() => topicTally(memories, reflections).slice(0, 3), [memories, reflections]);

  return (
    <View style={s.root} testID="diary-journey">
      <View style={s.sheet}>
        <SheetHead title={t('diary.journey.title')} onClose={onClose} closeTestID="diary-journey-close" />
        <ScrollView contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <View style={styles.tabs}>
            {TABS.map(k => {
              const on = tab === k;
              return (
                <Pressable key={k} testID={`diary-journey-tab-${k}`} onPress={() => { sfx.tap(); setTab(k); }}
                  accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, on && styles.tabOn]}>
                  <Text style={[styles.tabText, on && styles.tabTextOn]}>{t(`diary.journey.${k}` as TranslationKey)}</Text>
                </Pressable>
              );
            })}
          </View>

          {tab === 'timeline' && (
            months.length === 0 ? (
              <Text style={[s.muted, styles.empty]} testID="diary-journey-empty">{t('diary.list.empty')}</Text>
            ) : (
              <View testID="diary-journey-timeline">
                {months.map((mo, i) => {
                  const cover = mo.coverId ? photos[mo.coverId]?.[0] : undefined;
                  return (
                    <Pressable key={mo.month} testID={`diary-journey-month-${mo.month}`} style={styles.stop}
                      onPress={() => { sfx.tap(); onOpen(mo.entries[0].id); }} accessibilityRole="button">
                      <View style={styles.rail}>
                        <View style={styles.railDot} />
                        {i < months.length - 1 && <View style={styles.railLine} />}
                      </View>
                      <View style={styles.stopHead}>
                        <Text style={styles.stopMonth}>{monthLabel(mo.month, lang)}</Text>
                        <Text style={styles.stopCount}>{t('diary.browse.entries', { n: String(mo.entries.length) })}</Text>
                      </View>
                      {cover ? (
                        <DiaryImage localUri={cover.localUri} url={cover.url} style={styles.cover} />
                      ) : (
                        <View style={[styles.cover, styles.noCover]}><Icon name="book" size={20} color={colors.gold} /></View>
                      )}
                      <Text style={styles.quote} numberOfLines={3}>“{mo.line}”</Text>
                    </Pressable>
                  );
                })}
              </View>
            )
          )}

          {tab === 'goals' && (
            <View style={{ gap: spacing.sm }} testID="diary-journey-goals">
              {goals.length === 0
                ? <Text style={[s.muted, styles.empty]}>{t('diary.journey.noGoals')}</Text>
                : goals.map(m => <DiaryRow key={m.id} memory={m} onOpen={onOpen} />)}
            </View>
          )}

          {tab === 'insights' && (
            <View style={{ gap: spacing.md }} testID="diary-journey-insights">
              <View style={styles.numbers}>
                {([
                  ['total', total],
                  ['streak', streak.current],
                  ['longest', streak.longest],
                ] as const).map(([k, n]) => (
                  <View key={k} style={styles.number} testID={`diary-insight-${k}`}>
                    <Text style={styles.numberValue}>{n}</Text>
                    <Text style={styles.numberLabel}>{t(`diary.journey.${k}` as TranslationKey)}</Text>
                  </View>
                ))}
              </View>

              <Text style={styles.heading}>{t('diary.journey.moodMix')}</Text>
              <View style={{ gap: spacing.sm }}>
                {MOODS.map(id => {
                  const share = moods.find(x => x.id === id)?.share ?? 0;
                  return (
                    <View key={id} style={styles.moodLine}>
                      <MoodFace mood={id} size={20} color={moodColor(id)!} />
                      <Text style={styles.moodName}>{t(`archive.mood.${id}` as TranslationKey)}</Text>
                      <View style={styles.bar}><View style={[styles.barFill, { width: `${Math.round(share * 100)}%`, backgroundColor: moodColor(id) }]} /></View>
                      <Text style={styles.pct}>{Math.round(share * 100)}%</Text>
                    </View>
                  );
                })}
              </View>

              <Text style={styles.heading}>{t('diary.journey.topTopics')}</Text>
              {topics.length === 0 ? (
                <Text style={s.muted}>{t('diary.journey.noTopics')}</Text>
              ) : (
                <View style={styles.chips}>
                  {topics.map(x => (
                    <View key={x.id} style={styles.chip}>
                      <Text style={styles.chipText}>#{t(topicKey(x.id) as TranslationKey)} · {x.count}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          <ImageBackground source={REVEAL_ART.overall} style={styles.banner} imageStyle={styles.bannerImage}>
            <View style={styles.bannerShade}>
              <Text style={styles.bannerText}>{t('diary.journey.quote')}</Text>
            </View>
          </ImageBackground>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.pill, padding: 3 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: radius.pill, alignItems: 'center' },
  tabOn: { backgroundColor: colors.violet },
  tabText: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  tabTextOn: { color: colors.textPrimary },
  empty: { textAlign: 'center', paddingVertical: spacing.lg },
  stop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingBottom: spacing.lg },
  rail: { width: 12, alignItems: 'center', alignSelf: 'stretch' },
  railDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violetSoft, marginTop: 5 },
  railLine: { flex: 1, width: 1, backgroundColor: 'rgba(167,139,250,0.35)', marginTop: 4, marginBottom: -spacing.lg },
  stopHead: { width: 78, gap: 2 },
  stopMonth: { ...typography.bodyStrong, color: colors.textPrimary },
  stopCount: { ...typography.tiny, color: colors.textSecondary },
  cover: { width: 64, height: 64, borderRadius: radius.sm },
  noCover: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(233,196,106,0.08)' },
  quote: { ...typography.caption, color: colors.textSecondary, flex: 1, fontStyle: 'italic' },
  numbers: { flexDirection: 'row', gap: spacing.sm },
  number: {
    flex: 1, alignItems: 'center', padding: spacing.md, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  numberValue: { ...typography.h2, color: colors.gold },
  numberLabel: { ...typography.tiny, color: colors.textSecondary, textAlign: 'center' },
  heading: { ...typography.h3, color: colors.textPrimary },
  moodLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  moodName: { ...typography.caption, color: colors.textSecondary, width: 64 },
  bar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  pct: { ...typography.tiny, color: colors.textSecondary, width: 34, textAlign: 'right' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(167,139,250,0.16)' },
  chipText: { ...typography.caption, color: colors.violetSoft, fontWeight: '700' },
  banner: { height: 150, marginTop: spacing.md },
  bannerImage: { borderRadius: radius.md },
  bannerShade: {
    flex: 1, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
    backgroundColor: 'rgba(10,8,30,0.45)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.3)',
  },
  bannerText: { ...typography.h3, color: '#F3E3B5', textAlign: 'center', fontStyle: 'italic' },
});
