import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { Icon } from '../../../shared/components/Icon';
import { sfx } from '../../../shared/audio/sfx';
import { PRAYER_TICKET_ART } from '../../tickets/assets/art';

export const HomeHeader: React.FC<{
  balanceLabel: string;
  onPressBalance: () => void;
}> = ({ balanceLabel, onPressBalance }) => (
  <View style={styles.row}>
    <Text style={styles.logo}>Prayers</Text>
    <Pressable
      accessibilityRole="button"
      onPress={() => { sfx.tap(); onPressBalance(); }}
      style={({ pressed }) => [styles.balance, pressed && styles.pressed]}>
      <Image source={PRAYER_TICKET_ART} style={styles.ticket} resizeMode="contain" />
      <Text style={styles.balanceText}>{balanceLabel}</Text>
      <Icon name="plus" size={16} color={colors.gold} />
    </Pressable>
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  logo: { ...typography.hero, color: colors.textPrimary },
  balance: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: colors.goldDim, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  ticket: { width: 27, height: 18 },
  balanceText: { ...typography.caption, color: colors.gold, flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
