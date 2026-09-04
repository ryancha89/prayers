import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { LANGUAGES, labelFor, useLanguageStore, useT } from '../../../shared/i18n';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useFavoritesStore } from '../../counselors/store/favoritesStore';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { mockWallet } from '../monetization';

/** Simple profile page mirroring the reference structure (spec §33). */
export const MyPageScreen: React.FC = () => {
  const t = useT();
  const lang = useLanguageStore(s => s.lang);
  const setLang = useLanguageStore(s => s.setLang);
  const [langOpen, setLangOpen] = React.useState(false);
  const savedCount = useSubjectsStore(s => s.subjects.length);
  const favCount = useFavoritesStore(s => s.ids.length);
  const sessionCount = useConversationsStore(s => s.order.length);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>{t('my.title')}</Text>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Icon name="person" size={30} />
          </View>
          <Text style={styles.name}>Jeongmin</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label={t('my.savedPeople')} value={savedCount} />
          <Stat label={t('my.sessions')} value={sessionCount} />
          <Stat label={t('my.favorites')} value={favCount} />
        </View>

        {/* Credits — placeholder only (spec §34) */}
        <View style={styles.credits}>
          <View>
            <Text style={styles.creditsLabel}>{t('my.credits')}</Text>
            <Text style={styles.creditsValue}>{mockWallet.balance}</Text>
          </View>
          <View style={styles.creditsActions}>
            <PrimaryButton label={t('my.history')} tone="ghost" onPress={() => {}} style={styles.creditBtn} />
            <PrimaryButton label={t('my.recharge')} onPress={() => {}} style={styles.creditBtn} />
          </View>
        </View>

        <Section title={t('my.library')}>
          <Row label={t('my.savedPeople')} />
          <Row label={t('my.favoriteCounselors')} />
          <Row label={t('my.counselingHistory')} />
        </Section>

        <Section title={t('my.settings')}>
          {/* Language. Six of them now, so tapping expands a list rather than cycling: with a
              cycle, reaching the language you want can mean tapping past five you cannot read. */}
          <Row
            label={t('my.language')}
            value={labelFor(lang)}
            onPress={() => setLangOpen(o => !o)}
          />
          {langOpen &&
            LANGUAGES.map(option => (
              <Row
                key={option.code}
                // Each language is written in itself — someone looking for 日本語 is not helped by
                // the word "Japanese" in a script they do not read.
                label={option.label}
                value={option.code === lang ? '✓' : undefined}
                onPress={() => {
                  setLang(option.code);
                  setLangOpen(false);
                }}
              />
            ))}
          <Row label={t('my.account')} />
          <Row label={t('my.notifications')} />
          <Row label={t('my.terms')} />
          <Row label={t('my.privacy')} />
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
};

const Stat: React.FC<{ label: string; value: number }> = ({ label, value }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={styles.section}>
    <Text style={styles.sectionTitle}>{title}</Text>
    <View style={styles.sectionCard}>{children}</View>
  </View>
);

const Row: React.FC<{ label: string; value?: string; onPress?: () => void }> = ({
  label,
  value,
  onPress,
}) => (
  <Pressable
    style={({ pressed }) => [styles.settingRow, pressed && onPress ? styles.settingRowPressed : null]}
    onPress={onPress}
    disabled={!onPress}>
    <Text style={styles.settingLabel}>{label}</Text>
    <View style={styles.settingRight}>
      {!!value && <Text style={styles.settingValue}>{value}</Text>}
      <Icon name="back" size={22} color={colors.textMuted} style={styles.chevron} />
    </View>
  </Pressable>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingBottom: spacing.xxl },
  header: { ...typography.hero, color: colors.textPrimary, paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  profile: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { ...typography.h1, color: colors.textPrimary },
  statsRow: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
  },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  statValue: { ...typography.h1, color: colors.violetSoft },
  statLabel: { ...typography.tiny, color: colors.textMuted },
  credits: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: spacing.lg,
    padding: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.goldDim,
  },
  creditsLabel: { ...typography.caption, color: colors.gold },
  creditsValue: { ...typography.hero, color: colors.textPrimary },
  creditsActions: { flexDirection: 'row', gap: spacing.sm },
  creditBtn: { height: 44, paddingHorizontal: spacing.lg },
  section: { marginTop: spacing.lg, paddingHorizontal: spacing.lg },
  sectionTitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
  sectionCard: { backgroundColor: colors.card, borderRadius: radius.lg, overflow: 'hidden' },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  settingRowPressed: { backgroundColor: colors.cardPressed },
  settingLabel: { ...typography.body, color: colors.textPrimary },
  settingRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  settingValue: { ...typography.body, color: colors.violetSoft },
  chevron: { transform: [{ scaleX: -1 }] },
});
