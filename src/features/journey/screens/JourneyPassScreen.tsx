import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { buyProduct, finishPurchase, productPrice, storeAvailable } from '../../tickets/providers/purchase';
import { confirmJourneyPurchase, fetchJourneyAccess, type JourneyAccess } from '../api/journeyApi';
import { JOURNEYS } from '../data/journeys';
import { JourneyTrainArt } from '../components/JourneyTrainArt';
import { column } from '../../../shared/device/screen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Rt = RouteProp<RootStackParamList, 'JourneyPass'>;

const INCLUDES: TranslationKey[] = [
  'journey.pass.inc.stations',
  'journey.pass.inc.voice',
  'journey.pass.inc.cards',
  'journey.pass.inc.ticket',
  'journey.pass.inc.replay',
];

/**
 * The boarding pass: a paid journey is bought here, once per account (27-09: 9,900원 on iOS and
 * Android). The store takes the money; the SERVER checks the store's receipt and unlocks it — this
 * screen never decides on its own that a purchase happened.
 */
export const JourneyPassScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params } = useRoute<Rt>();
  const t = useT();
  const journey = JOURNEYS[params.journeyId];
  const [access, setAccess] = useState<JourneyAccess | null>(null);
  const [storePrice, setStorePrice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const ac = new AbortController();
    fetchJourneyAccess(params.journeyId, ac.signal).then(a => {
      if (ac.signal.aborted) return;
      setAccess(a);
      if (a?.owned) navigation.replace('JourneyCounselor', { journeyId: params.journeyId });
      else if (a?.productId) productPrice(a.productId).then(p => !ac.signal.aborted && setStorePrice(p));
    });
    return () => ac.abort();
  }, [params.journeyId, navigation]);

  if (!journey) return null;
  const price = storePrice ?? (access?.priceKrw ? t('journey.pass.krw', { price: access.priceKrw.toLocaleString('ko-KR') }) : '');
  const canBuy = storeAvailable() || !!access?.devPurchase;

  const unlocked = () => {
    sfx.select();
    navigation.replace('JourneyCounselor', { journeyId: journey.id });
  };

  const buy = async () => {
    if (busy || !access?.productId) return;
    sfx.tap();
    setBusy(true);
    try {
      if (access.devPurchase) {
        // Development only: the server refuses this anywhere else. Checked FIRST since the pod is
        // in: a simulator has the store module but no App Store to take the money.
        const r = await confirmJourneyPurchase(journey.id, { platform: 'dev' });
        if (!r.owned) throw new Error(r.error ?? 'invalid');
        unlocked();
      } else if (storeAvailable()) {
        const purchase = await buyProduct(access.productId);
        const r = await confirmJourneyPurchase(journey.id, {
          platform: purchase.platform,
          productId: purchase.productId,
          purchaseToken: purchase.purchaseToken,
          transactionId: purchase.transactionId,
        });
        if (!r.owned) throw new Error(r.error ?? 'invalid');
        await finishPurchase(purchase);
        unlocked();
      }
    } catch (e) {
      const cancelled = String((e as Error)?.message ?? '').toLowerCase().includes('cancel');
      if (!cancelled) Alert.alert(t('journey.pass.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.sky}>
        <JourneyTrainArt fadeTo={colors.bg} />
      </View>
      <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.flex}>
        <Pressable style={styles.back} hitSlop={12} onPress={() => { sfx.back(); navigation.goBack(); }} accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
        <ScrollView contentContainerStyle={[styles.scroll, column]}>
          <Text style={styles.eyebrow}>{t(journey.eyebrow)}</Text>
          <Text style={styles.title}>{t('journey.pass.title', { year: journey.year })}</Text>
          <Text style={styles.sub}>{t('journey.pass.sub', { year: journey.year })}</Text>

          <View style={styles.panel}>
            {INCLUDES.map(k => (
              <View key={k} style={styles.inc}>
                <Text style={styles.incMark}>✦</Text>
                <Text style={styles.incText}>{t(k)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.once}>{t('journey.pass.once')}</Text>
        </ScrollView>

        <View style={styles.footer}>
          {access == null ? (
            <ActivityIndicator color={colors.gold} />
          ) : (
            <Pressable style={[styles.buy, (!canBuy || busy) && styles.buyOff]} disabled={!canBuy || busy} onPress={buy} accessibilityRole="button">
              {busy ? (
                <ActivityIndicator color="#1A1330" />
              ) : (
                <Text style={styles.buyText}>
                  {canBuy ? t('journey.pass.buy', { price }) : t('journey.pass.unavailable')}
                </Text>
              )}
            </Pressable>
          )}
          {access?.devPurchase ? <Text style={styles.dev}>{t('journey.pass.dev')}</Text> : null}
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, height: 380 },
  back: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  scroll: { padding: spacing.xl, paddingTop: 170, gap: spacing.md },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  title: { ...typography.hero, color: colors.textPrimary },
  sub: { ...typography.body, color: colors.textSecondary, lineHeight: 22 },
  panel: {
    marginTop: spacing.md, padding: spacing.xl, borderRadius: radius.lg, gap: spacing.md,
    backgroundColor: 'rgba(26,20,52,0.9)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  inc: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  incMark: { color: colors.gold, fontSize: 14, marginTop: 1 },
  incText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  once: { ...typography.caption, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  footer: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.sm },
  buy: { paddingVertical: spacing.lg, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: 'center' },
  buyOff: { opacity: 0.5 },
  buyText: { ...typography.h3, color: '#1A1330' },
  dev: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },
});
