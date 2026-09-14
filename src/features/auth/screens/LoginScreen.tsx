import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { appleSignInAvailable, requestAppleIdentity } from '../providers/appleSignIn';
import { signInAsDeveloper, signInWithApple } from '../api/session';
import { ensureGameToken } from '../api/session';

/**
 * The first screen, and the only one that exists before there is an account.
 *
 * There is no "continue as guest". The app had one in everything but name — a `dev-` uid minted on
 * the device — and it was not a lighter way in, it was a way in that the server only accepts in
 * development, cannot survive a reinstall, and would strand any purchase on one phone. A door that
 * leads nowhere is worse than a door that asks a question.
 *
 * Google is not offered yet: its button needs a client id this project does not have. Showing a
 * button that always fails would teach the player that sign-in is broken.
 */
export const LoginScreen: React.FC = () => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (e) {
      // The provider's own message is kept in dev — "cancelled" and "no capability" are different
      // problems and a single generic line hides which one just happened.
      setError(__DEV__ && e instanceof Error ? e.message : t('login.error'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.block}>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>

      <View style={styles.block}>
        {appleSignInAvailable() && (
          <Pressable
            style={[styles.button, styles.apple]}
            disabled={busy}
            onPress={() => run(async () => signInWithApple(await requestAppleIdentity()))}>
            <Text style={styles.appleText}>{t('login.apple')}</Text>
          </Pressable>
        )}

        {__DEV__ && (
          <Pressable
            style={[styles.button, styles.dev]}
            disabled={busy}
            onPress={() =>
              run(async () => {
                signInAsDeveloper();
                await ensureGameToken();
              })
            }>
            <Text style={styles.devText}>{t('login.dev')}</Text>
          </Pressable>
        )}

        {busy && <ActivityIndicator color={colors.violetSoft} style={styles.spinner} />}
        {error && <Text style={styles.error}>{error}</Text>}
      </View>

      <Text style={styles.note}>{t('login.note')}</Text>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xl },
  block: { marginBottom: spacing.xl },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.sm },
  subtitle: { ...typography.body, color: colors.textSecondary },
  button: {
    height: 52,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  apple: { backgroundColor: '#FFFFFF' },
  appleText: { ...typography.body, color: '#000000', fontWeight: '600' },
  dev: { borderWidth: 1, borderColor: colors.violetSoft },
  devText: { ...typography.body, color: colors.violetSoft },
  spinner: { marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.gold, marginTop: spacing.sm },
  note: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
});
