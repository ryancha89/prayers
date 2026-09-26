import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text, TextInput } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { useArchiveStore } from '../store/archiveStore';
import { syncArchive } from '../api/memoriesApi';
import { CATEGORIES, CATEGORY_ICON, MOOD_ICON, type ArchiveCategory } from '../types';
import { dayKey, questionFor } from '../questions';
import { MemoryEditor } from '../components/MemoryEditor';

/**
 * 아카이브 — the tab.
 *
 * Not a settings page: a place the player builds themselves in, one piece at a time. So the top
 * of it is not a form but the three things that make coming back worth it — how much of them is
 * drawn (a game meter, never a claim about the AI), today's one question, and what a counsellor
 * noticed last time and is asking to keep. The categories come after, as cards with counts.
 */
export const ArchiveScreen: React.FC = () => {
  const t = useT();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const memories = useArchiveStore(s => s.memories);
  const discoveries = useArchiveStore(s => s.discoveries);
  const answered = useArchiveStore(s => s.answeredQuestions);
  const add = useArchiveStore(s => s.add);
  const markAnswered = useArchiveStore(s => s.markAnswered);
  const approveDiscovery = useArchiveStore(s => s.approveDiscovery);
  const dismissDiscovery = useArchiveStore(s => s.dismissDiscovery);
  const completion = useArchiveStore(s => s.completion)();

  // Sync on every visit: push what changed here, pull what another device (or a counsellor's
  // approved discovery elsewhere) added. Never awaited by the screen.
  useFocusEffect(
    useCallback(() => {
      syncArchive().catch(() => {});
    }, []),
  );

  const question = questionFor(dayKey(), answered);
  const [answer, setAnswer] = useState('');
  const [editing, setEditing] = useState<string | null>(null);

  const counts = React.useMemo(() => {
    const c: Partial<Record<ArchiveCategory, number>> = {};
    memories.forEach(m => {
      c[m.category] = (c[m.category] ?? 0) + 1;
    });
    return c;
  }, [memories]);

  const recentDiary = memories.filter(m => m.category === 'diary').slice(0, 3);

  const keepAnswer = () => {
    if (!question || !answer.trim()) return;
    sfx.select();
    add({ category: question.category, content: answer.trim(), details: question.details, source: 'manual' });
    markAnswered(question.id);
    setAnswer('');
    syncArchive().catch(() => {});
  };

  useEffect(() => {
    if (discoveries.length > 0) syncArchive().catch(() => {});
  }, [discoveries.length]);

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('archive.title')}</Text>
        <Text style={styles.tagline}>{t('archive.tagline')}</Text>

        {/* The meter. Reachable on purpose — see COMPLETION_TARGET. */}
        <View style={styles.meterCard}>
          <Text style={styles.meterLabel}>{t('archive.completion', { percent: completion })}</Text>
          <View style={styles.meterTrack}>
            <View style={[styles.meterFill, { width: `${Math.max(2, completion)}%` }]} />
          </View>
        </View>

        {/* What a counsellor heard, waiting for a verdict. */}
        {discoveries.length > 0 && (
          <View style={styles.discoverCard}>
            <Text style={styles.discoverTitle}>✨ {t('archive.discovered.title')}</Text>
            {discoveries.map(d =>
              editing === d.id ? (
                <MemoryEditor
                  key={d.id}
                  category={d.category}
                  initial={{ content: d.content, details: {} }}
                  onSave={v => {
                    approveDiscovery(d.id, { content: v.content });
                    setEditing(null);
                    syncArchive().catch(() => {});
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <View key={d.id} style={styles.discoverRow}>
                  <Text style={styles.discoverText}>
                    {CATEGORY_ICON[d.category]} {d.content}
                  </Text>
                  <View style={styles.discoverActions}>
                    <Pressable
                      style={[styles.smallBtn, styles.smallBtnPrimary]}
                      onPress={() => {
                        sfx.select();
                        approveDiscovery(d.id);
                        syncArchive().catch(() => {});
                      }}>
                      <Text style={styles.smallBtnTextPrimary}>{t('archive.discovered.keep')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => {
                        sfx.tap();
                        setEditing(d.id);
                      }}>
                      <Text style={styles.smallBtnText}>{t('archive.discovered.edit')}</Text>
                    </Pressable>
                    <Pressable
                      style={styles.smallBtn}
                      onPress={() => {
                        sfx.tap();
                        dismissDiscovery(d.id);
                      }}>
                      <Text style={styles.smallBtnText}>{t('archive.discovered.once')}</Text>
                    </Pressable>
                  </View>
                </View>
              ),
            )}
          </View>
        )}

        {/* Today's question — one line, filed where it belongs. */}
        <View style={styles.questionCard}>
          <Text style={styles.questionLabel}>{t('archive.question.title')}</Text>
          {question ? (
            <>
              <Text style={styles.questionText}>{t(`archive.q.${question.id}` as TranslationKey)}</Text>
              <TextInput
                style={styles.questionInput}
                value={answer}
                onChangeText={setAnswer}
                placeholder={t('archive.question.placeholder')}
                placeholderTextColor={colors.textMuted}
                onSubmitEditing={keepAnswer}
                returnKeyType="done"
              />
              <View style={styles.questionActions}>
                <Pressable
                  onPress={() => {
                    sfx.tap();
                    markAnswered(question.id);
                  }}
                  style={styles.smallBtn}>
                  <Text style={styles.smallBtnText}>{t('archive.question.skip')}</Text>
                </Pressable>
                <Pressable
                  disabled={!answer.trim()}
                  onPress={keepAnswer}
                  style={[styles.smallBtn, styles.smallBtnPrimary, !answer.trim() && styles.disabled]}>
                  <Text style={styles.smallBtnTextPrimary}>{t('archive.question.save')}</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.questionText}>{t('archive.question.done')}</Text>
          )}
        </View>

        <Text style={styles.sectionTitle}>{t('archive.sections')}</Text>
        <View style={styles.grid}>
          {CATEGORIES.map(c => (
            <Pressable
              key={c}
              style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
              onPress={() => {
                sfx.tap();
                navigation.navigate('ArchiveSection', { category: c });
              }}>
              <Text style={styles.cellIcon}>{CATEGORY_ICON[c]}</Text>
              <Text style={styles.cellTitle} numberOfLines={2}>
                {t(`archive.cat.${c}` as TranslationKey)}
              </Text>
              <Text style={styles.cellCount}>{t('archive.count', { count: counts[c] ?? 0 })}</Text>
            </Pressable>
          ))}
        </View>

        {recentDiary.length > 0 && (
          <View style={styles.recent}>
            <Text style={styles.sectionTitle}>{t('archive.recent')}</Text>
            {recentDiary.map(d => (
              <Pressable
                key={d.id}
                style={styles.diaryRow}
                onPress={() => navigation.navigate('ArchiveSection', { category: 'diary' })}>
                <Text style={styles.diaryMood}>{MOOD_ICON[d.details.mood] ?? '📔'}</Text>
                <View style={styles.diaryBody}>
                  <Text style={styles.diaryDate}>{d.details.date}</Text>
                  <Text style={styles.diaryText} numberOfLines={2}>
                    {d.content}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...typography.hero, color: colors.textPrimary },
  tagline: { ...typography.body, color: colors.textSecondary, marginTop: -spacing.sm },
  meterCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  meterLabel: { ...typography.h3, color: colors.gold },
  meterTrack: { height: 8, borderRadius: radius.pill, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.gold },
  discoverCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.violetSoft,
  },
  discoverTitle: { ...typography.h3, color: colors.textPrimary },
  discoverRow: { gap: spacing.sm },
  discoverText: { ...typography.body, color: colors.textPrimary },
  discoverActions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  questionCard: { backgroundColor: colors.violetDim, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm },
  questionLabel: { ...typography.tiny, color: colors.violetSoft, textTransform: 'uppercase' },
  questionText: { ...typography.h3, color: colors.textPrimary },
  questionInput: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  questionActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  smallBtn: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  smallBtnPrimary: { backgroundColor: colors.violet },
  smallBtnText: { ...typography.caption, color: colors.textSecondary },
  smallBtnTextPrimary: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  disabled: { opacity: 0.4 },
  sectionTitle: { ...typography.h2, color: colors.textPrimary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  cell: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  cellPressed: { backgroundColor: colors.cardPressed },
  cellIcon: { fontSize: 24 },
  cellTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  cellCount: { ...typography.caption, color: colors.textMuted },
  recent: { gap: spacing.md },
  diaryRow: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md },
  diaryMood: { fontSize: 22 },
  diaryBody: { flex: 1, gap: 2 },
  diaryDate: { ...typography.tiny, color: colors.textMuted },
  diaryText: { ...typography.body, color: colors.textPrimary },
});
