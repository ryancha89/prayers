import React, { useCallback, useState } from 'react';
import { AppState, Linking, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { NativeModules } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { column } from '../../../shared/device/screen';
import { applyReminder, reminderSupported, setReminderEnabled, useReminder } from '../reminder';

/** The times offered — chips, not a wheel (the Archive's rule: a picker is a survey). */
const TIMES: [number, number][] = [[8, 0], [9, 0], [12, 0], [18, 0], [21, 0], [22, 0]];
const pad = (n: number) => String(n).padStart(2, '0');

/**
 * 알림 — the profile page's Notifications row (10-17: it was a label with no onPress). One setting
 * for now: the daily check-in reminder, scheduled on the phone (reminder.ts).
 */
export const NotificationsScreen: React.FC = () => {
  const t = useT();
  const navigation = useNavigation();
  const { enabled, hour, minute, set } = useReminder();
  const [denied, setDenied] = useState(false);
  const supported = reminderSupported();

  // Coming back from iOS Settings may have changed the permission.
  const refresh = useCallback(() => {
    const mod = NativeModules.Reminder as { status(): Promise<string> } | undefined;
    mod?.status().then(s => setDenied(s === 'denied')).catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      refresh();
      const sub = AppState.addEventListener('change', s => { if (s === 'active') { refresh(); void applyReminder(); } });
      return () => sub.remove();
    }, [refresh]),
  );

  const toggle = async (on: boolean) => {
    sfx.tap();
    const now = await setReminderEnabled(on);
    if (on && !now) setDenied(true);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.root}>
      <View style={styles.header}>
        <Pressable testID="notif-back" hitSlop={12} accessibilityRole="button" onPress={() => { sfx.tap(); navigation.goBack(); }}>
          <Icon name="back" size={22} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.scroll, column]}>
        <Text style={styles.title}>{t('my.notifications')}</Text>

        {!supported ? (
          <Text style={styles.note}>{t('notif.unsupported')}</Text>
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{t('notif.checkin')}</Text>
                  <Text style={styles.rowDesc}>{t('notif.checkinDesc')}</Text>
                </View>
                <Switch
                  testID="notif-checkin-switch"
                  value={enabled && !denied}
                  onValueChange={toggle}
                  trackColor={{ true: colors.violet, false: colors.bgElevated }}
                />
              </View>

              {enabled && !denied && (
                <View style={styles.times}>
                  <Text style={styles.timesLabel}>{t('notif.time')}</Text>
                  <View style={styles.chips}>
                    {TIMES.map(([h, m]) => {
                      const on = h === hour && m === minute;
                      return (
                        <Pressable
                          key={`${h}:${m}`}
                          testID={`notif-time-${h}`}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: on }}
                          style={[styles.chip, on && styles.chipOn]}
                          onPress={() => { sfx.tap(); set({ hour: h, minute: m }); void applyReminder(); }}>
                          <Text style={[styles.chipText, on && styles.chipTextOn]}>{`${pad(h)}:${pad(m)}`}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              )}
            </View>

            {denied && (
              <View style={styles.deniedCard} testID="notif-denied">
                <Text style={styles.deniedText}>{t('notif.denied')}</Text>
                <Pressable style={styles.settingsBtn} accessibilityRole="button" onPress={() => { sfx.tap(); void Linking.openSettings(); }}>
                  <Text style={styles.settingsText}>{t('notif.openSettings')}</Text>
                </Pressable>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  scroll: { padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg },
  title: { ...typography.h1, color: colors.textPrimary },
  note: { ...typography.body, color: colors.textSecondary },
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rowText: { flex: 1, gap: spacing.xs },
  rowTitle: { ...typography.bodyStrong, color: colors.textPrimary },
  rowDesc: { ...typography.caption, color: colors.textSecondary, lineHeight: 18 },
  times: { gap: spacing.sm },
  timesLabel: { ...typography.caption, color: colors.textMuted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.bgElevated },
  chipOn: { backgroundColor: colors.violet },
  chipText: { ...typography.caption, color: colors.textSecondary },
  chipTextOn: { color: colors.textPrimary, fontWeight: '700' },
  deniedCard: { backgroundColor: colors.goldDim, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  deniedText: { ...typography.caption, color: colors.textPrimary, lineHeight: 18 },
  settingsBtn: { alignSelf: 'flex-start', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold },
  settingsText: { ...typography.caption, color: '#1A1330', fontWeight: '700' },
});
