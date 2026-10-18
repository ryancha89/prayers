import React, { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Text, TextInput } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { column } from '../../../shared/device/screen';
import { MiniPlayerSpacer } from '../../../shared/layout/miniPlayerInset';
import { sfx } from '../../../shared/audio/sfx';
import { useAuthStore } from '../../auth/store/authStore';
import { useCoins } from '../../coins/store/coinStore';
import { deleteAccount } from '../../auth/api/deleteAccount';
import { requestAppleIdentity } from '../../auth/providers/appleSignIn';
import { revokeGoogleAccess } from '../../auth/providers/googleSignIn';

/** Server reason codes (PrayersAccountDeletion::REASONS). */
const REASONS = ['rarely_use', 'missing_feature', 'unsatisfied', 'privacy', 'other_account', 'other'] as const;
type Reason = (typeof REASONS)[number];

/**
 * Account deletion, laid out the way the stores expect it.
 *
 * - Apple 5.1.1(v): deletion is IN the app, deletes the account (not a deactivation), and for a
 *   Sign in with Apple account revokes Apple's tokens — the app re-runs Apple sign-in for a fresh
 *   authorization code, the server exchanges and revokes it (Prayers::ProviderUnlink).
 * - Google Play account-deletion policy: the in-app path plus the web page
 *   (fortunetorch…/prayers/delete-account), and the user is told what is deleted and what is kept
 *   and for how long — the same wording as that page and the privacy policy (purchase records 5y).
 * - What other apps do and the stores don't forbid: an optional reason, an explicit "I understand"
 *   check before the button arms, and one last system confirm. No retention tricks, no support
 *   ticket, no waiting period: it happens now.
 */
export const DeleteAccountScreen: React.FC = () => {
  const t = useT();
  const navigation = useNavigation();
  const provider = useAuthStore(s => s.provider);
  const coins = useCoins(s => s.balance);
  const [reason, setReason] = useState<Reason | null>(null);
  const [detail, setDetail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    let appleAuthorizationCode: string | undefined;
    if (provider === 'apple') {
      try {
        const res = (await requestAppleIdentity()) as { authorizationCode?: string | null };
        appleAuthorizationCode = res.authorizationCode ?? undefined;
      } catch {
        setBusy(false);
        Alert.alert(t('deleteAccount.title'), t('deleteAccount.appleCancelled'));
        return;
      }
    }
    if (provider === 'google') await revokeGoogleAccess();

    const ok = await deleteAccount({
      reason: reason ?? undefined,
      detail: reason === 'other' ? detail.trim() || undefined : undefined,
      appleAuthorizationCode,
    });
    setBusy(false);
    // On success the store empties and the navigator swaps to Login underneath; the alert is
    // native, so it stays up over the new screen.
    if (ok) Alert.alert(t('deleteAccount.doneTitle'), t('deleteAccount.doneBody'));
    else Alert.alert(t('account.deleteFailedTitle'), t('account.deleteFailedBody'));
  };

  const confirm = () => {
    Alert.alert(t('deleteAccount.finalTitle'), t('deleteAccount.finalBody'), [
      { text: t('account.cancel'), style: 'cancel' },
      { text: t('account.deleteConfirm'), style: 'destructive', onPress: run },
    ]);
  };

  const lost: TranslationKey[] = ['deleteAccount.lost1', 'deleteAccount.lost2', 'deleteAccount.lost3', 'deleteAccount.lost4'];

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <View style={styles.header}>
        <Pressable
          testID="delete-account-back"
          hitSlop={12}
          disabled={busy}
          onPress={() => {
            sfx.tap();
            navigation.goBack();
          }}
          accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, column]} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{t('deleteAccount.title')}</Text>
        <Text style={styles.lead}>{t('deleteAccount.lead')}</Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('deleteAccount.lostTitle')}</Text>
          {lost.map(k => (
            <Bullet key={k} text={t(k)} />
          ))}
          <Bullet text={t('deleteAccount.coins', { n: coins ?? 0 })} strong />
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>{t('deleteAccount.keptTitle')}</Text>
          <Text style={styles.body}>{t('deleteAccount.kept')}</Text>
          <Text style={[styles.body, styles.gap]}>{t('deleteAccount.storeNote')}</Text>
        </View>

        <Text style={styles.section}>{t('deleteAccount.reasonTitle')}</Text>
        {REASONS.map(r => {
          const on = reason === r;
          return (
            <Pressable
              key={r}
              testID={`delete-reason-${r}`}
              style={[styles.reason, on && styles.reasonOn]}
              onPress={() => {
                sfx.tap();
                setReason(on ? null : r);
              }}>
              <View style={[styles.radio, on && styles.radioOn]} />
              <Text style={styles.reasonText}>{t(`deleteAccount.reason.${r}` as TranslationKey)}</Text>
            </Pressable>
          );
        })}
        {reason === 'other' && (
          <TextInput
            style={styles.detail}
            value={detail}
            onChangeText={setDetail}
            placeholder={t('deleteAccount.detailPlaceholder')}
            placeholderTextColor={colors.textMuted}
            maxLength={500}
            multiline
          />
        )}

        <Pressable
          testID="delete-agree"
          style={styles.agree}
          onPress={() => {
            sfx.tap();
            setAgreed(a => !a);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: agreed }}>
          <View style={[styles.box, agreed && styles.boxOn]}>{agreed && <Icon name="check" size={14} />}</View>
          <Text style={styles.agreeText}>{t('deleteAccount.agree')}</Text>
        </Pressable>

        {provider === 'apple' && <Text style={styles.note}>{t('deleteAccount.appleNote')}</Text>}

        <PrimaryButton
          label={t('deleteAccount.submit')}
          onPress={confirm}
          disabled={!agreed}
          loading={busy}
          style={styles.submit}
        />
        <MiniPlayerSpacer />
      </ScrollView>
    </SafeAreaView>
  );
};

const Bullet: React.FC<{ text: string; strong?: boolean }> = ({ text, strong }) => (
  <View style={styles.bullet}>
    <Text style={styles.dot}>•</Text>
    <Text style={[styles.body, styles.bulletText, strong && styles.strong]}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scroll: { padding: spacing.xl, paddingTop: spacing.sm },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.sm },
  lead: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.xl },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.lg },
  cardTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginBottom: spacing.sm },
  body: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
  gap: { marginTop: spacing.sm },
  bullet: { flexDirection: 'row', marginTop: 4 },
  dot: { ...typography.caption, color: colors.textMuted, width: 14 },
  bulletText: { flex: 1 },
  strong: { color: colors.gold },
  section: { ...typography.body, color: colors.textPrimary, fontWeight: '600', marginTop: spacing.md, marginBottom: spacing.sm },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.card,
    marginBottom: spacing.sm,
  },
  reasonOn: { borderColor: colors.violetSoft, backgroundColor: colors.card },
  radio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.5, borderColor: colors.textMuted, marginRight: spacing.md },
  radioOn: { borderColor: colors.violetSoft, backgroundColor: colors.violetSoft },
  reasonText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  detail: {
    ...typography.body,
    color: colors.textPrimary,
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: spacing.md,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: spacing.sm,
  },
  agree: { flexDirection: 'row', alignItems: 'flex-start', marginTop: spacing.lg },
  box: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginTop: 1,
  },
  boxOn: { borderColor: colors.gold, backgroundColor: colors.gold },
  agreeText: { ...typography.body, color: colors.textPrimary, flex: 1 },
  note: { ...typography.caption, color: colors.textMuted, marginTop: spacing.md },
  submit: { marginTop: spacing.xl },
});
