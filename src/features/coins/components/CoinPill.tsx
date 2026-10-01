import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { useCoins } from '../store/coinStore';
import { refreshCoins } from '../api/coinsApi';

/** "[coin] 1,200 +" in a journey header (mockup, 01-10). The whole pill opens the coin shop. */
export const CoinPill: React.FC = () => {
  const balance = useCoins(s => s.balance);
  const openShop = useCoins(s => s.openShop);
  // A screen with the pill shows a real number: ask once if nothing has said one yet.
  useEffect(() => {
    if (useCoins.getState().balance == null) refreshCoins();
  }, []);
  return (
    <Pressable
      hitSlop={8}
      style={styles.pill}
      onPress={() => { sfx.tap(); openShop(); }}
      accessibilityRole="button"
      accessibilityLabel={`${balance ?? 0}`}>
      <Icon name="coin" size={16} color={colors.gold} />
      <Text style={styles.count}>{balance == null ? '—' : balance.toLocaleString()}</Text>
      <Text style={styles.plus}>+</Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.8)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
  },
  count: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  plus: { ...typography.bodyStrong, color: colors.gold, marginLeft: 2 },
});
