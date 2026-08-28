import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { RootStackParamList } from '../../../navigation/types';
import { SELF, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { SubjectCard } from '../../subjects/components/SubjectCard';
import { useCounselingStore } from '../store/counselingStore';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** "Who would you like to ask about?" (spec §14). */
export const CounselingSubjectScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const subjects = useSubjectsStore(s => s.subjects);
  const all = useMemo(() => [SELF, ...subjects], [subjects]);
  const counselor = useCounselingStore(s => s.counselor);
  const setSubject = useCounselingStore(s => s.setSubject);

  const [selectedId, setSelectedId] = useState<string>('self');

  const onNext = () => {
    const subject = all.find(s => s.id === selectedId);
    if (!subject) return;
    setSubject(subject);
    navigation.navigate('CounselingTopic');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
          <Icon name="back" size={28} />
        </Pressable>
        <Text style={styles.step}>{t('subject.with', { name: counselor?.name ?? '' })}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('subject.title')}</Text>

        <View style={styles.group}>
          {all
            .filter(s => s.isUser)
            .map(s => (
              <SubjectCard
                key={s.id}
                subject={s}
                selected={selectedId === s.id}
                onPress={() => setSelectedId(s.id)}
              />
            ))}
        </View>

        <Text style={styles.groupLabel}>{t('subject.saved')}</Text>
        <View style={styles.group}>
          {all
            .filter(s => !s.isUser)
            .map(s => (
              <SubjectCard
                key={s.id}
                subject={s}
                selected={selectedId === s.id}
                onPress={() => setSelectedId(s.id)}
              />
            ))}

          <Pressable style={styles.addRow} onPress={() => navigation.navigate('AddSubject')}>
            <Icon name="plus" size={22} color={colors.violetSoft} />
            <Text style={styles.addLabel}>{t('subject.add')}</Text>
          </Pressable>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t('subject.continue')} onPress={onNext} />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  step: { ...typography.caption, color: colors.textMuted },
  headerSpacer: { width: 28 },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary },
  group: { gap: spacing.sm },
  groupLabel: { ...typography.caption, color: colors.textMuted, marginTop: spacing.sm },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.card,
    borderStyle: 'dashed',
  },
  addLabel: { ...typography.bodyStrong, color: colors.violetSoft },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
