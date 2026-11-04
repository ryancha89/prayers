import React from 'react';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../shared/components/Text';
import { PrimaryButton } from '../../shared/components/PrimaryButton';
import { Icon } from '../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../shared/theme';
import { useLang } from '../../shared/i18n';
import { column } from '../../shared/device/screen';
import { sfx } from '../../shared/audio/sfx';
import type { RootStackParamList } from '../../navigation/types';
import { signedOut, useAuthStore } from '../auth/store/authStore';
import { forgetLocalData } from '../auth/api/deleteAccount';
import { aiConsentCopy } from './aiConsentCopy';
import { aiConsentGrantedAt, grantAiConsent, useAiConsentFor, withdrawAiConsent } from './aiConsentStore';

/**
 * "What is sent, to whom — may we?" (App Review 5.1.1(i) / 5.1.2(i)).
 *
 * Two routes, one screen:
 *   - `AiConsent` — the gate. RootNavigator shows only this (and the privacy policy) to a signed-in
 *     account that has not agreed, BEFORE the birth-details form and before any counselor, so no
 *     question, voice or chart can leave the phone first.
 *   - `AiConsentReview` — the same text from My Page, with the date agreed and a way to withdraw.
 *     Withdrawing flips the gate back on; RootNavigator's navigationKey resets the stack to it.
 */
export const AiConsentScreen: React.FC<{ review?: boolean }> = ({ review = false }) => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const lang = useLang();
  const c = aiConsentCopy(lang);
  const uid = useAuthStore(s => s.userAuth);
  const consented = useAiConsentFor(uid);

  const agree = () => {
    if (!uid) return;
    grantAiConsent(uid);
    if (review && navigation.canGoBack()) navigation.goBack();
  };

  const decline = () => {
    sfx.tap();
    Alert.alert(c.declineTitle, c.declineBody, [
      { text: c.declineBack, style: 'cancel' },
      { text: c.declineSignOut, style: 'destructive', onPress: () => { forgetLocalData().finally(() => signedOut()); } },
    ]);
  };

  const withdraw = () => {
    sfx.tap();
    Alert.alert(c.withdrawTitle, c.withdrawBody, [
      { text: c.cancel, style: 'cancel' },
      { text: c.withdrawConfirm, style: 'destructive', onPress: () => { if (uid) withdrawAiConsent(uid); } },
    ]);
  };

  const grantedAt = review && consented ? aiConsentGrantedAt(uid) : null;

  return (
    <SafeAreaView edges={['top', 'bottom', 'left', 'right']} style={styles.root}>
      {review ? (
        <View style={styles.header}>
          <Pressable
            testID="ai-consent-back"
            hitSlop={12}
            accessibilityRole="button"
            onPress={() => {
              sfx.tap();
              navigation.goBack();
            }}>
            <Icon name="back" size={22} />
          </Pressable>
        </View>
      ) : null}
      <ScrollView contentContainerStyle={[styles.scroll, column]} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>{c.title}</Text>
        <Text style={styles.intro}>{c.intro}</Text>

        <Text style={styles.heading}>{c.whatTitle}</Text>
        <View style={styles.card}>
          {c.what.map(line => (
            <Text key={line} style={styles.bullet}>{`•  ${line}`}</Text>
          ))}
          <Text style={styles.note}>{c.notSent}</Text>
        </View>

        <Text style={styles.heading}>{c.whoTitle}</Text>
        <View style={styles.card}>
          {c.who.map(w => (
            <View key={w.name} style={styles.who}>
              <Text style={styles.whoName}>{w.name}</Text>
              <Text style={styles.body}>{w.role}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.heading}>{c.whyTitle}</Text>
        {c.why.map(line => (
          <Text key={line} style={styles.body}>{line}</Text>
        ))}

        <Pressable
          testID="ai-consent-policy"
          accessibilityRole="link"
          hitSlop={8}
          onPress={() => {
            sfx.tap();
            navigation.navigate('Legal', { doc: 'privacy' });
          }}>
          <Text style={styles.link}>{c.policyLink}</Text>
        </Pressable>

        {grantedAt != null ? (
          <Text style={styles.granted}>
            {c.grantedOn.replace('{date}', new Date(grantedAt).toLocaleDateString(lang))}
          </Text>
        ) : null}
      </ScrollView>

      <View style={[styles.actions, column]}>
        {review && consented ? (
          <PrimaryButton testID="ai-consent-withdraw" label={c.withdraw} tone="ghost" onPress={withdraw} cue="none" />
        ) : (
          <>
            <PrimaryButton testID="ai-consent-agree" label={c.agree} onPress={agree} />
            {!review ? (
              <Pressable testID="ai-consent-decline" accessibilityRole="button" onPress={decline} style={styles.decline} hitSlop={8}>
                <Text style={styles.declineText}>{c.decline}</Text>
              </Pressable>
            ) : null}
          </>
        )}
      </View>
    </SafeAreaView>
  );
};

export const AiConsentReviewScreen: React.FC = () => <AiConsentScreen review />;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scroll: { padding: spacing.xl, paddingBottom: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary, marginBottom: spacing.md },
  intro: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.lg, lineHeight: 22 },
  heading: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.md, marginBottom: spacing.sm },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.sm },
  bullet: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 21 },
  note: { ...typography.caption, color: colors.gold, marginTop: spacing.xs, lineHeight: 19 },
  who: { marginBottom: spacing.md },
  whoName: { ...typography.bodyStrong, color: colors.textPrimary, marginBottom: 2 },
  body: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 21 },
  link: { ...typography.body, color: colors.violetSoft, textDecorationLine: 'underline', marginTop: spacing.sm },
  granted: { ...typography.caption, color: colors.textMuted, marginTop: spacing.lg },
  actions: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.sm },
  decline: { alignItems: 'center', paddingVertical: spacing.md },
  declineText: { ...typography.body, color: colors.textMuted },
});
