import React from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { Icon } from '../../../shared/components/Icon';
import { sfx } from '../../../shared/audio/sfx';
import { PRAYER_TICKET_ART } from '../../tickets/assets/art';
import { useT } from '../../../shared/i18n';

export const HomeHeader: React.FC<{
  balanceLabel: string;
  onPressBalance: () => void;
  /** The 3D pill (spec 004, mockup 19): into the world. Absent = no pill. */
  onPress3D?: () => void;
}> = ({ balanceLabel, onPressBalance, onPress3D }) => {
  const t = useT();
  return (
    <View style={styles.row}>
      <Text style={styles.logo}>Prayers</Text>
      <View style={styles.pills}>
        <Pressable
          accessibilityRole="button"
          onPress={() => { sfx.tap(); onPressBalance(); }}
          style={({ pressed }) => [styles.balance, pressed && styles.pressed]}>
          <Image source={PRAYER_TICKET_ART} style={styles.ticket} resizeMode="contain" />
          <Text style={styles.balanceText}>{balanceLabel}</Text>
          <Icon name="plus" size={16} color={colors.gold} />
        </Pressable>
        {onPress3D && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('world.pill.a11y')}
            onPress={() => { sfx.select(); onPress3D(); }}
            style={({ pressed }) => [styles.world, pressed && styles.pressed]}>
            <Icon name="castle" size={18} color={colors.violetSoft} />
            <Text style={styles.worldText}>{t('world.pill')}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

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
  pills: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
  // The mockup's violet pill with a glow round its border: the one door on Home that leads out of
  // the cards, so it is the one thing up here that is not gold.
  world: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2, borderRadius: radius.pill,
    backgroundColor: 'rgba(139,92,246,0.18)', borderWidth: 1.5, borderColor: colors.violetSoft,
    shadowColor: colors.violet, shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 },
  },
  worldText: { ...typography.bodyStrong, color: colors.textPrimary },
  balanceText: { ...typography.caption, color: colors.gold, flexShrink: 1 },
  pressed: { opacity: 0.7 },
});
