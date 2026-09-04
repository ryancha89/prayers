import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { useSubjectsStore } from '../store/subjectsStore';
import type { RootStackParamList } from '../../../navigation/types';
import type { CounselingSubject } from '../../counseling/types';

/**
 * The birth-data form, for a new person OR for one that already exists — including `self`, the
 * account holder, who until now had no way to say who they were at all.
 *
 * Still short (spec §14, §16 "do not force too many fields"), but two of these fields are no longer
 * optional in practice: without a birth DATE the server cannot build a chart, and without GENDER it
 * silently assumes male and reads someone else's life. The time may genuinely be unknown, and
 * leaving it blank says so — the calendar drops the hour pillar rather than guessing midnight.
 */
export const AddSubjectScreen: React.FC = () => {
  const navigation = useNavigation();
  const { params } = useRoute<RouteProp<RootStackParamList, 'AddSubject'>>();
  const t = useT();
  const addSubject = useSubjectsStore(s => s.addSubject);
  const updateSubject = useSubjectsStore(s => s.updateSubject);
  const existing = useSubjectsStore(s => (params?.subjectId ? s.getById(params.subjectId) : undefined));

  // The stored self carries a placeholder name nobody chose; showing it as a filled-in field would
  // invite the user to accept "Myself" as their name.
  const onboarding = params?.onboarding === true;
  const initialName = existing && !existing.isUser ? existing.displayName : '';

  const [name, setName] = useState(initialName);
  const [birthDate, setBirthDate] = useState(existing?.birthDate ?? '');
  const [birthTime, setBirthTime] = useState(existing?.birthTime ?? '');
  const [gender, setGender] = useState<CounselingSubject['gender']>(existing?.gender);

  const complete = !!name.trim() && !!birthDate.trim() && !!gender;

  const onSave = () => {
    if (!complete) return;
    const patch = {
      displayName: name.trim(),
      birthDate: birthDate.trim(),
      birthTime: birthTime.trim() || undefined,
      gender,
    };
    if (existing) updateSubject(existing.id, patch);
    else addSubject(patch);
    if (onboarding) return; // the navigator swaps the whole stack once `self` has data
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        {/* No way back out of the first run: this screen IS the app until it is answered, and a
            back arrow with nothing behind it is a dead control. */}
        {onboarding ? (
          <View style={styles.headerSpacer} />
        ) : (
          <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
            <Icon name="back" size={28} />
          </Pressable>
        )}
        <Text style={styles.headerTitle}>
          {onboarding
            ? t('addSubject.selfTitle')
            : existing?.isUser
              ? t('addSubject.editSelf')
              : t('addSubject.title')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {onboarding ? <Text style={styles.intro}>{t('addSubject.selfIntro')}</Text> : null}
        <Field
          label={t('addSubject.name')}
          value={name}
          onChange={setName}
          placeholder={t('addSubject.namePlaceholder')}
          autoFocus
        />
        <Field
          label={t('addSubject.birthDate')}
          value={birthDate}
          onChange={setBirthDate}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
        />
        <Field
          label={t('addSubject.birthTime')}
          value={birthTime}
          onChange={setBirthTime}
          placeholder="HH:MM"
          keyboardType="numbers-and-punctuation"
        />
        <Text style={styles.label}>{t('addSubject.gender')}</Text>
        <View style={styles.genderRow}>
          {(['female', 'male'] as const).map(g => (
            <Pressable
              key={g}
              onPress={() => setGender(g)}
              style={[styles.genderOption, gender === g && styles.genderOptionActive]}>
              <Text style={[styles.genderLabel, gender === g && styles.genderLabelActive]}>
                {t(g === 'female' ? 'addSubject.female' : 'addSubject.male')}
              </Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.hint}>{t('addSubject.hint')}</Text>
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t('addSubject.save')} onPress={onSave} disabled={!complete} />
      </View>
    </SafeAreaView>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  keyboardType?: 'default' | 'numbers-and-punctuation';
}> = ({ label, value, onChange, placeholder, autoFocus, keyboardType }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      style={styles.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.textMuted}
      autoFocus={autoFocus}
      keyboardType={keyboardType}
    />
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.h3, color: colors.textPrimary },
  headerSpacer: { width: 28 },
  scroll: { padding: spacing.xl, gap: spacing.lg },
  field: { gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  genderRow: { flexDirection: 'row', gap: spacing.md },
  genderOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  genderOptionActive: { borderColor: colors.violet, backgroundColor: colors.violetDim },
  genderLabel: { ...typography.body, color: colors.textSecondary },
  genderLabelActive: { color: colors.violetSoft },
  hint: { ...typography.caption, color: colors.textMuted, lineHeight: 18 },
  intro: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
