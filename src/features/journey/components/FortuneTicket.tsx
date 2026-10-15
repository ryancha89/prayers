import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';

/**
 * The 2027 Fortune Ticket — a boarding pass for the year: the main coupon (passenger, destination,
 * best months, keywords) and a torn-off stub (guide, date), with the notches and perforation a real
 * ticket has. Drawn as a view so it can later be captured to an image for sharing.
 */
export const FortuneTicket: React.FC<{
  year: number;
  passenger: string;
  guide: string;
  bestMonths: string;
  keywords: string;
  issued: string;
  labels: { title: string; passenger: string; destination: string; best: string; keyword: string; guide: string; date: string };
}> = ({ year, passenger, guide, bestMonths, keywords, issued, labels }) => (
  <View style={styles.ticket}>
    <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="tk" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#2A1F55" />
          <Stop offset="0.6" stopColor="#1A1438" />
          <Stop offset="1" stopColor="#3A2A10" />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill="url(#tk)" />
    </Svg>

    <View style={styles.main}>
      <Text style={styles.brand}>PRAYERS</Text>
      <Text style={styles.title}>{labels.title}</Text>
      <View style={styles.row}>
        <Field label={labels.passenger} value={passenger} />
        <Field label={labels.destination} value={String(year)} big />
      </View>
      <View style={styles.row}>
        <Field label={labels.best} value={bestMonths} />
      </View>
      <View style={styles.row}>
        <Field label={labels.keyword} value={keywords} />
      </View>
    </View>

    <View style={styles.perforation}>
      <View style={[styles.notch, styles.notchTop]} />
      <View style={styles.dashes}>
        {Array.from({ length: 14 }, (_, i) => (
          <View key={i} style={styles.dash} />
        ))}
      </View>
      <View style={[styles.notch, styles.notchBottom]} />
    </View>

    <View style={styles.stub}>
      <Field label={labels.guide} value={guide} />
      <Field label={labels.date} value={issued} />
      <Text style={styles.stubYear}>{year}</Text>
    </View>
  </View>
);

const Field: React.FC<{ label: string; value: string; big?: boolean }> = ({ label, value, big }) => (
  <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <Text style={[styles.value, big && styles.valueBig]} numberOfLines={2}>
      {value}
    </Text>
  </View>
);

const NOTCH = 18;

const styles = StyleSheet.create({
  ticket: {
    flexDirection: 'row',
    borderRadius: radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.55)',
    minHeight: 220,
  },
  main: { flex: 1, padding: spacing.lg, gap: spacing.md },
  brand: { ...typography.tiny, color: colors.gold, letterSpacing: 4 },
  title: { ...typography.h3, color: colors.textPrimary, letterSpacing: 1 },
  row: { flexDirection: 'row', gap: spacing.lg },
  field: { flex: 1, gap: 2 },
  label: { fontSize: 9, fontWeight: '700', letterSpacing: 1.5, color: colors.textMuted },
  value: { ...typography.bodyStrong, color: colors.textPrimary },
  valueBig: { fontSize: 26, fontWeight: '800', color: colors.gold },
  perforation: { width: NOTCH, alignItems: 'center', justifyContent: 'space-between' },
  notch: { width: NOTCH, height: NOTCH / 2, backgroundColor: colors.bg },
  notchTop: { borderBottomLeftRadius: NOTCH, borderBottomRightRadius: NOTCH },
  notchBottom: { borderTopLeftRadius: NOTCH, borderTopRightRadius: NOTCH },
  dashes: { flex: 1, justifyContent: 'space-evenly', paddingVertical: 4 },
  dash: { width: 1.5, height: 6, backgroundColor: 'rgba(233,196,106,0.5)' },
  stub: { width: 92, padding: spacing.md, gap: spacing.md, justifyContent: 'center' },
  stubYear: { fontSize: 22, fontWeight: '800', color: 'rgba(233,196,106,0.35)', transform: [{ rotate: '-90deg' }], marginTop: spacing.sm },
});
