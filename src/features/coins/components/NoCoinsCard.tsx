import React from 'react';
import { Image, ImageSourcePropType, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { CoinGlyph } from './CoinGlyph';
import { formatCoins } from '../format';
import { useCoins } from '../store/coinStore';

/** A word or glyph on a gold fill (the room's own ink). */
const ON_GOLD = '#1A1330';

/**
 * "Not enough Prayer Coins for this question" — over the consultation room, at the moment the
 * player asks (16-10, user: "질문전까지 이화면보이지마 질문할때 없으면 유도해야해").
 *
 * It used to be a whole page at the door: the room never loaded, and a player who only wanted to
 * look round met a bill first. Now the room opens whatever the wallet says, and this card appears
 * over it when a question would cost more than they hold — whom they were talking to, what one
 * question costs against their balance, and buying (the app's coin shop sheet) as the one gold way
 * on. Closing it leaves them in the room with their question still in the box.
 */
export const NoCoinsCard: React.FC<{
  face?: ImageSourcePropType;
  accent?: string;
  cost: number;
  onClose(): void;
}> = ({ face, accent, cost, onClose }) => {
  const t = useT();
  const balance = useCoins(s => s.balance);
  const buy = () => {
    sfx.select();
    onClose();
    useCoins.getState().openShop();
  };

  return (
    <View style={styles.scrim}>
      <View style={styles.sheet} testID="no-coins-card">
        <View style={styles.faceWrap}>
          {face ? (
            <Image source={face} style={styles.face} resizeMode="cover" />
          ) : (
            <View style={[styles.face, { backgroundColor: accent ?? colors.violet }]} />
          )}
          <View style={styles.coinBadge}>
            <CoinGlyph size={26} />
          </View>
        </View>
        <Text style={styles.title}>{t('unity.noTickets.title')}</Text>
        <Text style={styles.body}>{t('unity.noTickets.body')}</Text>

        <View style={styles.ledger}>
          <View style={styles.ledgerCell}>
            <Text style={styles.ledgerLabel}>{t('unity.noTickets.cost')}</Text>
            <View style={styles.ledgerValue}>
              <CoinGlyph size={16} />
              <Text style={styles.ledgerNumber}>{formatCoins(cost)}</Text>
            </View>
          </View>
          <View style={styles.ledgerRule} />
          <View style={styles.ledgerCell}>
            <Text style={styles.ledgerLabel}>{t('unity.noTickets.have')}</Text>
            <View style={styles.ledgerValue}>
              <CoinGlyph size={16} />
              <Text style={[styles.ledgerNumber, styles.ledgerShort]}>{formatCoins(balance)}</Text>
            </View>
          </View>
        </View>

        <Pressable
          testID="no-coins-buy"
          style={({ pressed }) => [styles.buy, pressed && styles.pressed]}
          onPress={buy}
          accessibilityRole="button">
          <CoinGlyph size={20} />
          <Text style={styles.buyText}>{t('unity.noTickets.topUp')}</Text>
          <Icon name="arrowRight" size={16} color={ON_GOLD} />
        </Pressable>
        <Pressable
          testID="no-coins-close"
          style={styles.back}
          onPress={() => { sfx.tap(); onClose(); }}
          hitSlop={8}
          accessibilityRole="button">
          <Text style={styles.backText}>{t('unity.noTickets.back')}</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  scrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(5,5,10,0.6)',
  },
  sheet: {
    width: '86%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.25)',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
    paddingBottom: spacing.lg,
  },
  faceWrap: { marginBottom: spacing.lg },
  face: { width: 96, height: 96, borderRadius: 48, borderWidth: 2, borderColor: colors.gold },
  coinBadge: {
    position: 'absolute', right: -4, bottom: -4,
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.card,
  },
  title: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  body: { ...typography.body, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.sm },
  ledger: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    marginTop: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.bg,
  },
  ledgerCell: { flex: 1, alignItems: 'center', gap: spacing.xs },
  ledgerRule: { width: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.12)' },
  ledgerLabel: { ...typography.caption, color: colors.textMuted },
  ledgerValue: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ledgerNumber: { ...typography.h3, color: colors.textPrimary },
  ledgerShort: { color: colors.gold },
  buy: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingVertical: spacing.md + 2,
    borderRadius: radius.pill,
    backgroundColor: colors.gold,
  },
  buyText: { ...typography.bodyStrong, color: ON_GOLD },
  pressed: { opacity: 0.8 },
  back: { marginTop: spacing.md, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  backText: { ...typography.body, color: colors.textSecondary },
});
