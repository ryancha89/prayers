import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { productPrice } from '../../tickets/providers/purchase';
import { useCoins } from '../store/coinStore';
import { buyCoins, refreshCoins, type CoinProduct } from '../api/coinsApi';
import { useScreen } from '../../../shared/device/screen';

/** A Modal is portrait-only on iOS unless it says otherwise: opened over a landscape journey, the
 *  default would turn the whole app upright under the player for as long as the sheet was up. */
export const ALL_ORIENTATIONS = ['portrait', 'landscape-left', 'landscape-right'] as const;

/**
 * The coin shop (mockup, 01-10): four rows — coins, price, bonus badge — and a close ×. Mounted once
 * in App.tsx and opened through the coin store, so the journey's lock can open it directly when the
 * coins run short.
 */
export const CoinShopSheet: React.FC = () => {
  const t = useT();
  const open = useCoins(s => s.shopOpen);
  const close = useCoins(s => s.closeShop);
  const balance = useCoins(s => s.balance);
  const products = useCoins(s => s.products);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [storePrices, setStorePrices] = useState<Record<string, string>>({});
  // Four rows, a header and a balance are ~400pt — the whole height of a phone held sideways. In
  // landscape the sheet is a centred column that stops short of the top, and its rows scroll.
  const screen = useScreen();
  const side = screen.landscape
    ? { width: screen.column, alignSelf: 'center' as const, maxHeight: Math.round(screen.height * 0.9) }
    : null;

  useEffect(() => {
    if (!open) return;
    setNote(null);
    refreshCoins();
  }, [open]);
  // The store's own price string where the store has one ("₩3,300", "$2.49"); ours otherwise.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    products.forEach(p => {
      productPrice(p.productId).then(v => {
        if (alive && v) setStorePrices(x => ({ ...x, [p.productId]: v }));
      });
    });
    return () => { alive = false; };
  }, [open, products]);

  const buy = async (p: CoinProduct) => {
    if (busy) return;
    sfx.tap();
    setBusy(p.productId);
    setNote(null);
    const r = await buyCoins(p.productId);
    setBusy(null);
    if (r.ok) {
      sfx.select();
      setNote(t('coins.added', { coins: r.coinsAdded.toLocaleString() }));
    } else if (r.reason !== 'cancelled') {
      setNote(t(r.reason === 'unavailable' ? 'coins.unavailable' : 'coins.failed'));
    }
  };

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
            <Text style={styles.close}>×</Text>
          </Pressable>
        </View>
        <View style={styles.balanceRow}>
          <Icon name="coin" size={18} color={colors.gold} />
          <Text style={styles.balance}>{t('journey.moment.balance', { balance: (balance ?? 0).toLocaleString() })}</Text>
        </View>
        <ScrollView style={styles.rows} contentContainerStyle={styles.rowsInner} bounces={false}>
        {products.length === 0 ? (
          <ActivityIndicator color={colors.gold} style={styles.loading} />
        ) : (
          products.map(p => (
            <Pressable key={p.productId} style={styles.row} onPress={() => buy(p)} disabled={!!busy} accessibilityRole="button">
              <Icon name="coin" size={22} color={colors.gold} />
              <Text style={styles.coins}>{p.coins.toLocaleString()}</Text>
              {p.bonusPct > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{t('coins.bonus', { pct: p.bonusPct })}</Text>
                </View>
              )}
              <View style={styles.flex} />
              {busy === p.productId ? (
                <ActivityIndicator color={colors.gold} />
              ) : (
                <Text style={styles.price}>
                  {storePrices[p.productId] ?? t('journey.pass.krw', { price: p.priceKrw.toLocaleString('ko-KR') })}
                </Text>
              )}
            </Pressable>
          ))
        )}
        </ScrollView>
        {note ? <Text style={styles.note}>{note}</Text> : null}
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
  close: { fontSize: 28, lineHeight: 30, color: colors.textSecondary },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  balance: { ...typography.caption, color: colors.textSecondary },
  rows: { flexGrow: 0, flexShrink: 1 },
  rowsInner: { gap: spacing.md },
  loading: { marginVertical: spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.2)',
  },
  coins: { ...typography.h3, color: colors.textPrimary },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.gold },
  badgeText: { ...typography.tiny, color: '#1A1330' },
  flex: { flex: 1 },
  price: { ...typography.bodyStrong, color: colors.gold },
  note: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
