import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import { useDiaryStore } from '../diaryStore';
import { TOPICS, topicKey } from '../text';
import { MOODS, browse, moodColor, moodTally, topicTally } from '../stats';
import { MoodFace } from './MoodFace';
import { DiaryRow } from './DiaryRow';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/**
 * Browse by Mood / Topic (07-10 mockup, a later phase of spec 006): pick a mood and a topic, the
 * matching entries list below, and My Stats says which topic is written about most and which mood
 * comes most often. Topics are the reflections' (server ids), so an entry without a ready reflection
 * only shows under "All".
 */
export const DiaryBrowseSheet: React.FC<{ onOpen(id: string): void; onClose(): void }> = ({ onOpen, onClose }) => {
  const t = useT();
  const safe = useSafeAreaInsets();
  const memories = useArchiveStore(st => st.memories);
  const reflections = useDiaryStore(st => st.reflections);
  const [mood, setMood] = useState<string>('all');
  const [topic, setTopic] = useState<string>('all');

  const rows = useMemo(() => browse(memories, reflections, mood, topic), [memories, reflections, mood, topic]);
  const topTopic = useMemo(() => topicTally(memories, reflections)[0], [memories, reflections]);
  const topMood = useMemo(() => moodTally(memories)[0], [memories]);

  const chip = (id: string, label: string) => {
    const on = topic === id;
    return (
      <Pressable key={id} testID={`diary-browse-topic-${id}`} onPress={() => { sfx.tap(); setTopic(id); }}
        accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, on && styles.chipOn]}>
        <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={s.root} testID="diary-browse">
      <View style={s.sheet}>
        <SheetHead title={t('diary.browse.title')} onClose={onClose} closeTestID="diary-browse-close" />
        <ScrollView contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <Text style={styles.heading}>{t('diary.browse.mood')}</Text>
          <View style={styles.moods}>
            {(['all', ...MOODS] as string[]).map(id => {
              const on = mood === id;
              const tint = moodColor(id) ?? colors.violetSoft;
              return (
                <Pressable key={id} testID={`diary-browse-mood-${id}`} onPress={() => { sfx.tap(); setMood(id); }}
                  accessibilityRole="button" accessibilityState={{ selected: on }} style={styles.mood}>
                  <View style={[styles.moodRing, on && { borderColor: tint, backgroundColor: `${tint}26` }]}>
                    <MoodFace mood={id === 'all' ? 'good' : id} size={28} color={on ? tint : colors.textSecondary} />
                  </View>
                  <Text style={[styles.moodText, on && { color: colors.textPrimary }]} numberOfLines={1}>
                    {t((id === 'all' ? 'diary.list.all' : `archive.mood.${id}`) as TranslationKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.heading}>{t('diary.browse.topics')}</Text>
          <View style={styles.chips}>
            {chip('all', t('diary.list.all'))}
            {TOPICS.map(id => chip(id, t(topicKey(id) as TranslationKey)))}
          </View>

          <View style={{ gap: spacing.sm }} testID="diary-browse-results">
            {rows.length === 0 ? (
              <Text style={[s.muted, styles.empty]} testID="diary-browse-empty">{t('diary.browse.empty')}</Text>
            ) : (
              rows.map(m => <DiaryRow key={m.id} memory={m} onOpen={onOpen} />)
            )}
          </View>

          <Text style={styles.heading}>{t('diary.browse.stats')}</Text>
          <View style={styles.statCard} testID="diary-browse-top-topic">
            <View style={styles.statIcon}><Icon name="sparkle" size={22} color={colors.violetSoft} /></View>
            <View style={styles.statBody}>
              <Text style={styles.statLabel}>{t('diary.browse.topTopic')}</Text>
              <Text style={styles.statValue}>{topTopic ? t(topicKey(topTopic.id) as TranslationKey) : '—'}</Text>
              {topTopic && <Text style={styles.statLabel}>{t('diary.browse.entries', { n: String(topTopic.count) })}</Text>}
            </View>
          </View>
          <View style={styles.statCard} testID="diary-browse-top-mood">
            <View style={styles.statIcon}>
              <MoodFace mood={topMood?.id ?? 'okay'} size={28} color={moodColor(topMood?.id) ?? colors.textMuted} fill={`${moodColor(topMood?.id) ?? '#000000'}33`} />
            </View>
            <View style={[styles.statBody, styles.statGap]}>
              <Text style={styles.statLabel}>{t('diary.browse.topMood')}</Text>
              <View style={styles.barLine}>
                <Text style={styles.statValue}>{topMood ? t(`archive.mood.${topMood.id}` as TranslationKey) : '—'}</Text>
                {topMood && <Text style={styles.statLabel}>{Math.round(topMood.share * 100)}%</Text>}
              </View>
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.round((topMood?.share ?? 0) * 100)}%`, backgroundColor: moodColor(topMood?.id) ?? colors.gold }]} />
              </View>
            </View>
          </View>
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  heading: { ...typography.h3, color: colors.textPrimary },
  moods: { flexDirection: 'row', justifyContent: 'space-between' },
  mood: { alignItems: 'center', gap: 4, flex: 1 },
  moodRing: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'transparent' },
  moodText: { ...typography.tiny, color: colors.textSecondary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.06)' },
  chipOn: { backgroundColor: colors.violet },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextOn: { color: colors.textPrimary, fontWeight: '700' },
  empty: { textAlign: 'center', paddingVertical: spacing.lg },
  statCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(139,92,246,0.14)' },
  statBody: { flex: 1 },
  statGap: { gap: 4 },
  statLabel: { ...typography.tiny, color: colors.textSecondary },
  statValue: { ...typography.bodyStrong, color: colors.textPrimary },
  barLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  bar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
});
