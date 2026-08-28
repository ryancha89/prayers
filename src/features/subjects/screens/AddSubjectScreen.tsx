import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { useSubjectsStore } from '../store/subjectsStore';

/** New person form — kept short (spec §14, §16 "do not force too many fields"). */
export const AddSubjectScreen: React.FC = () => {
  const navigation = useNavigation();
  const t = useT();
  const addSubject = useSubjectsStore(s => s.addSubject);

  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [birthTime, setBirthTime] = useState('');

  const onSave = () => {
    if (!name.trim()) return;
    addSubject({
      displayName: name.trim(),
      birthDate: birthDate.trim() || undefined,
      birthTime: birthTime.trim() || undefined,
    });
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable hitSlop={8} onPress={() => navigation.goBack()}>
          <Icon name="back" size={28} />
        </Pressable>
        <Text style={styles.headerTitle}>{t('addSubject.title')}</Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
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
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t('addSubject.save')} onPress={onSave} disabled={!name.trim()} />
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
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
});
