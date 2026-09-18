import React from 'react';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';

export const CategoryTabs: React.FC<{
  categories: { key: string; label: string }[];
  active: string;
  onChange: (key: string) => void;
}> = ({ categories, active, onChange }) => (
  <ScrollView
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={styles.row}>
    {categories.map(c => {
      const isActive = c.key === active;
      return (
        <Pressable
          key={c.key}
          // `select` means something CHANGED — pressing the chip you are already on changed
          // nothing, so it gets the everyday tap instead. Same distinction the four cues were
          // synthesised for (Tools/audio/gen_ui_sfx.py).
          onPress={() => {
            sfx[isActive ? 'tap' : 'select']();
            onChange(c.key);
          }}
          style={[styles.chip, isActive && styles.chipActive]}>
          <Text style={[styles.label, isActive && styles.labelActive]}>{c.label}</Text>
        </Pressable>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  row: { paddingHorizontal: spacing.lg, gap: spacing.sm, paddingVertical: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
  },
  chipActive: { backgroundColor: colors.violet },
  label: { ...typography.caption, color: colors.textSecondary },
  labelActive: { color: '#FFFFFF', fontWeight: '700' },
});
