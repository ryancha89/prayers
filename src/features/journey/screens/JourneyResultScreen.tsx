import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { useSavedJourneys } from '../store/savedJourneysStore';
import { JOURNEYS } from '../data/journeys';
import { useJourneyPlayer } from '../player/journeyPlayer';
import { JourneyTrainArt } from '../components/JourneyTrainArt';
import { FortuneTicket } from '../components/FortuneTicket';
import { monthWithYear, monthsLabel, ticketMonths } from '../format';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The ticket's ISSUED date: today, as `YYYY.MM.DD`. */
const issuedToday = () => {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

/**
 * The terminus: "YOUR DESTINATION" — the year in three lines (best months, keywords, the month to
 * watch), then the passenger's own Fortune Ticket. Both can go to the 아카이브.
 */
export const JourneyResultScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const s = useJourneyPlayer();
  const self = useSubjectsStore(x => x.self);
  const addMemory = useArchiveStore(a => a.add);
  const keepJourney = useSavedJourneys(x => x.save);
  const journey = s.journeyId ? JOURNEYS[s.journeyId] : null;
  const summary = s.content?.summary;
  // Arrival = the whole year has been told in the counsellor's voice → keep the journey (content,
  // guide, tone) so the 아카이브 can open it again. Upsert, so a replay does not duplicate it.
  useEffect(() => {
    if (!journey || !s.content || !s.counselorId || !s.tone) return;
    keepJourney({ journeyId: journey.id, counselorId: s.counselorId, tone: s.tone, lang: s.lang, year: journey.year, content: s.content });
  }, [journey, s.content, s.counselorId, s.tone, s.lang, keepJourney]);
  // Kept without a tap (27-09): the summary and the ticket go to the 아카이브 the moment the train
  // arrives, like the journey itself above. Keyed on journey × guide in `details` so a replay
  // refreshes the same two rows instead of stacking copies.
  const updateMemory = useArchiveStore(a => a.update);
  useEffect(() => {
    if (!journey || !summary || !s.counselorId) return;
    const year = journey.year;
    const best = monthsLabel(summary.bestMonths, lang);
    const caution = monthsLabel(summary.cautionMonths, lang);
    const keywords = summary.keywords.join(' · ');
    const guide = getLocalizedCounselor(s.counselorId, lang);
    const keep = (kind: 'summary' | 'ticket', content: string, note: string, importance: 2 | 3) => {
      const key = `${journey.id}::${s.counselorId}::${kind}`;
      const details = { year: String(year), kind: 'travel', note, journey: key };
      const existing = useArchiveStore.getState().memories.find(m => m.details?.journey === key);
      if (existing) {
        if (existing.content !== content) updateMemory(existing.id, { content, details });
        return;
      }
      addMemory({ category: 'story', content, details, importance });
    };
    keep('summary', t('journey.archive.summary', { year, best, keywords }), `${t('journey.result.caution')}: ${caution}`, 3);
    keep(
      'ticket',
      t('journey.archive.ticket', { year, best: ticketMonths(summary.bestMonths), keywords }),
      guide ? `${guide.name} · ${issuedToday()}` : issuedToday(),
      2,
    );
  }, [journey, summary, s.counselorId, lang, t, addMemory, updateMemory]);

  if (!journey || !summary) {
    return (
      <SafeAreaView style={styles.root}>
        <Pressable style={styles.close} onPress={() => navigation.goBack()}>
          <Icon name="back" size={22} />
        </Pressable>
      </SafeAreaView>
    );
  }
  const year = journey.year;
  const guide = s.counselorId ? getLocalizedCounselor(s.counselorId, lang) : undefined;
  const best = monthsLabel(summary.bestMonths, lang);
  const caution = monthsLabel(summary.cautionMonths, lang);
  const keywords = summary.keywords.join(' · ');
  const passenger = self.displayName && self.displayName !== 'Myself' ? self.displayName : t('journey.ticket.you');
  const issued = issuedToday();

  return (
    <View style={styles.root}>
      <View style={styles.sky}>
        <JourneyTrainArt still fadeTo={colors.bg} />
      </View>
      <SafeAreaView edges={['top', 'bottom']} style={styles.flex}>
        <Pressable
          style={styles.close}
          hitSlop={12}
          onPress={() => {
            sfx.back();
            s.stop();
            navigation.goBack();
          }}
          accessibilityRole="button">
          <Icon name="back" size={22} />
        </Pressable>
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.eyebrow}>{t('journey.header', { year })}</Text>
          <Text style={styles.dest}>YOUR DESTINATION</Text>
          <Text style={styles.title}>{t('journey.result.title', { year })}</Text>

          <View style={styles.panel}>
            <Row label={t('journey.result.best')} value={best} accent />
            <Row label={t('journey.result.keywords')} value={keywords} />
            <Row label={t('journey.result.caution')} value={caution} />
            <Text style={styles.completed}>Journey Completed ✓</Text>
            <Text style={styles.kept}>{t('journey.result.kept')}</Text>
          </View>

          {(summary.months?.length ?? 0) > 0 && (
            <View style={styles.monthsPanel}>
              <Text style={styles.monthsTitle}>{t('journey.result.months')}</Text>
              {summary.months.map(m => (
                <View key={m.month} style={styles.monthRow}>
                  <View style={styles.monthHead}>
                    <Text style={styles.monthName}>{monthWithYear(year, m.month, lang)}</Text>
                    {!!m.ganji && <Text style={styles.monthGanji}>{m.ganji}</Text>}
                    <Text style={styles.monthStars}>{'★'.repeat(m.stars)}<Text style={styles.monthStarsOff}>{'★'.repeat(5 - m.stars)}</Text></Text>
                  </View>
                  <Text style={styles.monthLine}>{m.headline}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.actions}>
            <Pressable
              style={styles.primary}
              onPress={() => {
                sfx.tap();
                s.replay();
                navigation.replace('Journey');
              }}>
              <Text style={styles.primaryText}>{t('journey.result.replay')}</Text>
            </Pressable>
          </View>

          <Text style={styles.section}>{t('journey.ticket.heading', { year })}</Text>
          <FortuneTicket
            year={year}
            passenger={passenger}
            guide={guide?.name ?? ''}
            bestMonths={ticketMonths(summary.bestMonths)}
            keywords={summary.keywords.join(' / ')}
            issued={issued}
            labels={{
              title: `${year} FORTUNE JOURNEY`,
              passenger: 'PASSENGER',
              destination: 'DESTINATION',
              best: 'BEST MONTH',
              keyword: 'KEYWORD',
              guide: 'GUIDE',
              date: 'ISSUED',
            }}
          />
          <Text style={styles.ticketKept}>{t('journey.result.kept')}</Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const Row: React.FC<{ label: string; value: string; accent?: boolean }> = ({ label, value, accent }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, accent && styles.rowAccent]}>{value || '—'}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  sky: { position: 'absolute', left: 0, right: 0, top: 0, height: 360 },
  close: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  scroll: { padding: spacing.xl, paddingTop: 170, gap: spacing.md },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  dest: { ...typography.hero, color: colors.textPrimary, letterSpacing: 1 },
  title: { ...typography.body, color: colors.textSecondary, marginBottom: spacing.sm },
  panel: {
    padding: spacing.xl, borderRadius: radius.lg, gap: spacing.lg,
    backgroundColor: 'rgba(26,20,52,0.9)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  row: { gap: 4 },
  rowLabel: { ...typography.tiny, color: colors.textMuted, letterSpacing: 1 },
  rowValue: { ...typography.h2, color: colors.textPrimary },
  rowAccent: { color: colors.gold },
  completed: { ...typography.caption, color: colors.new, fontWeight: '700' },
  kept: { ...typography.tiny, color: colors.textMuted },
  monthsPanel: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  monthsTitle: { ...typography.h3, color: colors.textPrimary },
  monthRow: { gap: 2, paddingTop: spacing.sm, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthName: { ...typography.bodyStrong, color: colors.gold },
  monthGanji: { ...typography.caption, color: colors.textMuted },
  monthStars: { ...typography.caption, color: colors.gold, marginLeft: 'auto' },
  monthStarsOff: { color: 'rgba(255,255,255,0.18)' },
  monthLine: { ...typography.body, color: colors.textSecondary },
  actions: { flexDirection: 'row', gap: spacing.md },
  primary: { flex: 1, paddingVertical: spacing.md, borderRadius: radius.pill, backgroundColor: colors.gold, alignItems: 'center' },
  primaryText: { ...typography.bodyStrong, color: '#1A1330' },
  section: { ...typography.h3, color: colors.textPrimary, marginTop: spacing.xl },
  ticketKept: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },
});
