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
import { COMPLETION_TARGET, archiveProfileFacts, useArchiveStore } from '../store/archiveStore';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { syncArchive } from '../api/memoriesApi';
import Svg, { Circle } from 'react-native-svg';
import { CATEGORIES, CATEGORY_ACCENT, CATEGORY_ICON, MOOD_ICON, type ArchiveCategory } from '../types';
import { dayKey, questionFor } from '../questions';
import { MemoryEditor } from '../components/MemoryEditor';
import { useSavedJourneys } from '../../journey/store/savedJourneysStore';
import { selectJourneyProfile } from '../../journey/store/journeyProfileStore';
import { useJourneyPlayer } from '../../journey/player/journeyPlayer';
import { JOURNEYS } from '../../journey/data/journeys';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useLang } from '../../../shared/i18n';
import { column } from '../../../shared/device/screen';
import { MiniPlayerSpacer } from '../../../shared/layout/miniPlayerInset';
import { Icon } from '../../../shared/components/Icon';

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
  // The profile's birth data and MBTI sit in 기본정보 without being archive entries.
  const profileFacts = useSubjectsStore(s => archiveProfileFacts(s.self));
  const completion = useArchiveStore(s => s.completion)({ profile: profileFacts });
  const lang = useLang();
  const savedJourneys = useSavedJourneys(x => x.journeys);
  const touchJourney = useSavedJourneys(x => x.touch);
  const openSaved = useJourneyPlayer(x => x.openSaved);
  const journeyRows = [...savedJourneys].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  // Sync on every visit: push what changed here, pull what another device (or a counsellor's
  // approved discovery elsewhere) added. Never awaited by the screen.
  useFocusEffect(
    useCallback(() => {
      syncArchive().catch(() => {});
    }, []),
  );

  const question = questionFor(dayKey(), answered);
  const [answer, setAnswer] = useState('');
  // Where the last answer went, so the card can say so and open it (10-22, "이거 보내도 뭐 어디에 저장되는거임?").
  const [savedTo, setSavedTo] = useState<ArchiveCategory | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const counts = React.useMemo(() => {
    const c: Partial<Record<ArchiveCategory, number>> = { profile: profileFacts };
    memories.forEach(m => {
      c[m.category] = (c[m.category] ?? 0) + 1;
    });
    return c;
  }, [memories, profileFacts]);

  const recentDiary = memories.filter(m => m.category === 'diary').slice(0, 3);
  // The meter's two plain numbers, and the one piece to fill next: the first card in display order
  // still short of its share (the meter counts each card only up to COMPLETION_TARGET).
  const filled = CATEGORIES.filter(c => (counts[c] ?? 0) > 0).length;
  const next = CATEGORIES.find(c => (counts[c] ?? 0) < COMPLETION_TARGET[c]);
  const openCategory = (c: ArchiveCategory) => {
    sfx.tap();
    navigation.navigate('ArchiveSection', { category: c });
  };

  const keepAnswer = () => {
    if (!question || !answer.trim()) return;
    sfx.select();
    add({ category: question.category, content: answer.trim(), details: question.details, source: 'manual' });
    markAnswered(question.id);
    setSavedTo(question.category);
    setAnswer('');
    syncArchive().catch(() => {});
  };

  useEffect(() => {
    if (discoveries.length > 0) syncArchive().catch(() => {});
  }, [discoveries.length]);

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, column]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{t('archive.title')}</Text>
        <Text style={styles.tagline}>{t('archive.tagline')}</Text>

        {/* The meter, as a ring with the two numbers behind it and the next piece to fill.
            Reachable on purpose — see COMPLETION_TARGET. */}
        <View style={styles.meterCard} testID="archive-meter">
          <View style={styles.meterTop}>
            <CompletionRing percent={completion} />
            <View style={styles.meterText}>
              <Text style={styles.meterLabel}>{t('archive.completion', { percent: completion })}</Text>
              <Text style={styles.meterStats}>
                {t('archive.stats', { count: memories.length + profileFacts, filled, total: CATEGORIES.length })}
              </Text>
            </View>
          </View>
          {next && (
            <Pressable
              testID="archive-next"
              onPress={() => openCategory(next)}
              accessibilityRole="button"
              style={({ pressed }) => [styles.nextRow, pressed && styles.cellPressed]}>
              <View style={[styles.nextTile, { backgroundColor: `${CATEGORY_ACCENT[next]}24` }]}>
                <Icon name={CATEGORY_ICON[next]} size={16} color={CATEGORY_ACCENT[next]} />
              </View>
              <Text style={styles.nextLabel}>{t('archive.next')}</Text>
              <Text style={styles.nextName} numberOfLines={1}>{t(`archive.cat.${next}` as TranslationKey)}</Text>
              <Icon name="chevronRight" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* What a counsellor heard, waiting for a verdict. */}
        {discoveries.length > 0 && (
          <View style={styles.discoverCard}>
            <View style={styles.iconRow}>
              <Icon name="sparkle" size={20} color={colors.violetSoft} />
              <Text style={[styles.discoverTitle, styles.grow]}>{t('archive.discovered.title')}</Text>
            </View>
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
                  <View style={styles.iconRow}>
                    <Icon name={CATEGORY_ICON[d.category]} size={18} color={colors.textSecondary} />
                    <Text style={[styles.discoverText, styles.grow]}>{d.content}</Text>
                  </View>
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
          <View style={styles.questionHead}>
            <Icon name="sparkle" size={14} color={colors.violetSoft} />
            <Text style={[styles.questionLabel, styles.grow]}>{t('archive.question.title')}</Text>
            {question && (
              <Pressable
                onPress={() => {
                  sfx.tap();
                  markAnswered(question.id);
                }}
                hitSlop={8}
                accessibilityRole="button">
                <Text style={styles.skipText}>{t('archive.question.skip')}</Text>
              </Pressable>
            )}
          </View>
          {question ? (
            <>
              <Text style={styles.questionText}>{t(`archive.q.${question.id}` as TranslationKey)}</Text>
              <Text style={styles.savesTo}>
                {t('archive.question.savesTo', { category: t(`archive.cat.${question.category}` as TranslationKey) })}
              </Text>
              {/* One line and its send button, as a chat's input: the answer is the only action. */}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.questionInput}
                  value={answer}
                  onChangeText={setAnswer}
                  placeholder={t('archive.question.placeholder')}
                  placeholderTextColor={colors.textMuted}
                  onSubmitEditing={keepAnswer}
                  returnKeyType="done"
                />
                <Pressable
                  disabled={!answer.trim()}
                  onPress={keepAnswer}
                  accessibilityRole="button"
                  accessibilityLabel={t('archive.question.save')}
                  style={[styles.sendBtn, !answer.trim() && styles.disabled]}>
                  <Icon name="send" size={18} color={colors.textPrimary} />
                </Pressable>
              </View>
            </>
          ) : (
            <Text style={styles.questionText}>{t('archive.question.done')}</Text>
          )}
          {savedTo && (
            <Pressable
              testID="archive-question-saved"
              onPress={() => openCategory(savedTo)}
              style={styles.savedRow}
              accessibilityRole="button">
              <Icon name={CATEGORY_ICON[savedTo]} size={16} color={CATEGORY_ACCENT[savedTo]} />
              <Text style={[styles.savedText, styles.grow]}>
                {t('archive.question.savedTo', { category: t(`archive.cat.${savedTo}` as TranslationKey) })}
              </Text>
              <Text style={styles.savedView}>{t('archive.question.view')} ›</Text>
            </Pressable>
          )}
        </View>

        {/* 저장한 여행(신년운세) — opened again from here, like 나의 리포트 in the saju app. */}
        {journeyRows.length > 0 && (
          <View style={styles.recent}>
            <Text style={styles.sectionTitle}>{t('archive.journeys.title')}</Text>
            {journeyRows.map(j => {
              const journey = JOURNEYS[j.journeyId];
              const guide = getLocalizedCounselor(j.counselorId, lang);
              const date = j.updatedAt.slice(0, 10).replace(/-/g, '.');
              return (
                <Pressable
                  key={j.id}
                  style={styles.diaryRow}
                  accessibilityRole="button"
                  onPress={() => {
                    sfx.select();
                    touchJourney(j.id);
                    selectJourneyProfile(j.profileKey);
                    openSaved(j);
                    navigation.navigate('JourneyResult');
                  }}>
                  <Icon name="train" size={22} color={colors.textSecondary} style={styles.diaryIcon} />
                  <View style={styles.diaryBody}>
                    <Text style={styles.diaryDate}>
                      {t('archive.journeys.with', { name: guide?.name ?? '', date })}
                    </Text>
                    <Text style={styles.diaryText} numberOfLines={2}>
                      {journey ? t(journey.title, { year: j.year }) : String(j.year)}
                      {j.subjectName ? ` · ${j.subjectName}` : ''}
                    </Text>
                  </View>
                  <View style={styles.journeyOpenRow}>
                    <Text style={styles.journeyOpen}>{t('archive.journeys.open')}</Text>
                    <Icon name="chevronRight" size={12} color={colors.violetSoft} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        <Text style={styles.sectionTitle}>{t('archive.sections')}</Text>
        <View style={styles.grid}>
          {CATEGORIES.map(c => {
            const n = counts[c] ?? 0;
            const accent = CATEGORY_ACCENT[c];
            const share = Math.min(1, n / COMPLETION_TARGET[c]);
            return (
              <Pressable
                key={c}
                testID={`archive-cell-${c}`}
                style={({ pressed }) => [styles.cell, pressed && styles.cellPressed]}
                onPress={() => openCategory(c)}>
                <View style={styles.cellHead}>
                  <View style={[styles.cellTile, { backgroundColor: `${accent}24` }]}>
                    <Icon name={CATEGORY_ICON[c]} size={22} color={accent} testID={`archive-cell-icon-${c}`} />
                  </View>
                  {c !== 'profile' && (
                    <Text style={[styles.cellCount, n > 0 && { color: accent }]}>{t('archive.count', { count: n })}</Text>
                  )}
                </View>
                <Text style={styles.cellTitle} numberOfLines={2}>
                  {t(`archive.cat.${c}` as TranslationKey)}
                </Text>
                {/* No count and no bar for 기본정보: the profile is filled in, not collected (10-22). */}
                {c !== 'profile' && (
                  <View style={styles.cellTrack}>
                    <View style={[styles.cellFill, { width: `${share * 100}%`, backgroundColor: accent }]} />
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>

        {recentDiary.length > 0 && (
          <View style={styles.recent}>
            <Text style={styles.sectionTitle}>{t('archive.recent')}</Text>
            {recentDiary.map(d => (
              <Pressable
                key={d.id}
                style={styles.diaryRow}
                onPress={() => navigation.navigate('ArchiveSection', { category: 'diary' })}>
                <Icon name={MOOD_ICON[d.details.mood] ?? CATEGORY_ICON.diary} size={22} color={colors.textSecondary} style={styles.diaryIcon} />
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
        <MiniPlayerSpacer />
      </ScrollView>
    </SafeAreaView>
  );
};

/** The meter's ring: gold over the elevated track, starting at twelve o'clock. */
const RING = 76;
const RING_STROKE = 7;
const CompletionRing: React.FC<{ percent: number }> = ({ percent }) => {
  const r = (RING - RING_STROKE) / 2;
  const len = 2 * Math.PI * r;
  return (
    <View style={styles.ring}>
      <Svg width={RING} height={RING} style={styles.ringSvg}>
        <Circle cx={RING / 2} cy={RING / 2} r={r} stroke={colors.bgElevated} strokeWidth={RING_STROKE} fill="none" />
        <Circle
          cx={RING / 2}
          cy={RING / 2}
          r={r}
          stroke={colors.gold}
          strokeWidth={RING_STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${len} ${len}`}
          strokeDashoffset={len * (1 - Math.max(0.02, Math.min(1, percent / 100)))}
          transform={`rotate(-90 ${RING / 2} ${RING / 2})`}
        />
      </Svg>
      <Text style={styles.ringText}>{percent}%</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.lg },
  title: { ...typography.hero, color: colors.textPrimary },
  tagline: { ...typography.caption, color: colors.textSecondary, marginTop: -spacing.sm, lineHeight: 19 },
  meterCard: {
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: colors.goldDim,
  },
  meterTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  meterText: { flex: 1, gap: spacing.xs },
  meterLabel: { ...typography.h3, color: colors.textPrimary },
  meterStats: { ...typography.caption, color: colors.textSecondary },
  ring: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ringSvg: { position: 'absolute' },
  ringText: { ...typography.h3, color: colors.gold },
  nextRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md, borderRadius: radius.md, backgroundColor: colors.bgElevated,
  },
  nextTile: { width: 28, height: 28, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
  nextLabel: { ...typography.caption, color: colors.textMuted },
  nextName: { ...typography.bodyStrong, color: colors.textPrimary, flex: 1 },
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
  questionCard: {
    backgroundColor: colors.violetDim, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md,
    borderWidth: 1, borderColor: 'rgba(167, 139, 250, 0.22)',
  },
  questionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  questionLabel: { ...typography.tiny, color: colors.violetSoft, textTransform: 'uppercase', letterSpacing: 0.6 },
  skipText: { ...typography.caption, color: colors.textMuted },
  savesTo: { ...typography.caption, color: colors.textMuted },
  savedRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.bgElevated, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  savedText: { ...typography.caption, color: colors.textPrimary },
  savedView: { ...typography.caption, color: colors.violetSoft },
  questionText: { ...typography.h2, color: colors.textPrimary, lineHeight: 27 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  questionInput: {
    ...typography.body,
    flex: 1,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
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
    gap: spacing.sm,
  },
  cellPressed: { backgroundColor: colors.cardPressed },
  cellHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cellTile: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  cellTitle: { ...typography.bodyStrong, color: colors.textPrimary, minHeight: 22 },
  cellCount: { ...typography.caption, color: colors.textMuted, fontWeight: '700' },
  cellTrack: { height: 4, borderRadius: radius.pill, backgroundColor: colors.bgElevated, overflow: 'hidden' },
  cellFill: { height: 4, borderRadius: radius.pill },
  recent: { gap: spacing.md },
  diaryRow: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.card, borderRadius: radius.md, padding: spacing.md },
  diaryIcon: { marginTop: 2 },
  iconRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  grow: { flex: 1 },
  diaryBody: { flex: 1, gap: 2 },
  diaryDate: { ...typography.tiny, color: colors.textMuted },
  diaryText: { ...typography.body, color: colors.textPrimary },
  journeyOpenRow: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 2 },
  journeyOpen: { ...typography.tiny, color: colors.violetSoft },
});
