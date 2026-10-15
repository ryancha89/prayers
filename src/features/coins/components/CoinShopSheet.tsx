import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useCoins } from '../store/coinStore';
import { useScreen } from '../../../shared/device/screen';
import { CoinGlyph } from './CoinGlyph';
import { CoinPackList } from './CoinPackList';
import { formatCoins } from '../format';

/** A Modal is portrait-only on iOS unless it says otherwise: opened over a landscape journey, the
 *  default would turn the whole app upright under the player for as long as the sheet was up. */
export const ALL_ORIENTATIONS = ['portrait', 'landscape-left', 'landscape-right'] as const;

/**
 * The coin shop sheet (mockup, 01-10; 10-15 the six Prayer Coin packs): the packs and a close ×.
 * Mounted once in App.tsx and opened through the coin store, so the journey's lock, My Room and the
 * room can open it directly when the coins run short.
 */
export const CoinShopSheet: React.FC = () => {
  const t = useT();
  const open = useCoins(s => s.shopOpen);
  const close = useCoins(s => s.closeShop);
  const balance = useCoins(s => s.balance);
  // Six rows, a header and a balance are taller than a phone held sideways. In landscape the sheet
  // is a centred column that stops short of the top, and its rows scroll.
  const screen = useScreen();
  const side = screen.landscape
    ? { width: screen.column, alignSelf: 'center' as const, maxHeight: Math.round(screen.height * 0.9) }
    : { maxHeight: Math.round(screen.height * 0.85) };

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={close}
      supportedOrientations={[...ALL_ORIENTATIONS]}>
      <View style={styles.modalRoot}>
      {/* Behind the sheet, not above it: the dim has to reach the sides of a landscape column too. */}
      <Pressable style={styles.scrim} onPress={close} accessibilityRole="button" />
      <View style={[styles.sheet, side]}>
        <View style={styles.head}>
          <Text style={styles.title}>{t('coins.title')}</Text>
          <Pressable hitSlop={12} onPress={() => { sfx.back(); close(); }} accessibilityRole="button" accessibilityLabel={t('coins.close')}>
            <Icon name="close" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>
        <View style={styles.balanceRow}>
          <CoinGlyph size={20} />
          <Text style={styles.balance}>{t('journey.moment.balance', { balance: formatCoins(balance) })}</Text>
        </View>
        <ScrollView style={styles.rows} bounces={false}>
          {open && <CoinPackList />}
        </ScrollView>
      </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  scrim: { ...absoluteFill, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: {
    backgroundColor: '#15112E', paddingHorizontal: spacing.xl, paddingTop: spacing.lg, paddingBottom: spacing.xxl,
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, gap: spacing.md,
    borderTopWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { ...typography.h3, color: colors.textPrimary },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balance: { ...typography.caption, color: colors.textSecondary },
  rows: { flexGrow: 0, flexShrink: 1 },
});
