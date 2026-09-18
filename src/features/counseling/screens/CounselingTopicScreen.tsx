import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { RootStackParamList } from '../../../navigation/types';
import { CounselingTopic } from '../types';
import { useCounselingStore } from '../store/counselingStore';
import { fetchTopics, type TopicCard } from '../api/prayersServer';
import { groupTopicsFor } from '../topicsForCounselor';
import { sfx } from '../../../shared/audio/sfx';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * The offline list. The real cards come from `GET /api/v1/prayers/topics`, and this stands in when
 * that cannot be reached — a topic screen a release behind beats one that will not render.
 *
 * It is NOT the same list: the server offers `health` and has no `other`, because its cards have to
 * be exactly the vocabulary `Prayers::TopicClassifier` decides with on every turn. A card whose key
 * the classifier does not know starts the reading already off-topic, which is why the list is
 * fetched at all rather than kept here and hoped to match.
 */
const TOPICS: { key: CounselingTopic; labelKey: 'topic.love' | 'topic.career' | 'topic.wealth' | 'topic.relationships' | 'topic.life' | 'topic.other' }[] = [
  { key: 'love', labelKey: 'topic.love' },
  { key: 'career', labelKey: 'topic.career' },
  { key: 'wealth', labelKey: 'topic.wealth' },
  { key: 'relationships', labelKey: 'topic.relationships' },
  { key: 'life', labelKey: 'topic.life' },
  { key: 'other', labelKey: 'topic.other' },
];

/**
 * "What would you like to talk about?" — a topic is required before entering.
 *
 * ⚠️ UNROUTED SINCE 18-09. The request was "don't let the user choose a category, they can directly
 * enter the room", so `CounselingSubject` now sets the topic itself from the counsellor's specialty
 * and pushes `UnityEntry`. This screen is no longer in `RootStackParamList` and nothing navigates
 * to it; it is kept because the picker may return as something you change mid-session rather than a
 * gate in front of the room.
 *
 * The TOPIC ITSELF did not go away and must not: it picks the topic-suffixed voice takes
 * (`consult_p06_l0__love`, which have NO bare fallback) and fills `{0}` in the server prompt.
 */
export const CounselingTopicScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const counselor = useCounselingStore(s => s.counselor);
  const subject = useCounselingStore(s => s.subject);
  const setTopic = useCounselingStore(s => s.setTopic);

  const [selected, setSelected] = useState<CounselingTopic | undefined>();
  const [cards, setCards] = useState<TopicCard[] | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    fetchTopics(lang, ac.signal)
      .then(list => {
        if (!ac.signal.aborted) setCards(list);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [lang]);

  // One shape for both sources, so the grid below does not care which one it got.
  const options = cards
    ? cards.map(c => ({ key: c.key as CounselingTopic, label: c.label, description: c.description }))
    : TOPICS.map(topic => ({ key: topic.key, label: t(topic.labelKey), description: '' }));

  // Her ground first, the rest below — from the roster's `specialty`, so a new counselor's sections
  // come from the seed that already had to say what she does.
  const groups = groupTopicsFor(counselor?.characterId, options);

  // A language change swaps the labels under a selection whose key still exists; a server list that
  // does not carry the selected key would leave the Enter button live on nothing.
  useEffect(() => {
    if (selected && !options.some(o => o.key === selected)) setSelected(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const onEnter = () => {
    if (!selected) return;
    setTopic(selected);
    if (!counselor || !subject) return;
    // Straight into the Unity loading screen (spec §17).
    navigation.navigate('UnityEntry', {
      counselorId: counselor.id,
      subjectId: subject.id,
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          hitSlop={8}
          onPress={() => {
            sfx.back();
            navigation.goBack();
          }}>
          <Icon name="back" size={28} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('topic.title')}</Text>
        <Text style={styles.subtitle}>
          {t('topic.subtitle', { name: counselor?.name ?? '' })}
        </Text>

        {groups.map(group => (
          <View key={group.headingKey ?? 'all'}>
            {group.headingKey ? (
              <Text style={styles.section}>
                {t(group.headingKey, { name: counselor?.name ?? '' })}
              </Text>
            ) : null}
            <View style={styles.grid}>
              {group.items.map(option => {
                const isActive = selected === option.key;
                return (
                  <Pressable
                    key={option.key}
                    // Deselecting is not a choice being made — it takes the tap, not the select.
                    onPress={() => {
                      sfx[isActive ? 'tap' : 'select']();
                      setSelected(isActive ? undefined : option.key);
                    }}
                    style={[styles.topic, isActive && styles.topicActive]}>
                    <Text style={[styles.topicLabel, isActive && styles.topicLabelActive]}>
                      {option.label}
                    </Text>
                    {option.description ? (
                      <Text style={styles.topicDescription} numberOfLines={2}>
                        {option.description}
                      </Text>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t('topic.enter')} onPress={onEnter} disabled={!selected} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  headerSpacer: { width: 28 },
  scroll: { padding: spacing.xl, gap: spacing.md },
  title: { ...typography.h1, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.md },
  // Quiet: it labels a group, it does not compete with the cards under it.
  section: {
    ...typography.caption,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  topic: {
    width: '47%',
    paddingVertical: spacing.lg,
    minHeight: 92,
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  topicActive: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  topicLabel: { ...typography.h3, color: colors.textSecondary, textAlign: 'center' },
  topicDescription: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  topicLabelActive: { color: colors.violetSoft },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
