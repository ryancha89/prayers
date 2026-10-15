import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { PRAYER_TICKET_ART } from '../assets/art';
import {
  checkIn,
  fetchAttendance,
  fetchAttendanceMonth,
  localDate,
  type AttendanceMonth,
  type AttendanceStatus,
} from '../api/attendance';
import { column } from '../../../shared/device/screen';

type Rt = RouteProp<RootStackParamList, 'Attendance'>;

/** Rules, in the order a player asks about them. Each is one key per language. */
const RULES: TranslationKey[] = [
  'attend.rule.daily',
  'attend.rule.cap',
  'attend.rule.spend',
  'attend.rule.bought',
  'attend.rule.missed',
];

/**
 * The daily check-in's own page (27-09): "누르면 출석체크했습니다 하고 페이지 이동해서 달력 같은거
 * 보여주고 상세 설명도 추가".
 *
 * Reached from the home card — after a check-in just made (`justChecked`, and the page says so at
 * the top), or once today is done, to look. A player who lands here without having checked in can
 * still do it from the page.
 */
export const AttendanceScreen: React.FC = () => {
  const navigation = useNavigation();
  const { params } = useRoute<Rt>();
  const t = useT();
  const today = localDate();
  const now = new Date();

  const [status, setStatus] = useState<AttendanceStatus | null>(null);
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [month, setMonth] = useState<AttendanceMonth | null>(null);
  const [loadingMonth, setLoadingMonth] = useState(true);
  const [just, setJust] = useState(params?.justChecked ?? null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      const ac = new AbortController();
      fetchAttendance(ac.signal).then(s => !ac.signal.aborted && setStatus(s));
      return () => ac.abort();
    }, []),
  );

  useEffect(() => {
    const ac = new AbortController();
    setLoadingMonth(true);
    fetchAttendanceMonth(cursor.year, cursor.month, ac.signal).then(m => {
      if (ac.signal.aborted) return;
      setMonth(m);
      setLoadingMonth(false);
    });
    return () => ac.abort();
  }, [cursor, just]);

  const stamped = useMemo(() => new Set(month?.days.map(d => d.date) ?? []), [month]);

  const shift = (delta: number) => {
    sfx.tap();
    setCursor(c => {
      const d = new Date(c.year, c.month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });
  };
  const isCurrentMonth = cursor.year === now.getFullYear() && cursor.month === now.getMonth() + 1;

  const onCheckIn = async () => {
    if (busy || !status || status.checkedToday) return;
    sfx.select();
    setBusy(true);
    const r = await checkIn();
    setBusy(false);
    if (!r) return;
    setJust({ granted: r.granted, capReached: r.capReached });
    setStatus(s => (s ? { ...s, checkedToday: true, freeBalance: r.freeBalance, tickets: r.tickets ?? s.tickets } : s));
    setCursor({ year: now.getFullYear(), month: now.getMonth() + 1 });
  };

  // The month grid: leading blanks for the weekday the 1st falls on, then the days.
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month - 1, 1).getDay();
    const days = new Date(cursor.year, cursor.month, 0).getDate();
    const out: (number | null)[] = Array(first).fill(null);
    for (let d = 1; d <= days; d++) out.push(d);
    while (out.length % 7) out.push(null);
    return out;
  }, [cursor]);
  const iso = (d: number) =>
    `${cursor.year}-${String(cursor.month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <ScrollView contentContainerStyle={[styles.scroll, column]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => {
              sfx.back();
              navigation.goBack();
            }}
            hitSlop={12}
            accessibilityRole="button">
            <Icon name="back" size={22} />
          </Pressable>
          <Text style={styles.title}>{t('home.attend.title')}</Text>
        </View>

        {/* Just checked in: say so first — that is what the tap was for. */}
        {just && (
          <View style={styles.banner}>
            <Image source={PRAYER_TICKET_ART} style={styles.bannerTicket} resizeMode="contain" />
            <View style={styles.flex}>
              <Text style={styles.bannerTitle}>{t('attend.checked')}</Text>
              <Text style={styles.bannerBody}>
                {just.granted > 0
                  ? t('home.attend.granted', { count: just.granted })
                  : t('home.attend.full', { cap: status?.freeCap ?? 10 })}
              </Text>
            </View>
          </View>
        )}

        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{t('attend.free')}</Text>
            <Text style={styles.statusValue}>
              {status ? `${status.freeBalance} / ${status.freeCap}` : '—'}
            </Text>
          </View>
          <View style={styles.bar}>
            <View
              style={[
                styles.barFill,
                { width: `${status ? Math.min(100, (status.freeBalance / status.freeCap) * 100) : 0}%` },
              ]}
            />
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>{t('attend.total')}</Text>
            <Text style={styles.statusSmall}>{status ? t('home.balance', { count: status.tickets }) : '—'}</Text>
          </View>
          {status && !status.checkedToday && (
            <Pressable style={styles.cta} onPress={onCheckIn} disabled={busy} accessibilityRole="button">
              {busy ? (
                <ActivityIndicator color={colors.bg} />
              ) : (
                <Text style={styles.ctaText}>{t('home.attend.cta', { count: status.dailyTickets })}</Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={styles.calendar}>
          <View style={styles.calHead}>
            <Pressable onPress={() => shift(-1)} hitSlop={12} accessibilityRole="button">
              <Icon name="back" size={18} />
            </Pressable>
            <Text style={styles.calTitle}>{t('attend.month', { year: cursor.year, month: cursor.month })}</Text>
            <Pressable
              onPress={() => shift(1)}
              hitSlop={12}
              disabled={isCurrentMonth}
              style={[styles.forward, isCurrentMonth && styles.dim]}
              accessibilityRole="button">
              <Icon name="back" size={18} />
            </Pressable>
          </View>
          <View style={styles.week}>
            {(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const).map((d, i) => (
              <Text key={d} style={[styles.weekday, i === 0 && styles.sunday]}>
                {t(`attend.wd.${d}` as TranslationKey)}
              </Text>
            ))}
          </View>
          {loadingMonth ? (
            <ActivityIndicator color={colors.violetSoft} style={styles.calLoading} />
          ) : (
            <View style={styles.grid}>
              {cells.map((d, i) => {
                if (d == null) return <View key={i} style={styles.cell} />;
                const key = iso(d);
                const on = stamped.has(key);
                const isToday = key === today;
                return (
                  <View key={i} style={styles.cell}>
                    <View style={[styles.day, on && styles.dayOn, isToday && !on && styles.dayToday]}>
                      <Text style={[styles.dayText, on && styles.dayTextOn]}>{d}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
          <Text style={styles.calSummary}>
            {t('attend.summary', { days: month?.count ?? 0, tickets: month?.tickets ?? 0 })}
          </Text>
        </View>

        <Text style={styles.section}>{t('attend.rules')}</Text>
        {RULES.map(k => (
          <View key={k} style={styles.rule}>
            <Text style={styles.ruleDot}>•</Text>
            <Text style={styles.ruleText}>{t(k)}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
};

const CELL = `${100 / 7}%` as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: spacing.xl, paddingBottom: spacing.xl * 2 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary, flexShrink: 1 },
  banner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.lg, marginBottom: spacing.lg,
    backgroundColor: colors.violetDim, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.gold,
  },
  bannerTicket: { width: 48, height: 32 },
  bannerTitle: { ...typography.h3, color: colors.textPrimary },
  bannerBody: { ...typography.body, color: colors.gold },
  statusCard: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.sm, marginBottom: spacing.lg },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusLabel: { ...typography.caption, color: colors.textSecondary },
  statusValue: { ...typography.h2, color: colors.gold },
  statusSmall: { ...typography.body, color: colors.textPrimary },
  bar: { height: 8, borderRadius: 4, backgroundColor: colors.overlay, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.gold },
  cta: {
    marginTop: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.lg,
    backgroundColor: colors.gold, alignItems: 'center',
  },
  ctaText: { ...typography.h3, color: colors.bg },
  calendar: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, marginBottom: spacing.xl },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  calTitle: { ...typography.h3, color: colors.textPrimary },
  forward: { transform: [{ scaleX: -1 }] },
  dim: { opacity: 0.25 },
  week: { flexDirection: 'row' },
  weekday: { width: CELL, textAlign: 'center', ...typography.tiny, color: colors.textMuted, marginBottom: spacing.sm },
  sunday: { color: '#E07A7A' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: CELL, aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  day: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.gold },
  dayToday: { borderWidth: 1, borderColor: colors.violetSoft },
  dayText: { ...typography.caption, color: colors.textSecondary },
  dayTextOn: { color: colors.bg, fontWeight: '700' },
  calLoading: { marginVertical: spacing.xl },
  calSummary: { ...typography.caption, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
  section: { ...typography.h3, color: colors.textPrimary, marginBottom: spacing.md },
  rule: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  ruleDot: { ...typography.body, color: colors.gold },
  ruleText: { ...typography.body, color: colors.textSecondary, flex: 1 },
});
