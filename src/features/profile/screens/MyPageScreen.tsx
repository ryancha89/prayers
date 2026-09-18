import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../../../navigation/types';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { LANGUAGES, labelFor, useLanguageStore, useT } from '../../../shared/i18n';
import { setLanguageEverywhere } from '../../settings/languageSync';
import { Icon } from '../../../shared/components/Icon';
import { PrimaryButton } from '../../../shared/components/PrimaryButton';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useFavoritesStore } from '../../counselors/store/favoritesStore';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { useSoundStore } from '../../../shared/audio/store';
import { fetchTicketBalance } from '../../counseling/api/tickets';
import { sfx } from '../../../shared/audio/sfx';
import { useAuthStore } from '../../auth/store/authStore';

/** Simple profile page mirroring the reference structure (spec §33). */
export const MyPageScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const t = useT();
  const lang = useLanguageStore(s => s.lang);
  const setLang = useLanguageStore(s => s.setLang);
  const musicEnabled = useSoundStore(s => s.musicEnabled);
  const setMusicEnabled = useSoundStore(s => s.setMusicEnabled);
  const sfxEnabled = useSoundStore(s => s.sfxEnabled);
  const setSfxEnabled = useSoundStore(s => s.setSfxEnabled);
  const [langOpen, setLangOpen] = React.useState(false);
  const savedCount = useSubjectsStore(s => s.subjects.length);
  const favCount = useFavoritesStore(s => s.ids.length);
  const sessionCount = useConversationsStore(s => s.order.length);
  const displayName = useAuthStore(s => s.displayName);

  // Read once when the page opens rather than held in a store: it changes on the server (a
  // consultation spends one, the daily allowance adds some) and a cached copy here would be the
  // number that is wrong at exactly the moment someone looks at it.
  const [tickets, setTickets] = React.useState<number | null>(null);
  React.useEffect(() => {
    const ac = new AbortController();
    fetchTicketBalance(ac.signal).then(b => setTickets(b?.tickets ?? null));
    return () => ac.abort();
  }, []);

  return (
    <SafeAreaView edges={['top']} style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.header}>{t('my.title')}</Text>

        <View style={styles.profile}>
          <View style={styles.avatar}>
            <Icon name="person" size={30} />
          </View>
          {/* The account's own name. Was hard-coded to "Jeongmin", which shipped a stranger's
              name to every player; there is a real one to show now. */}
          <Text style={styles.name}>{displayName || t('account.noName')}</Text>
        </View>

        <View style={styles.statsRow}>
          <Stat label={t('my.savedPeople')} value={savedCount} />
          <Stat label={t('my.sessions')} value={sessionCount} />
          <Stat label={t('my.favorites')} value={favCount} />
        </View>

        {/* The REAL balance. This block used to read `mockWallet.balance` — a constant 120 in a
            file, shown to every player, in a currency nothing spends and nothing sells. It is the
            question-ticket count the consultation gate actually reads, and the button beside it
            now goes to the only place that can change it. */}
        <View style={styles.credits}>
          <View>
            <Text style={styles.creditsLabel}>{t('tickets.balance')}</Text>
            <Text style={styles.creditsValue}>{tickets ?? '—'}</Text>
          </View>
          <View style={styles.creditsActions}>
            <PrimaryButton
              label={t('my.recharge')}
              onPress={() => navigation.navigate('Tickets')}
              style={styles.creditBtn}
            />
          </View>
        </View>

        <Section title={t('my.library')}>
          <Row
            label={t('addSubject.myProfile')}
            onPress={() => navigation.navigate('AddSubject', { subjectId: 'self' })}
          />
          <Row label={t('my.savedPeople')} />
          <Row label={t('my.favoriteCounselors')} />
          {/* The conversations tab, which now reads the account rather than this phone — so the
              row is a real destination whichever device they signed in on. */}
          <Row
            label={t('my.counselingHistory')}
            onPress={() => navigation.navigate('Tabs', { screen: 'Conversations' })}
          />
        </Section>

        <Section title={t('my.settings')}>
          {/* Language. Six of them now, so tapping expands a list rather than cycling: with a
              cycle, reaching the language you want can mean tapping past five you cannot read. */}
          <Row
            label={t('my.language')}
            value={labelFor(lang)}
            expanded={langOpen}
            onPress={() => setLangOpen(o => !o)}
          />
          {langOpen && (
            <View style={styles.optionGroup}>
              {LANGUAGES.map(option => (
                <OptionRow
                  key={option.code}
                  // Each language is written in itself — someone looking for 日本語 is not helped
                  // by the word "Japanese" in a script they do not read.
                  label={option.label}
                  selected={option.code === lang}
                  onPress={() => {
                    // Not `setLang` on its own: the language belongs to the ACCOUNT since 16-09, so
                    // the choice is applied here and written up in the same breath. Local first —
                    // the screen turns over on the tap, not on the round trip.
                    setLanguageEverywhere(option.code);
                    setLangOpen(false);
                  }}
                />
              ))}
            </View>
          )}
          {/* Background music. A switch, not a link: there is one thing to decide and it takes
              effect where you are standing, so sending it to a sub-screen would be three taps to
              answer a yes/no. The music already obeys the hardware silent switch — this is for the
              player who wants the phone audible and the app quiet. */}
          <ToggleRow
            label={t('my.music')}
            value={musicEnabled}
            onValueChange={setMusicEnabled}
          />
          {/* Its own switch, not folded into the music one: people turn music off to listen to
              something else while they read, and a tap that still clicks is feedback, not noise. */}
          <ToggleRow
            label={t('my.sfx')}
            value={sfxEnabled}
            onValueChange={setSfxEnabled}
          />
          {/* These four were labels with no `onPress` — visible promises of screens that did not
              exist. Account and the two documents are required for submission (5.1.1(v) wants the
              deletion inside Account); notifications stays inert until there are notifications to
              settle, and says so by not looking tappable. */}
          <Row label={t('my.account')} onPress={() => navigation.navigate('Account')} />
          <Row label={t('my.notifications')} />
          <Row
            label={t('my.terms')}
            onPress={() => navigation.navigate('Legal', { doc: 'terms' })}
          />
          <Row
            label={t('my.privacy')}
            onPress={() => navigation.navigate('Legal', { doc: 'privacy' })}
          />
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

/**
 * A settings row. `expanded` turns the chevron from "this goes somewhere" into "this opens below",
 * which is the whole difference between a link and a disclosure — and the reason the language list
 * read as four more settings pages instead of six choices.
 */
/**
 * A settings row whose whole answer is a switch. Distinct from `Row` on purpose: a Row promises
 * that tapping it goes somewhere, and this one promises that tapping changes something here.
 */
const ToggleRow: React.FC<{
  label: string;
  value: boolean;
  onValueChange: (v: boolean) => void;
}> = ({ label, value, onValueChange }) => (
  <View style={styles.settingRow}>
    <Text style={styles.settingLabel}>{label}</Text>
    <Switch
      value={value}
      onValueChange={onValueChange}
      // The track reads as the app's own, not as the platform's default green.
      trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.violet }}
      thumbColor={colors.textPrimary}
      ios_backgroundColor="rgba(255,255,255,0.18)"
    />
  </View>
);

const Row: React.FC<{
  label: string;
  value?: string;
  onPress?: () => void;
  expanded?: boolean;
}> = ({ label, value, onPress, expanded }) => (
  <Pressable
    style={({ pressed }) => [styles.settingRow, pressed && onPress ? styles.settingRowPressed : null]}
    onPress={
      onPress
        ? () => {
            sfx.tap();
            onPress();
          }
        : undefined
    }
    disabled={!onPress}>
    <Text style={styles.settingLabel}>{label}</Text>
    <View style={styles.settingRight}>
      {!!value && <Text style={styles.settingValue}>{value}</Text>}
      <Icon
        name="back"
        size={22}
        color={colors.textMuted}
        style={expanded ? styles.chevronOpen : styles.chevron}
      />
    </View>
  </Pressable>
);

/**
 * One choice inside an expanded row — NOT a settings row.
 *
 * Indented, on its own recessed surface, with a rule down the left, and no chevron: a chevron here
 * promises another screen that never comes. The selected one is the only coloured thing in the
 * group, so which is active reads before any label does.
 */
const OptionRow: React.FC<{ label: string; selected: boolean; onPress: () => void }> = ({
  label,
  selected,
  onPress,
}) => (
  <Pressable
    style={({ pressed }) => [styles.optionRow, pressed ? styles.settingRowPressed : null]}
    onPress={onPress}
    accessibilityRole="radio"
    accessibilityState={{ selected }}>
    <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
    {selected && <Text style={styles.optionCheck}>✓</Text>}
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
  // Points down while the row is open: the list is below it, not through it.
  chevronOpen: { transform: [{ scaleX: -1 }, { rotate: '90deg' }] },

  // The nested group. Recessed a step darker than the card, inset from the left, with a rule the
  // rows hang off — three cues that say "these belong to the row above", none of which cost a
  // component the rest of the page does not already have.
  optionGroup: {
    backgroundColor: colors.bg,
    marginLeft: spacing.lg,
    marginRight: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: radius.sm,
    borderLeftWidth: 2,
    borderLeftColor: colors.violetDim,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
    paddingVertical: spacing.sm + 2,
  },
  optionLabel: { ...typography.body, color: colors.textSecondary },
  optionLabelSelected: { color: colors.violetSoft, fontWeight: '600' },
  optionCheck: { ...typography.body, color: colors.violet, fontWeight: '700' },
});
