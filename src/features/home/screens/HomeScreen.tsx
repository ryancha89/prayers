import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { sfx } from '../../../shared/audio/sfx';
import { useLang, useT } from '../../../shared/i18n';
import { RootStackParamList } from '../../../navigation/types';
import { CATEGORIES, localizeCounselors } from '../../counselors/data/mockCounselors';
import { openCounselor } from '../../counselors/openCounselor';
import { CounselorGrid } from '../../counselors/components/CounselorGrid';
import { CategoryTabs } from '../../counselors/components/CategoryTabs';
import { HomeHeader } from '../../counselors/components/HomeHeader';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { syncConversationsFromServer } from '../../conversations/syncConversations';
import { fetchTicketBalance } from '../../counseling/api/tickets';
import { checkIn, fetchAttendance, type AttendanceStatus } from '../../tickets/api/attendance';
import { PRAYER_TICKET_ART } from '../../tickets/assets/art';
import { JourneyHeroCard } from '../../journey/components/JourneyHeroCard';
import { NEWYEAR_2027, journeyEntryRoute } from '../../journey/data/journeys';
import { journeyActive, useJourneyPlayer } from '../../journey/player/journeyPlayer';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const [category, setCategory] = useState<string>('recommended');
  const [tickets, setTickets] = useState<number | null>(null);
  // The daily check-in (27-09): two free tickets a day, up to ten kept. Null = not known yet, and
  // then the card is not drawn at all rather than guessing a state.
  const [attendance, setAttendance] = useState<AttendanceStatus | null>(null);
  const [attendMsg, setAttendMsg] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  // The season feature: a journey already under way resumes instead of asking for a guide again.
  const journeyRunning = useJourneyPlayer(s => journeyActive(s) && s.journeyId === NEWYEAR_2027.id);
  const order = useConversationsStore(s => s.order);
  const byId = useConversationsStore(s => s.byId);
  const roster = useMemo(() => localizeCounselors(lang), [lang]);
  const available = useMemo(
    () => roster.filter(c => c.category !== 'meditation' && !c.comingSoon),
    [roster],
  );
  const categories = CATEGORIES.filter(c =>
    c.key === 'recommended' || available.some(person => person.category === c.key),
  );
  const activeCategory = categories.some(c => c.key === category) ? category : 'recommended';
  const counselors = available.filter(c => activeCategory === 'recommended' || c.category === activeCategory);
  const recent = order.map(id => byId[id]).find(c =>
    c && Boolean(c.lastMessage || c.messages.length) && available.some(person => person.id === c.counselorId),
  );
  const recentCounselor = available.find(c => c.id === recent?.counselorId);
  const meditationGuide = roster.find(c => c.category === 'meditation');

  useFocusEffect(useCallback(() => {
    const ac = new AbortController();
    // Refresh after a consultation or purchase; an unknown balance is never displayed as zero.
    setTickets(null);
    fetchTicketBalance(ac.signal).then(balance => {
      if (!ac.signal.aborted) setTickets(balance?.tickets ?? null);
    });
    fetchAttendance(ac.signal).then(status => {
      if (!ac.signal.aborted) setAttendance(status);
    });
    void syncConversationsFromServer(lang, ac.signal);
    return () => ac.abort();
  }, [lang]));

  const onCheckIn = async () => {
    if (checking || !attendance) return;
    // Already done today: the card is the way to the calendar.
    if (attendance.checkedToday) {
      sfx.tap();
      navigation.navigate('Attendance');
      return;
    }
    sfx.select();
    setChecking(true);
    const r = await checkIn();
    setChecking(false);
    if (!r) return;
    setAttendance(a => (a ? { ...a, checkedToday: true, freeBalance: r.freeBalance, freeCap: r.freeCap } : a));
    if (r.tickets != null) setTickets(r.tickets);
    else fetchTicketBalance().then(b => setTickets(b?.tickets ?? null));
    setAttendMsg(
      r.granted > 0
        ? t('home.attend.granted', { count: r.granted })
        : r.capReached
          ? t('home.attend.full', { cap: r.freeCap })
          : t('home.attend.done'),
    );
    // "누르면 출석체크했습니다 하고 페이지 이동" — the page opens on the result and the calendar.
    navigation.navigate('Attendance', { justChecked: { granted: r.granted, capReached: r.capReached } });
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <CounselorGrid
        counselors={counselors}
        onPressCounselor={c => openCounselor(navigation, c)}
        ListHeaderComponent={
          <View>
            <HomeHeader
              balanceLabel={tickets == null ? t('tickets.title') : t('home.balance', { count: tickets })}
              onPressBalance={() => navigation.navigate('Tickets')}
            />
            {attendance && (
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: attendance.checkedToday }}
                disabled={checking}
                onPress={onCheckIn}
                style={({ pressed }) => [
                  styles.attend,
                  !attendance.checkedToday && styles.attendOpen,
                  pressed && styles.pressed,
                ]}>
                <Image
                  source={PRAYER_TICKET_ART}
                  style={[styles.attendTicket, attendance.checkedToday && styles.attendTicketDone]}
                  resizeMode="contain"
                />
                <View style={styles.cardBody}>
                  <Text style={styles.eyebrow}>{t('home.attend.title')}</Text>
                  <Text style={attendance.checkedToday ? styles.attendDone : styles.name}>
                    {attendMsg ??
                      (attendance.checkedToday
                        ? t('home.attend.done')
                        : attendance.freeBalance >= attendance.freeCap
                          ? t('home.attend.full', { cap: attendance.freeCap })
                          : t('home.attend.cta', { count: attendance.dailyTickets }))}
                  </Text>
                </View>
                <Text style={styles.attendWallet}>
                  {t('home.attend.wallet', { free: attendance.freeBalance, cap: attendance.freeCap })}
                </Text>
              </Pressable>
            )}
            {recent && recentCounselor && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${t('home.resume')} · ${recentCounselor.name}`}
                style={({ pressed }) => [styles.resume, pressed && styles.pressed]}
                onPress={() => {
                  sfx.tap();
                  navigation.navigate('UnityEntry', {
                    counselorId: recent.counselorId,
                    subjectId: recent.subjectId ?? 'self',
                    resuming: true,
                  });
                }}>
                {recentCounselor.avatarImage ? (
                  <Image source={recentCounselor.avatarImage} style={styles.avatar} />
                ) : <Icon name="chat" size={28} color={colors.violetSoft} />}
                <View style={styles.cardBody}>
                  <Text style={styles.eyebrow}>{t('home.resume')}</Text>
                  <Text style={styles.name}>{recentCounselor.name}</Text>
                  <Text style={styles.preview} numberOfLines={1}>{recent.lastTopicSummary || recent.lastMessage}</Text>
                </View>
                <Icon name="play" size={20} color={colors.violetSoft} />
              </Pressable>
            )}
            <JourneyHeroCard
              journey={NEWYEAR_2027}
              inProgress={journeyRunning}
              onPress={() => {
                sfx.select();
                if (journeyRunning) navigation.navigate('Journey');
                // A journey sold whole goes through its boarding pass; 2027 is free to board (coins
                // by the moment, 01-10) and goes straight to choosing the guide.
                else navigation.navigate(journeyEntryRoute(NEWYEAR_2027), { journeyId: NEWYEAR_2027.id });
              }}
            />
            <Text style={styles.title}>{t('home.prompt')}</Text>
            <Text style={styles.intro}>{t('home.intro')}</Text>
            <View style={styles.filters}>
              <CategoryTabs
                categories={categories.map(c => ({
                  key: c.key, label: c.key === 'recommended' ? t('home.all') : t(c.labelKey),
                }))}
                active={activeCategory}
                onChange={setCategory}
              />
            </View>
          </View>
        }
        ListFooterComponent={meditationGuide ? (
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.meditation, pressed && styles.pressed]}
            onPress={() => { sfx.tap(); navigation.navigate('MeditationRoom'); }}>
            {meditationGuide.cardImage ? (
              <Image source={meditationGuide.cardImage} style={styles.meditationPortrait} resizeMode="cover" />
            ) : <View style={styles.lotus}><Icon name="lotus" size={30} color={colors.gold} /></View>}
            <View style={styles.cardBody}>
              <Text style={styles.name}>{t('home.breathe')}</Text>
              <Text style={styles.preview}>{t('home.meditation')}</Text>
            </View>
            <Icon name="play" size={20} color={colors.gold} />
          </Pressable>
        ) : undefined}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  resume: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, marginBottom: spacing.xl,
    backgroundColor: colors.violetDim, borderRadius: radius.lg,
  },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  attend: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, marginBottom: spacing.md,
    backgroundColor: colors.card, borderRadius: radius.lg,
  },
  // Not yet checked in: gold-edged, so it reads as something to press today.
  attendOpen: { borderWidth: 1, borderColor: colors.gold },
  attendTicket: { width: 40, height: 27 },
  attendTicketDone: { opacity: 0.45 },
  attendDone: { ...typography.body, color: colors.textSecondary },
  attendWallet: { ...typography.tiny, color: colors.textMuted },
  cardBody: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typography.tiny, color: colors.violetSoft },
  name: { ...typography.h3, color: colors.textPrimary },
  preview: { ...typography.caption, color: colors.textSecondary },
  title: { ...typography.h2, color: colors.textPrimary },
  intro: { ...typography.body, color: colors.textSecondary, marginTop: spacing.sm },
  filters: { marginHorizontal: -spacing.lg, marginTop: spacing.md, marginBottom: spacing.sm },
  meditation: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.lg,
  },
  meditationPortrait: { width: 72, height: 88, borderRadius: radius.md },
  lotus: { padding: spacing.sm, borderRadius: radius.md, backgroundColor: colors.goldDim },
  pressed: { opacity: 0.7 },
});
