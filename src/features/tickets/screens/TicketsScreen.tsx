import React, { useCallback } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { sfx } from '../../../shared/audio/sfx';
import { PRAYER_COIN_ART } from '../assets/art';
import { column, useScreen } from '../../../shared/device/screen';
import { MiniPlayerSpacer } from '../../../shared/layout/miniPlayerInset';
import { useCoins } from '../../coins/store/coinStore';
import { refreshCoins } from '../../coins/api/coinsApi';
import { CoinPackList } from '../../coins/components/CoinPackList';
import { formatCoins } from '../../coins/format';

/**
 * Prayer Coins (10-15): the one currency — a consultation, the journey and My Room are all paid in
 * it — and where it is bought: the six store packs (CoinPackList). The balance is the coin wallet;
 * the daily check-in adds to it from its own page.
 */
export const TicketsScreen: React.FC = () => {
  const t = useT();
  const navigation = useNavigation();
  const coins = useCoins(s => s.balance);
  // Sized from the window, not from the asset: a static require() carries its pixel size, and a
  // percentage width on it resolved to that (a 960pt ticket sailing off the right edge).
  // From the COLUMN, and in landscape no taller than half the window.
  const screen = useScreen();
  const heroSize = Math.round(
    Math.min(screen.column - spacing.xl * 2, screen.landscape ? screen.height * 0.75 : Number.POSITIVE_INFINITY) * (2 / 3),
  );

  useFocusEffect(useCallback(() => { void refreshCoins(); }, []));

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, column]}>
        {/* The stack draws no header (RootNavigator), so the way back is this screen's to draw. */}
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              sfx.tap();
              navigation.goBack();
            }}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('unity.noTickets.back')}>
            <Icon name="back" size={22} />
          </Pressable>
          <Text style={styles.title}>{t('tickets.title')}</Text>
        </View>

        <Image
          source={PRAYER_COIN_ART}
          style={[styles.hero, { width: heroSize, height: heroSize }]}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('tickets.balance')}</Text>
          <Text style={styles.balanceValue}>{coins == null ? '—' : formatCoins(coins)}</Text>
        </View>

        <CoinPackList />

        <Text style={styles.note}>{t('tickets.note')}</Text>
        <MiniPlayerSpacer />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary, flexShrink: 1 },
  hero: { alignSelf: 'center', marginBottom: spacing.lg },
  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  balanceLabel: { ...typography.caption, color: colors.textSecondary },
  balanceValue: { ...typography.h1, color: colors.gold },
  note: { ...typography.caption, color: colors.textMuted, marginTop: spacing.lg },
});
