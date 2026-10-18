import React from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { useAuthStore, signedOut } from '../../auth/store/authStore';
import { forgetLocalData } from '../../auth/api/deleteAccount';
import { column } from '../../../shared/device/screen';
import { MiniPlayerSpacer } from '../../../shared/layout/miniPlayerInset';
import { useNavigation } from '@react-navigation/native';
import { Icon } from '../../../shared/components/Icon';
import { sfx } from '../../../shared/audio/sfx';

/**
 * The account screen, and the one thing on it that is not optional.
 *
 * App Store Guideline 5.1.1(v): an app that supports account creation must let the account be
 * deleted FROM INSIDE THE APP. A link to a support page does not satisfy it, and neither does
 * signing out. This app grew an account today; this is the other half of that change.
 *
 * Deletion opens DeleteAccountScreen (what is deleted / kept, reason, agree, final confirm) because
 * it is immediate and permanent and takes the person's coins with it. Signing out costs nothing.
 */
export const AccountScreen: React.FC = () => {
  const t = useT();
  const provider = useAuthStore(s => s.provider);
  const displayName = useAuthStore(s => s.displayName);
  const userAuth = useAuthStore(s => s.userAuth);
  const navigation = useNavigation();

  const signOut = () => {
    // Sign-out leaves the SERVER account alone but must still clear this device: the next person to
    // sign in on the same phone would otherwise open the app on someone else's saved people.
    forgetLocalData().finally(() => signedOut());
  };

  // Deletion has its own screen (what goes, what is kept, a reason, an explicit agree) — the
  // shape App Store 5.1.1(v) and Play's deletion policy expect. See DeleteAccountScreen.
  const confirmDelete = () => {
    sfx.tap();
    navigation.navigate('DeleteAccount' as never);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      {/* The stack has no header (headerShown: false), so the way back is drawn here. */}
      <View style={styles.header}>
        <Pressable
          testID="account-back"
          hitSlop={12}
          onPress={() => {
            sfx.tap();
            navigation.goBack();
          }}
          accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, column]}>
        <Text style={styles.title}>{t('my.account')}</Text>

        <View style={styles.card}>
          <Field label={t('account.signedInAs')} value={displayName || t('account.noName')} />
          <Field label={t('account.provider')} value={provider ?? '—'} />
          {/* The id, because "delete my account" is a question the operator may have to answer
              about a specific row, and the person asking needs something to quote. */}
          <Field label={t('account.identifier')} value={userAuth ?? '—'} />
        </View>

        <Pressable style={styles.row} onPress={signOut}>
          <Text style={styles.rowText}>{t('account.signOut')}</Text>
        </Pressable>

        <Pressable style={[styles.row, styles.danger]} onPress={confirmDelete}>
          <Text style={[styles.rowText, styles.dangerText]}>{t('account.delete')}</Text>
        </Pressable>
        <Text style={styles.note}>{t('account.deleteNote')}</Text>

        <MiniPlayerSpacer />
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
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingTop: spacing.sm },
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
});
