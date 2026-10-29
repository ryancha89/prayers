import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { storePrices } from '../../tickets/providers/purchase';
import { useCoins } from '../store/coinStore';
import { buyCoins, refreshCoins, type CoinProduct } from '../api/coinsApi';
import { CoinGlyph } from './CoinGlyph';
import { formatCoins, formatKrw } from '../format';

/**
 * The six Prayer Coin packs (10-15) — what PC credits, the base and bonus behind it, the price —
 * and the buy. One list for both places that sell coins: the Prayer Coins screen and the shop sheet
 * the journey and My Room open when the coins run short.
 *
 * The price is the store's own string ("₩3,300", "$2.49") when the store has the product, ours in
 * won otherwise. The products and what they credit are the server's (GET prayers/coins).
 */
export const CoinPackList: React.FC<{ onBought?(coinsAdded: number): void }> = ({ onBought }) => {
  const t = useT();
  const products = useCoins(s => s.products);
  // Packs the store charged for that the server has not confirmed yet (coinsApi holds and retries
  // them): not buyable again until they land, and the note says the payment arrived (29-10).
  const awaiting = useCoins(s => s.awaiting);
  const lateCredit = useCoins(s => s.lateCredit);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [prices, setPrices] = useState<Record<string, string>>({});
  // The credit already on screen when this list mounted is old news; only a new one is announced.
  const seenCredit = useRef(lateCredit?.seq ?? 0);

  useEffect(() => {
    refreshCoins();
  }, []);
  useEffect(() => {
    let alive = true;
    if (products.length) {
      storePrices(products.map(p => p.productId)).then(v => {
        if (alive) setPrices(v);
      });
    }
    return () => { alive = false; };
  }, [products]);

  // A held purchase confirmed later: the coins it said were coming have come.
  useEffect(() => {
    if (!lateCredit || lateCredit.seq === seenCredit.current) return;
    seenCredit.current = lateCredit.seq;
    if (lateCredit.coinsAdded > 0) setNote(t('coins.added', { coins: formatCoins(lateCredit.coinsAdded) }));
    else setNote(null);
  }, [lateCredit, t]);

  const buy = async (p: CoinProduct) => {
    if (busy || awaiting.includes(p.productId)) return;
    sfx.tap();
    setBusy(p.productId);
    setNote(null);
    const r = await buyCoins(p.productId);
    setBusy(null);
    if (r.ok) {
      sfx.select();
      setNote(t('coins.added', { coins: formatCoins(r.coinsAdded) }));
      onBought?.(r.coinsAdded);
    } else if (r.reason === 'pending') {
      setNote(t('coins.pending'));
    } else if (r.reason === 'awaiting') {
      setNote(t('coins.awaiting'));
    } else if (r.reason !== 'cancelled') {
      setNote(t(r.reason === 'unavailable' ? 'coins.unavailable' : 'coins.failed'));
    }
  };

  if (products.length === 0) return <ActivityIndicator color={colors.gold} style={styles.loading} />;
  return (
    <View style={styles.list}>
      {products.map(p => {
        const held = awaiting.includes(p.productId);
        return (
          <Pressable
            key={p.productId}
            style={({ pressed }) => [styles.row, pressed && styles.pressed]}
            onPress={() => buy(p)}
            disabled={!!busy || held}
            accessibilityState={{ disabled: !!busy || held, busy: busy === p.productId || held }}
            testID={`coin-pack-${p.productId}`}
            accessibilityRole="button"
            accessibilityLabel={`${t('coins.pack', { coins: formatCoins(p.coins) })} ${prices[p.productId] || formatKrw(t, p.priceKrw)}`}>
            <CoinGlyph size={30} />
            <View style={styles.text}>
              <Text style={styles.coins}>{t('coins.pack', { coins: formatCoins(p.coins) })}</Text>
              {p.bonusPct > 0 && (
                <Text style={styles.detail}>
                  {t('coins.detail', { base: formatCoins(p.baseCoins), bonus: formatCoins(p.coins - p.baseCoins) })}
                </Text>
              )}
            </View>
            {p.bonusPct > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{t('coins.bonus', { pct: p.bonusPct })}</Text>
              </View>
            )}
            {busy === p.productId || held ? (
              <ActivityIndicator color={colors.gold} style={styles.price} />
            ) : (
              <Text style={styles.price}>{prices[p.productId] || formatKrw(t, p.priceKrw)}</Text>
            )}
          </Pressable>
        );
      })}
      {note ? (
        <Text style={styles.note}>{note}</Text>
      ) : awaiting.length > 0 ? (
        // Opened again while a payment still waits: say so rather than show a spinner with no words.
        <Text style={styles.note}>{t('coins.awaiting')}</Text>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  loading: { marginVertical: spacing.xl },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.lg, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.2)',
  },
  pressed: { opacity: 0.7 },
  text: { flex: 1, gap: 2 },
  coins: { ...typography.h3, color: colors.textPrimary },
  detail: { ...typography.caption, color: colors.textSecondary },
  badge: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: colors.gold },
  badgeText: { ...typography.tiny, color: '#1A1330' },
  price: { ...typography.bodyStrong, color: colors.gold, minWidth: 64, textAlign: 'right' },
  note: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
});
