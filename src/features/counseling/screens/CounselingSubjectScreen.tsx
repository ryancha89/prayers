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
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { SubjectCard } from '../../subjects/components/SubjectCard';
import { useCounselingStore } from '../store/counselingStore';
import { saveSajuProfile } from '../api/prayersServer';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** "Who would you like to ask about?" (spec §14). */
export const CounselingSubjectScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const subjects = useSubjectsStore(s => s.subjects);
  // The stored self, not the frozen default: it now carries the account holder's own birth data.
  const self = useSubjectsStore(s => s.self);
  const all = useMemo(() => [self, ...subjects], [self, subjects]);
  const counselor = useCounselingStore(s => s.counselor);
  const setSubject = useCounselingStore(s => s.setSubject);

  const [selectedId, setSelectedId] = useState<string>('self');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  /**
   * The chosen subject's birth data goes to the SERVER here, and the consultation only continues if
   * it lands. This is the step that was missing entirely: the app collected birth dates and kept
   * them on the phone, so every reading was asked about a person the server had never heard of.
   *
   * This screen does NOT ask for that data. It is a picker, and everything in it should already be
   * pickable — `self` is filled in at first run and saved people are required to be complete. The
   * route-to-the-form branch stays only for a person saved before gender was a field; if it starts
   * firing for `self`, first-run did not run.
   */
  const onNext = async () => {
    const subject = all.find(s => s.id === selectedId);
    if (!subject || saving) return;

    if (!hasBirthData(subject)) {
      navigation.navigate('AddSubject', { subjectId: subject.id });
      return;
    }

    setSaving(true);
    setSaveFailed(false);
    const saved = await saveSajuProfile({
      name: subject.displayName,
      birthDate: subject.birthDate!,
      birthTime: subject.birthTime,
      gender: subject.gender!,
    });
    setSaving(false);

    if (!saved) {
      setSaveFailed(true);
      return;
    }

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
        {saveFailed ? <Text style={styles.saveFailed}>{t('subject.saveFailed')}</Text> : null}
        <PrimaryButton
          label={
            saving
              ? t('subject.saving')
              : hasBirthData(all.find(s => s.id === selectedId))
                ? t('subject.continue')
                : t('subject.addDetails')
          }
          onPress={onNext}
          disabled={saving}
        />
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  saveFailed: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    paddingBottom: spacing.sm,
  },
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
