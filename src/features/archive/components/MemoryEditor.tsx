import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { FIELDS, MOOD_ICON, type ArchiveCategory, type FieldSpec } from '../types';
import { dayKey } from '../questions';
import { validate } from '../validation';

/**
 * One form for every category, built from `FIELDS`. The headline (`content`) is always first;
 * the rest are the category's own — a person's relation and closeness, a diary's mood and date,
 * a goal's status. Choices are chips, not pickers: a form that opens a wheel for "friend or
 * family" is the survey this tab is trying not to be.
 */
export interface EditorValue {
  content: string;
  details: Record<string, string>;
}

export const MemoryEditor: React.FC<{
  category: ArchiveCategory;
  initial?: EditorValue;
  onSave(value: EditorValue): void;
  onCancel(): void;
  /** Delete is offered only when editing something that exists. */
  onDelete?(): void;
}> = ({ category, initial, onSave, onCancel, onDelete }) => {
  const t = useT();
  const specs = FIELDS[category];
  const [content, setContent] = useState(initial?.content ?? '');
  const [details, setDetails] = useState<Record<string, string>>(() => ({
    ...(category === 'diary' ? { date: dayKey() } : {}),
    ...(category === 'story' ? { year: String(new Date().getFullYear()) } : {}),
    ...(initial?.details ?? {}),
  }));
  const set = (k: string, v: string) => setDetails(d => ({ ...d, [k]: v }));

  const errors = Object.fromEntries(specs.map(f => [f.key, validate(f, details[f.key])]));
  const complete =
    content.trim().length > 0 &&
    specs.every(f => !f.required || (details[f.key] ?? '').trim().length > 0) &&
    specs.every(f => errors[f.key] === null);

  const headlineLabel: TranslationKey =
    category === 'diary' || category === 'manual' || category === 'like' || category === 'dislike'
      ? 'archive.f.text'
      : category === 'profile'
        ? 'archive.f.value'
        : 'archive.f.name';

  const renderField = (f: FieldSpec) => {
    if (f.kind === 'choice') {
      return (
        <View key={f.key} style={styles.field}>
          <Text style={styles.label}>{t(f.label as TranslationKey)}</Text>
          <View style={styles.chips}>
            {(f.options ?? []).map(opt => {
              const on = details[f.key] === opt;
              const icon = f.key === 'mood' ? MOOD_ICON[opt] : undefined;
              return (
                <Pressable
                  key={opt}
                  onPress={() => {
                    sfx.tap();
                    set(f.key, opt);
                  }}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>
                    {icon ? `${icon} ` : ''}
                    {t(`${f.optionLabelPrefix}.${opt}` as TranslationKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      );
    }
    const numeric = f.kind === 'year' || f.kind === 'date' || f.kind === 'time';
    return (
      <View key={f.key} style={styles.field}>
        <Text style={styles.label}>{t(f.label as TranslationKey)}</Text>
        <TextInput
          style={[styles.input, f.kind === 'multiline' && styles.multiline]}
          value={details[f.key] ?? ''}
          onChangeText={v => set(f.key, f.kind === 'date' ? maskDate(v) : f.kind === 'time' ? maskTime(v) : v)}
          placeholder={f.kind === 'year' ? 'YYYY' : f.kind === 'date' ? 'YYYY-MM-DD' : f.kind === 'time' ? 'HH:MM' : ''}
          placeholderTextColor={colors.textMuted}
          keyboardType={numeric ? 'number-pad' : 'default'}
          maxLength={f.kind === 'year' ? 4 : f.kind === 'date' ? 10 : f.kind === 'time' ? 5 : 300}
          multiline={f.kind === 'multiline'}
        />
        {errors[f.key] ? <Text style={styles.error}>{t(errors[f.key] as TranslationKey)}</Text> : null}
      </View>
    );
  };

  // The profile's item picker decides what the headline is (blood type, MBTI …), so it goes above.
  const [before, after] =
    category === 'profile' ? [specs, [] as FieldSpec[]] : [[] as FieldSpec[], specs];

  return (
    <View style={styles.card}>
      {before.map(renderField)}
      <View style={styles.field}>
        <Text style={styles.label}>{t(headlineLabel)}</Text>
        <TextInput
          style={[styles.input, (category === 'diary' || category === 'manual') && styles.multiline]}
          value={content}
          onChangeText={setContent}
          placeholderTextColor={colors.textMuted}
          multiline={category === 'diary' || category === 'manual'}
          maxLength={category === 'diary' || category === 'manual' ? 1000 : 120}
          autoFocus
        />
      </View>
      {after.map(renderField)}

      <View style={styles.actions}>
        {onDelete ? (
          <Pressable
            onPress={() => {
              sfx.tap();
              onDelete();
            }}
            hitSlop={8}
            style={styles.deleteBtn}>
            <Text style={styles.deleteText}>{t('archive.delete')}</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.actionsRight}>
          <Pressable
            onPress={() => {
              sfx.tap();
              onCancel();
            }}
            style={styles.ghostBtn}>
            <Text style={styles.ghostText}>{t('archive.cancel')}</Text>
          </Pressable>
          <Pressable
            disabled={!complete}
            onPress={() => {
              sfx.select();
              onSave({ content: content.trim(), details });
            }}
            style={[styles.saveBtn, !complete && styles.saveDisabled]}>
            <Text style={styles.saveText}>{t('archive.save')}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

/** Digits in, dashes out: 19950412 → 1995-04-12. Typing the dash by hand is also accepted. */
export const maskDate = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
};

/** 1230 → 12:30. */
export const maskTime = (v: string): string => {
  const d = v.replace(/\D/g, '').slice(0, 4);
  return d.length <= 2 ? d : `${d.slice(0, 2)}:${d.slice(2)}`;
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.violetDim,
  },
  field: { gap: spacing.sm },
  label: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.tiny, color: colors.trending },
  input: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  chipOn: { backgroundColor: colors.violetDim, borderColor: colors.violetSoft },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextOn: { color: colors.textPrimary },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.sm },
  actionsRight: { flexDirection: 'row', gap: spacing.sm },
  deleteBtn: { paddingVertical: spacing.sm },
  deleteText: { ...typography.caption, color: colors.trending },
  ghostBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill },
  ghostText: { ...typography.caption, color: colors.textSecondary },
  saveBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.violet },
  saveDisabled: { opacity: 0.4 },
  saveText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
