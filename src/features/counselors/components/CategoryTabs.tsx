import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, typography } from '../../../shared/theme';

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
          onPress={() => onChange(c.key)}
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
