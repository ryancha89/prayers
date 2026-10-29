import React, { useEffect } from 'react';
import { Keyboard, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { IVORY, SERIF } from '../../../shared/components/hud/Hud';
import { CoinGlyph } from '../../coins/components/CoinGlyph';
import { formatCoins } from '../../coins/format';
import { useCoins } from '../../coins/store/coinStore';
import { CAFE_PRICE, type CafePaid } from '../table/useCafeTable';

const COPY: Record<CafePaid, { title: TranslationKey; body: TranslationKey }> = {
  reading: { title: 'cafe.pay.reading.title', body: 'cafe.pay.reading.body' },
  followup: { title: 'cafe.pay.followup.title', body: 'cafe.pay.followup.body' },
  coffee: { title: 'cafe.pay.coffee.title', body: 'cafe.pay.coffee.body' },
};

/**
 * "Magic Seven — 30 Prayer Coins": the one question asked before any coin is spent at the table
 * (the contract: coins are deducted only after the player confirms). It names the price and the
 * balance; short of coins, Pay becomes the way to the coin shop instead.
 *
 * Not a Modal: the coin shop IS one, and iOS will not present a second over the first
 * (DecorShop's lesson) — this is a plain layer over the cafe, and it takes the touches while open.
 */
export const ConfirmSheet: React.FC<{
  paid: CafePaid;
  onPay: () => void;
  onCancel: () => void;
  onGetCoins: () => void;
}> = ({ paid, onPay, onCancel, onGetCoins }) => {
  const t = useT();
  const balance = useCoins(s => s.balance);
  const price = CAFE_PRICE[paid];
  const short = balance != null && balance < price;
  // Sent from the composer, the keyboard stayed up over the sheet: Pay/Cancel sat under it and the
  // scrim took every other touch, so nothing could be pressed (sim 21-10).
  useEffect(() => { Keyboard.dismiss(); }, []);
  return (
    <View style={styles.scrim} testID="cafe-confirm">
      <View style={styles.card}>
        <Text style={styles.title}>{t(COPY[paid].title)}</Text>
        <Text style={styles.body}>{t(COPY[paid].body)}</Text>
        <View style={styles.priceRow}>
          <CoinGlyph size={22} />
          <Text style={styles.price} testID="cafe-confirm-price">{t('cafe.pay.price', { price })}</Text>
        </View>
        <Text style={[styles.balance, short && styles.short]} testID="cafe-confirm-balance">
          {t('cafe.pay.balance', { balance: balance == null ? '—' : formatCoins(balance) })}
        </Text>
        {short && <Text style={styles.short}>{t('cafe.pay.short')}</Text>}
        <View style={styles.buttons}>
          <Pressable
            onPress={() => { sfx.back(); onCancel(); }}
            accessibilityRole="button"
            accessibilityLabel={t('cafe.cancel')}
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
            <Text style={styles.ghostText}>{t('cafe.cancel')}</Text>
          </Pressable>
          {short ? (
            <Pressable
              testID="cafe-confirm-coins"
              onPress={() => { sfx.tap(); onGetCoins(); }}
              accessibilityRole="button"
              accessibilityLabel={t('cafe.pay.getCoins')}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Text style={styles.ctaText} numberOfLines={1}>{t('cafe.pay.getCoins')}</Text>
            </Pressable>
          ) : (
            <Pressable
              testID="cafe-confirm-pay"
              onPress={() => { sfx.select(); onPay(); }}
              accessibilityRole="button"
              accessibilityLabel={t('cafe.pay.confirm', { price })}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Text style={styles.ctaText} numberOfLines={1}>{t('cafe.pay.confirm', { price })}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
};

const LEAVE_LINE: Record<CafePaid, TranslationKey> = {
  reading: 'cafe.leaveAsk.reading',
  followup: 'cafe.leaveAsk.followup',
  coffee: 'cafe.leaveAsk.coffee',
};

const UNANSWERED_LINE: Record<CafePaid, TranslationKey> = {
  reading: 'cafe.leaveAsk.unanswered.reading',
  followup: 'cafe.leaveAsk.unanswered.followup',
  coffee: 'cafe.leaveAsk.unanswered.coffee',
};

/**
 * "Your reading is on its way and already paid — leave anyway?" (29-10). Asked when End, Leave or Back
 * is pressed while a paid answer is being written: the server has charged, and leaving drops the
 * answer. Stay keeps the table as it is; the answer shows when it lands (and closes this by itself).
 * The same plain layer as the pay sheet, for the same reason.
 *
 * `unanswered`: the paid request failed with no answer and may have been charged. Its main button is
 * Try again (the same request_id, so the server replays rather than charges twice) instead of Stay.
 */
export const LeaveSheet: React.FC<{
  paid: CafePaid;
  onStay: () => void;
  onLeave: () => void;
  unanswered?: boolean;
  onRetry?: () => void;
}> = ({ paid, onStay, onLeave, unanswered, onRetry }) => {
  const t = useT();
  const retrying = unanswered && onRetry;
  const mainLabel = retrying ? t('cafe.retry') : t('cafe.leaveAsk.stay');
  return (
    <View style={styles.scrim} testID={unanswered ? 'cafe-leave-unanswered' : 'cafe-leave-ask'}>
      <View style={styles.card}>
        <Text style={styles.title}>{t(unanswered ? UNANSWERED_LINE[paid] : LEAVE_LINE[paid])}</Text>
        <Text style={styles.body}>{t(unanswered ? 'cafe.leaveAsk.unanswered.body' : 'cafe.leaveAsk.body')}</Text>
        <View style={styles.buttons}>
          <Pressable
            testID="cafe-leave-anyway"
            onPress={() => { sfx.back(); onLeave(); }}
            accessibilityRole="button"
            accessibilityLabel={t('cafe.leaveAsk.leave')}
            style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}>
            <Text style={styles.ghostText} numberOfLines={1}>{t('cafe.leaveAsk.leave')}</Text>
          </Pressable>
          <Pressable
            testID={retrying ? 'cafe-leave-retry' : 'cafe-leave-stay'}
            onPress={() => { sfx.tap(); if (unanswered && onRetry) onRetry(); else onStay(); }}
            accessibilityRole="button"
            accessibilityLabel={mainLabel}
            style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
            <Text style={styles.ctaText} numberOfLines={1}>{mainLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

const INK = '#1A1330';

const styles = StyleSheet.create({
  scrim: {
    ...absoluteFill, backgroundColor: 'rgba(6,5,20,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  card: {
    width: '100%', maxWidth: 360, padding: spacing.lg, gap: spacing.sm, borderRadius: radius.lg,
    backgroundColor: 'rgba(18,14,40,0.96)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)',
  },
  title: { fontFamily: SERIF, fontSize: 20, color: IVORY, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, marginTop: spacing.xs },
  price: { ...typography.bodyStrong, color: colors.gold },
  balance: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  short: { ...typography.caption, color: '#F59E8B', textAlign: 'center' },
  buttons: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  ghost: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
  },
  ghostText: { ...typography.body, color: IVORY },
  cta: { flex: 1.4, alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold },
  ctaText: { ...typography.bodyStrong, color: INK },
  pressed: { opacity: 0.75 },
});
