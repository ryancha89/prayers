import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useT, type TranslationKey } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { DIARY_KINDS, type DiaryKind } from '../../../archive/types';

/** Diary / Goals / Wishes / Plans — and, with `all`, an "All" tab first (the list's filter). */
export const KindTabs: React.FC<{
  value: DiaryKind | 'all';
  onChange(kind: DiaryKind | 'all'): void;
  all?: boolean;
  /** Editing an entry: its kind is fixed (see saveDiaryEntry). */
  locked?: boolean;
  testID?: string;
}> = ({ value, onChange, all, locked, testID }) => {
  const t = useT();
  const tabs: (DiaryKind | 'all')[] = all ? ['all', ...DIARY_KINDS] : [...DIARY_KINDS];
  return (
    <View style={styles.row} testID={testID}>
      {tabs.map(k => {
        const on = value === k;
        return (
          <Pressable
            key={k}
            testID={`${testID ?? 'kind'}-${k}`}
            disabled={locked && !on}
            onPress={() => { sfx.tap(); onChange(k); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: locked && !on }}
            style={[styles.tab, on && styles.on, locked && !on && styles.off]}>
            <Text style={[styles.text, on && styles.textOn]} numberOfLines={1}>
              {t((k === 'all' ? 'diary.list.all' : `diary.kind.${k}`) as TranslationKey)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: spacing.xs, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: radius.pill, padding: 3 },
  tab: { flex: 1, paddingVertical: 7, borderRadius: radius.pill, alignItems: 'center' },
  on: { backgroundColor: colors.gold },
  off: { opacity: 0.35 },
  text: { ...typography.caption, color: colors.textSecondary, fontWeight: '700' },
  textOn: { color: '#2A2140' },
});
