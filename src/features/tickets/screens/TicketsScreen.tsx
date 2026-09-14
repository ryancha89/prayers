import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import {
  TIERS,
  TIER_GRANT,
  activateSubscription,
  claimDaily,
  fetchSubscription,
  productIdFor,
  type SubscriptionStatus,
  type Tier,
} from '../api/subscription';
import { buySubscription, purchaseAvailable } from '../providers/purchase';

/**
 * Where tickets come from.
 *
 * Until now they came from nowhere: the app read the balance on the way into a room, refused entry
 * at zero, and offered a Back button — while MyPage showed a wallet of 120 credits that was a
 * constant in a file. The server has sold a ticket subscription for years; this screen is the app
 * finally asking for it.
 *
 * The allowance is claimed on arrival, not on a button. An allowance you have to remember to
 * collect is one you will be annoyed to find you lost, and `claim` is safe to call at any time —
 * it answers 200 with `granted: 0` when there is nothing to give.
 */
export const TicketsScreen: React.FC = () => {
  const t = useT();
  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Tier | null>(null);

  const refresh = useCallback(async () => {
    const granted = await claimDaily();
    const next = await fetchSubscription();
    setStatus(next);
    setLoading(false);
    if (granted > 0) Alert.alert(t('tickets.claimedTitle'), t('tickets.claimed', { count: granted }));
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const subscribe = async (tier: Tier) => {
    sfx.select();
    setBusy(tier);
    try {
      const purchase = await buySubscription(productIdFor(tier));
      const ok = await activateSubscription(purchase);
      if (!ok) Alert.alert(t('tickets.failedTitle'), t('tickets.activateFailed'));
      await refresh();
    } catch (e) {
      // The provider's own message in dev — "cancelled" and "no pod" are different problems.
      Alert.alert(t('tickets.failedTitle'), __DEV__ && e instanceof Error ? e.message : t('tickets.failed'));
    } finally {
      setBusy(null);
    }
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('tickets.title')}</Text>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>{t('tickets.balance')}</Text>
          <Text style={styles.balanceValue}>
            {loading ? '—' : (status?.balance ?? 0)}
          </Text>
          {status?.active && status.tier ? (
            <Text style={styles.balanceNote}>
              {t('tickets.activeTier', { tier: status.tier, daily: String(status.daily ?? 0) })}
            </Text>
          ) : (
            <Text style={styles.balanceNote}>{t('tickets.noSubscription')}</Text>
          )}
        </View>

        {TIERS.map(tier => (
          <Pressable
            key={tier}
            style={[styles.tier, status?.tier === tier && status.active ? styles.tierCurrent : null]}
            disabled={busy != null}
            onPress={() => subscribe(tier)}>
            <View style={styles.tierText}>
              <Text style={styles.tierName}>{t(`tickets.tier.${tier}` as never)}</Text>
              <Text style={styles.tierGrant}>
                {t('tickets.grant', {
                  start: String(TIER_GRANT[tier].start),
                  daily: String(TIER_GRANT[tier].daily),
                })}
              </Text>
            </View>
            {busy === tier ? <ActivityIndicator color={colors.violetSoft} /> : null}
          </Pressable>
        ))}

        {!purchaseAvailable() && <Text style={styles.unavailable}>{t('tickets.unavailable')}</Text>}
        <Text style={styles.note}>{t('tickets.note')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xl },
  balanceCard: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  balanceLabel: { ...typography.caption, color: colors.textSecondary },
  balanceValue: { ...typography.h1, color: colors.gold },
  balanceNote: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs ?? 4 },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  tierCurrent: { borderWidth: 1, borderColor: colors.violetSoft },
  tierText: { flexShrink: 1 },
  tierName: { ...typography.body, color: colors.textPrimary, fontWeight: '600' },
  tierGrant: { ...typography.caption, color: colors.textSecondary },
  unavailable: { ...typography.caption, color: colors.gold, marginTop: spacing.md },
  note: { ...typography.caption, color: colors.textMuted, marginTop: spacing.lg },
});
