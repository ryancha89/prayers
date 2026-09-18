import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, spacing, typography } from '../../../shared/theme';
import { Icon } from '../../../shared/components/Icon';

export const HomeHeader: React.FC = () => (
  <View style={styles.row}>
    <Text style={styles.logo}>Prayers</Text>
    <View style={styles.actions}>
      <Pressable hitSlop={10} style={styles.iconBtn}>
        <Icon name="search" size={20} color={colors.textSecondary} />
      </Pressable>
      <Pressable hitSlop={10} style={styles.iconBtn}>
        <Icon name="bell" size={20} color={colors.textSecondary} />
      </Pressable>
    </View>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  logo: { ...typography.hero, color: colors.textPrimary },
  actions: { flexDirection: 'row', gap: spacing.md },
  iconBtn: { padding: 4 },
});
