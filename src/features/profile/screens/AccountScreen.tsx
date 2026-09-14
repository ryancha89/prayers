import React, { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { useAuthStore, signedOut } from '../../auth/store/authStore';
import { deleteAccount, forgetLocalData } from '../../auth/api/deleteAccount';

/**
 * The account screen, and the one thing on it that is not optional.
 *
 * App Store Guideline 5.1.1(v): an app that supports account creation must let the account be
 * deleted FROM INSIDE THE APP. A link to a support page does not satisfy it, and neither does
 * signing out. This app grew an account today; this is the other half of that change.
 *
 * Deletion asks twice — the system alert is the second ask — because it is immediate and permanent
 * and takes the person's tickets with it. Signing out asks once: it costs nothing.
 */
export const AccountScreen: React.FC = () => {
  const t = useT();
  const provider = useAuthStore(s => s.provider);
  const displayName = useAuthStore(s => s.displayName);
  const userAuth = useAuthStore(s => s.userAuth);
  const [busy, setBusy] = useState(false);

  const signOut = () => {
    // Sign-out leaves the SERVER account alone but must still clear this device: the next person to
    // sign in on the same phone would otherwise open the app on someone else's saved people.
    forgetLocalData().finally(() => signedOut());
  };

  const confirmDelete = () => {
    Alert.alert(t('account.delete'), t('account.deleteWarning'), [
      { text: t('account.cancel'), style: 'cancel' },
      {
        text: t('account.deleteConfirm'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          const ok = await deleteAccount();
          setBusy(false);
          // Only a refusal needs saying. On success the store empties, the navigator swaps to the
          // login screen underneath, and an alert would be talking to a screen that is gone.
          if (!ok) Alert.alert(t('account.deleteFailedTitle'), t('account.deleteFailedBody'));
        },
      },
    ]);
  };

  return (
    <SafeAreaView edges={['top']} style={styles.root}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>{t('my.account')}</Text>

        <View style={styles.card}>
          <Field label={t('account.signedInAs')} value={displayName || t('account.noName')} />
          <Field label={t('account.provider')} value={provider ?? '—'} />
          {/* The id, because "delete my account" is a question the operator may have to answer
              about a specific row, and the person asking needs something to quote. */}
          <Field label={t('account.identifier')} value={userAuth ?? '—'} />
        </View>

        <Pressable style={styles.row} onPress={signOut} disabled={busy}>
          <Text style={styles.rowText}>{t('account.signOut')}</Text>
        </Pressable>

        <Pressable style={[styles.row, styles.danger]} onPress={confirmDelete} disabled={busy}>
          <Text style={[styles.rowText, styles.dangerText]}>{t('account.delete')}</Text>
        </Pressable>
        <Text style={styles.note}>{t('account.deleteNote')}</Text>

        {busy && <ActivityIndicator color={colors.violetSoft} style={styles.spinner} />}
      </ScrollView>
    </SafeAreaView>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={styles.fieldValue} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.xl },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  field: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: spacing.sm },
  fieldLabel: { ...typography.body, color: colors.textSecondary },
  fieldValue: { ...typography.body, color: colors.textPrimary, flexShrink: 1, marginLeft: spacing.lg },
  row: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  rowText: { ...typography.body, color: colors.textPrimary },
  danger: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.gold },
  dangerText: { color: colors.gold },
  note: { ...typography.caption, color: colors.textMuted },
  spinner: { marginTop: spacing.lg },
});
