import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { FIELDS } from '../../../archive/types';
import { MoodFace } from './MoodFace';

/** The five moods, from the archive's own field spec so the two editors cannot disagree. */
export const MOODS: string[] = FIELDS.diary.find(f => f.key === 'mood')?.options ?? [];

export const MoodRow: React.FC<{ value?: string; onChange(mood: string): void }> = ({ value, onChange }) => {
  const t = useT();
  return (
    <View style={styles.row}>
      {MOODS.map(m => {
        const on = value === m;
        return (
          <Pressable
            key={m}
            testID={`diary-mood-${m}`}
            onPress={() => { sfx.tap(); onChange(m); }}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={t(`archive.mood.${m}` as TranslationKey)}
            style={[styles.cell, on && styles.on]}>
            <MoodFace mood={m} size={30} color={on ? colors.gold : colors.textSecondary} fill={on ? 'rgba(233,196,106,0.16)' : 'none'} />
            <Text style={[styles.label, on && styles.labelOn]} numberOfLines={1}>
              {t(`archive.mood.${m}` as TranslationKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs },
  cell: {
    flex: 1, alignItems: 'center', gap: 2, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'transparent',
  },
  on: { borderColor: colors.gold, backgroundColor: 'rgba(233,196,106,0.12)' },
  label: { ...typography.tiny, color: colors.textSecondary },
  labelOn: { color: colors.gold },
});
