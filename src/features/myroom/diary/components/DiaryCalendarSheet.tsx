import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../../shared/components/Text';
import { Icon } from '../../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../../shared/theme';
import { useLang, useT } from '../../../../shared/i18n';
import { sfx } from '../../../../shared/audio/sfx';
import { column } from '../../../../shared/device/screen';
import { useArchiveStore } from '../../../archive/store/archiveStore';
import { diaryEntries } from '../book';
import { localDay } from '../text';
import { dayMood, entriesByDay, monthCheer, monthGrid, monthOf, monthStats, moodColor, shiftMonth } from '../stats';
import { ReflectionNote } from './DiaryBubbles';
import { MoodFace } from './MoodFace';
import { DiaryRow } from './DiaryRow';
import { SheetHead } from './SheetHead';
import { diaryStyles as s } from './diaryTheme';

/** A month's title and the weekday initials, in the app language. Calendar dates, so formatted in UTC. */
const monthTitle = (month: string, lang: string) => {
  const [y, m] = month.split('-').map(Number);
  try {
    return new Intl.DateTimeFormat(lang, { year: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(y, m - 1, 1)));
  } catch {
    return month;
  }
};
const weekdays = (lang: string) =>
  // 2026-10-04 is a Sunday.
  Array.from({ length: 7 }, (_, i) => {
    try {
      return new Intl.DateTimeFormat(lang, { weekday: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2026, 9, 4 + i)));
    } catch {
      return 'SMTWTFS'[i];
    }
  });

/**
 * Calendar (07-10 mockup, a later phase of spec 006): the month with a mood-coloured dot under every
 * day that has an entry, This Month's three counts, and a line from the counsellor of the newest
 * entry. Tapping a day lists that day's entries under the grid.
 */
export const DiaryCalendarSheet: React.FC<{ onOpen(id: string): void; onClose(): void }> = ({ onOpen, onClose }) => {
  const t = useT();
  const lang = useLang();
  const safe = useSafeAreaInsets();
  const memories = useArchiveStore(st => st.memories);
  const today = localDay();
  const [month, setMonth] = useState(monthOf(today));
  const [picked, setPicked] = useState<string | null>(today);

  const byDay = useMemo(() => entriesByDay(memories), [memories]);
  const stats = useMemo(() => monthStats(memories, month), [memories, month]);
  const cheer = monthCheer(stats);
  const cells = monthGrid(month);
  const dayRows = picked && monthOf(picked) === month ? byDay[picked] ?? [] : [];

  const move = (by: number) => { sfx.tap(); setMonth(m => shiftMonth(m, by)); setPicked(null); };

  return (
    <View style={s.root} testID="diary-calendar">
      <View style={s.sheet}>
        <SheetHead title={t('diary.calendar.title')} onClose={onClose} closeTestID="diary-calendar-close" />
        <ScrollView contentContainerStyle={[s.scroll, column, { paddingBottom: safe.bottom + spacing.xl }]}>
          <View style={styles.monthBar}>
            <Pressable testID="diary-calendar-prev" hitSlop={12} onPress={() => move(-1)} accessibilityRole="button" accessibilityLabel={t('diary.calendar.prev')}>
              <Icon name="back" size={18} color={colors.textPrimary} />
            </Pressable>
            <Text style={styles.month} testID="diary-calendar-month">{monthTitle(month, lang)}</Text>
            <Pressable testID="diary-calendar-next" hitSlop={12} onPress={() => move(1)} accessibilityRole="button" accessibilityLabel={t('diary.calendar.next')}>
              <Icon name="arrowRight" size={18} color={colors.textPrimary} />
            </Pressable>
          </View>

          <View>
            <View style={styles.week}>
              {weekdays(lang).map((w, i) => <Text key={i} style={styles.weekday}>{w}</Text>)}
            </View>
            <View style={styles.grid}>
              {cells.map((day, i) => {
                if (!day) return <View key={i} style={styles.cell} />;
                const entries = byDay[day];
                const dot = moodColor(dayMood(entries)) ?? (entries ? colors.textSecondary : undefined);
                const on = day === picked;
                const isToday = day === today;
                return (
                  <Pressable
                    key={day}
                    testID={`diary-day-${day}`}
                    style={styles.cell}
                    onPress={() => { sfx.tap(); setPicked(day); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}>
                    <View style={[styles.num, isToday && styles.today, on && styles.picked]}>
                      <Text style={[styles.numText, (on || isToday) && styles.numTextOn]}>{Number(day.slice(8))}</Text>
                    </View>
                    <View style={[styles.dot, dot ? { backgroundColor: dot } : null]} />
                  </Pressable>
                );
              })}
            </View>
          </View>

          {dayRows.length > 0 && (
            <View style={{ gap: spacing.sm }} testID="diary-calendar-day">
              {dayRows.map(m => <DiaryRow key={m.id} memory={m} onOpen={onOpen} />)}
            </View>
          )}

          <Text style={styles.heading}>{t('diary.calendar.thisMonth')}</Text>
          <View style={styles.stats}>
            <View style={styles.stat} testID="diary-stat-days">
              <Icon name="book" size={20} color={colors.violetSoft} />
              <Text style={styles.statNum}>{stats.days}</Text>
              <Text style={styles.statLabel}>{t('diary.calendar.days')}</Text>
            </View>
            <View style={styles.stat} testID="diary-stat-good">
              <MoodFace mood="great" size={22} color={moodColor('great')!} fill={`${moodColor('great')}33`} />
              <Text style={styles.statNum}>{stats.goodDays}</Text>
              <Text style={styles.statLabel}>{t('diary.calendar.goodDays')}</Text>
            </View>
            <View style={styles.stat} testID="diary-stat-tough">
              <MoodFace mood="down" size={22} color={moodColor('down')!} fill={`${moodColor('down')}33`} />
              <Text style={styles.statNum}>{stats.toughDays}</Text>
              <Text style={styles.statLabel}>{t('diary.calendar.toughDays')}</Text>
            </View>
          </View>

          <ReflectionNote title={t('diary.detail.reflection')} text={t(`diary.calendar.cheer.${cheer}`)} indent={false} testID="diary-calendar-cheer" />
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.sm },
  month: { ...typography.h3, color: colors.textPrimary },
  week: { flexDirection: 'row' },
  weekday: { ...typography.tiny, color: colors.textMuted, width: `${100 / 7}%`, textAlign: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.xs },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 5, gap: 3 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderColor: colors.violetSoft },
  picked: { backgroundColor: colors.violet },
  numText: { ...typography.caption, color: colors.textSecondary },
  numTextOn: { color: colors.textPrimary, fontWeight: '700' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  heading: { ...typography.h3, color: colors.textPrimary },
  stats: { flexDirection: 'row', gap: spacing.sm },
  stat: {
    flex: 1, padding: spacing.md, borderRadius: radius.md, gap: 2,
    backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  statNum: { ...typography.h2, color: colors.textPrimary, marginTop: spacing.xs },
  statLabel: { ...typography.tiny, color: colors.textSecondary },
});
