import React, { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { column } from '../../../shared/device/screen';
import { useT } from '../../../shared/i18n';
import { appleSignInAvailable, requestAppleIdentity } from '../providers/appleSignIn';
import { googleSignInAvailable, requestGoogleIdentity } from '../providers/googleSignIn';
import { kakaoSignInAvailable, requestKakaoIdentity } from '../providers/kakaoSignIn';
import { kakaoWebSignInAvailable, requestKakaoWebTicket } from '../providers/kakaoWebSignIn';
import {
  signInAsDeveloper,
  signInAsReviewer,
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
  signInWithKakaoTicket,
} from '../api/session';
import { ensureGameToken } from '../api/session';
import { ProviderLogo } from '../components/ProviderLogo';
import { isSignInCancelled } from '../providers/signInError';

/**
 * The first screen, and the only one that exists before there is an account.
 *
 * There is no "continue as guest". The app had one in everything but name — a `dev-` uid minted on
 * the device — and it was not a lighter way in, it was a way in that the server only accepts in
 * development, cannot survive a reinstall, and would strand any purchase on one phone. A door that
 * leads nowhere is worse than a door that asks a question.
 *
 * Kakao and Google are offered on both platforms; Apple only where the OS has it. Android has no
 * Apple, so these two are its only way in.
 *
 * The small "Sign in with email" link at the bottom is the App Store / Play review door: one
 * server-configured reviewer account (`POST /api/v1/prayers/auth/reviewer`). Players have no email
 * accounts — the link is deliberately quiet, and the store's review notes name it by its English label.
 */
export const LoginScreen: React.FC = () => {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string | null>(null);
  // Why, in a few words, under the plain line — on TestFlight too, where the plain line alone
  // told us nothing (10-17: Kakao "로그인하지 못했습니다" with no way to see which step refused).
  const [detail, setDetail] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const canSubmitEmail = email.trim().length > 0 && password.length > 0;

  const run = async (work: () => Promise<unknown>, plainError = false) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setDetail(null);
    try {
      await work();
    } catch (e) {
      // Backing out of the Kakao / Google sheet is a choice, not a failure — no red line for it.
      if (isSignInCancelled(e)) return;
      // The provider's own message is kept in dev — "cancelled" and "no capability" are different
      // problems and a single generic line hides which one just happened.
      // The reviewer form always says the plain line: a wrong password is the only story there.
      setError(__DEV__ && !plainError && e instanceof Error ? e.message : t('login.error'));
      if (!__DEV__ && !plainError) setDetail(e instanceof Error ? e.message.slice(0, 120) : String(e).slice(0, 120));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Scrolls only when it must: held sideways an SE has 375pt for all of this. */}
      <ScrollView contentContainerStyle={[styles.content, column]} bounces={false}>
      <View style={styles.block}>
        <Text style={styles.title}>{t('login.title')}</Text>
        <Text style={styles.subtitle}>{t('login.subtitle')}</Text>
      </View>

      <View style={styles.block}>
        {appleSignInAvailable() && (
          <Pressable
            testID="login-apple"
            accessibilityRole="button"
            style={[styles.button, styles.apple]}
            disabled={busy}
            onPress={() => run(async () => signInWithApple(await requestAppleIdentity()))}>
            <View style={styles.buttonRow}>
              <ProviderLogo provider="apple" />
              <Text style={styles.appleText}>{t('login.apple')}</Text>
            </View>
          </Pressable>
        )}

        {(kakaoWebSignInAvailable() || kakaoSignInAvailable()) && (
          <Pressable
            testID="login-kakao"
            accessibilityRole="button"
            style={[styles.button, styles.kakao]}
            disabled={busy}
            // iOS goes through the server (the SDK's token exchange is refused, KOE009); Android keeps the SDK.
            onPress={() => run(async () => (kakaoWebSignInAvailable()
              ? signInWithKakaoTicket(await requestKakaoWebTicket())
              : signInWithKakao(await requestKakaoIdentity())))}>
            <View style={styles.buttonRow}>
              <ProviderLogo provider="kakao" />
              <Text style={styles.kakaoText}>{t('login.kakao')}</Text>
            </View>
          </Pressable>
        )}

        {googleSignInAvailable() && (
          <Pressable
            testID="login-google"
            accessibilityRole="button"
            style={[styles.button, styles.google]}
            disabled={busy}
            onPress={() => run(async () => signInWithGoogle(await requestGoogleIdentity()))}>
            <View style={styles.buttonRow}>
              <ProviderLogo provider="google" />
              <Text style={styles.googleText}>{t('login.google')}</Text>
            </View>
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
        {error && !emailOpen && <Text testID="login-error" accessibilityRole="alert" style={styles.error}>{error}</Text>}
        {detail && !emailOpen && <Text testID="login-error-detail" style={styles.errorDetail}>{detail}</Text>}
      </View>

      <Text style={styles.note}>{t('login.note')}</Text>

      {emailOpen ? (
        <View style={styles.emailForm} testID="login-email-form">
          <TextInput
            testID="login-email-input"
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder={t('login.emailPlaceholder')}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="username"
            autoComplete="email"
            editable={!busy}
          />
          <TextInput
            testID="login-password-input"
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder={t('login.passwordPlaceholder')}
            placeholderTextColor={colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="password"
            editable={!busy}
            onSubmitEditing={() => {
              if (canSubmitEmail && !busy) run(() => signInAsReviewer(email, password), true);
            }}
          />
          <Pressable
            testID="login-email-submit"
            style={[styles.button, styles.dev, (!canSubmitEmail || busy) && styles.disabled]}
            disabled={!canSubmitEmail || busy}
            onPress={() => run(() => signInAsReviewer(email, password), true)}>
            <Text style={styles.devText}>{t('login.emailSubmit')}</Text>
          </Pressable>
          {error && (
            <Text testID="login-email-error" style={styles.error}>
              {error}
            </Text>
          )}
        </View>
      ) : (
        <Pressable
          testID="login-email-link"
          accessibilityRole="button"
          style={styles.emailLink}
          disabled={busy}
          hitSlop={8}
          onPress={() => {
            setError(null);
            setEmailOpen(true);
          }}>
          <Text style={styles.emailLinkText}>{t('login.emailLink')}</Text>
        </Pressable>
      )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl },
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
  // Logo then label, centred together (each brand guide's sign-in button layout).
  buttonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  apple: { backgroundColor: '#FFFFFF' },
  appleText: { ...typography.body, color: '#000000', fontWeight: '600' },
  // Kakao's own brand yellow and label colour (Kakao Login design guide).
  kakao: { backgroundColor: '#FEE500' },
  kakaoText: { ...typography.body, color: 'rgba(0,0,0,0.85)', fontWeight: '600' },
  google: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DADCE0' },
  googleText: { ...typography.body, color: '#1F1F1F', fontWeight: '600' },
  dev: { borderWidth: 1, borderColor: colors.violetSoft },
  devText: { ...typography.body, color: colors.violetSoft },
  spinner: { marginTop: spacing.sm },
  error: { ...typography.caption, color: colors.gold, marginTop: spacing.sm },
  errorDetail: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.xs },
  note: { ...typography.caption, color: colors.textMuted, textAlign: 'center' },
  emailLink: { alignSelf: 'center', marginTop: spacing.xl, paddingVertical: spacing.xs },
  emailLinkText: { ...typography.caption, color: colors.textMuted, textDecorationLine: 'underline' },
  emailForm: { marginTop: spacing.xl },
  input: {
    height: 48,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.textMuted,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    color: colors.textPrimary,
    ...typography.body,
  },
  disabled: { opacity: 0.5 },
});
