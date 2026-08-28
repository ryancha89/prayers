import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { RootStackParamList } from '../../../navigation/types';
import { CounselingTopic } from '../types';
import { useCounselingStore } from '../store/counselingStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

const TOPICS: { key: CounselingTopic; labelKey: 'topic.love' | 'topic.career' | 'topic.wealth' | 'topic.relationships' | 'topic.life' | 'topic.other' }[] = [
  { key: 'love', labelKey: 'topic.love' },
  { key: 'career', labelKey: 'topic.career' },
  { key: 'wealth', labelKey: 'topic.wealth' },
  { key: 'relationships', labelKey: 'topic.relationships' },
  { key: 'life', labelKey: 'topic.life' },
  { key: 'other', labelKey: 'topic.other' },
];

/** "What would you like to talk about?" — a topic is required before entering. */
export const CounselingTopicScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const counselor = useCounselingStore(s => s.counselor);
  const subject = useCounselingStore(s => s.subject);
  const setTopic = useCounselingStore(s => s.setTopic);

  const [selected, setSelected] = useState<CounselingTopic | undefined>();

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
        <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
          <Icon name="back" size={28} />
        </Pressable>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('topic.title')}</Text>
        <Text style={styles.subtitle}>
          {t('topic.subtitle', { name: counselor?.name ?? '' })}
        </Text>

        <View style={styles.grid}>
          {TOPICS.map(topic => {
            const isActive = selected === topic.key;
            return (
              <Pressable
                key={topic.key}
                onPress={() => setSelected(isActive ? undefined : topic.key)}
                style={[styles.topic, isActive && styles.topicActive]}>
                <Text style={[styles.topicLabel, isActive && styles.topicLabelActive]}>
                  {t(topic.labelKey)}
                </Text>
              </Pressable>
            );
          })}
        </View>
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
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  topic: {
    width: '47%',
    paddingVertical: spacing.xl,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  topicActive: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  topicLabel: { ...typography.h3, color: colors.textSecondary },
  topicLabelActive: { color: colors.violetSoft },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
