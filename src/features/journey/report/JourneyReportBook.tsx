import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useT, type Lang, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { monthLabel, monthWithYear } from '../format';
import type { JourneyReport, ReportArea, ReportBlock, ReportSection } from '../types';
import type { ReportState } from './useJourneyReport';

const AREAS: ReportArea[] = ['career', 'wealth', 'love', 'health'];

interface Props {
  year: number;
  lang: Lang;
  guideName: string;
  /** Coins one moment costs; hidden when unknown. */
  price: number | null;
  state: ReportState;
}

/**
 * The year, written out — the long report the guide hands over at the end of the line. Sections in
 * reading order: the year's first look, its direction, the five stations, then the four quarters
 * with each month's four areas. A paid block shows its label and teaser and opens in place with the
 * same coins the train asks for.
 */
export const JourneyReportBook: React.FC<Props> = ({ year, lang, guideName, price, state }) => {
  const t = useT();
  const { report, failed } = state;

  if (!report) {
    return (
      <View style={styles.book}>
        <Header year={year} guideName={guideName} />
        {failed ? (
          <Pressable style={styles.retry} onPress={state.retry} accessibilityRole="button">
            <Text style={styles.muted}>{t('journey.report.failed')}</Text>
            <Text style={styles.retryText}>{t('journey.retry')}</Text>
          </Pressable>
        ) : (
          <Writing report={null} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.book}>
      <Header year={year} guideName={guideName} />
      {report.status !== 'ready' && <Writing report={report} />}
      {report.sections.map((sec, i) => (
        <Section key={sec.id} n={i + 1} sec={sec} year={year} lang={lang} price={price} state={state} />
      ))}
    </View>
  );
};

const Header: React.FC<{ year: number; guideName: string }> = ({ year, guideName }) => {
  const t = useT();
  return (
    <View style={styles.header}>
      <Text style={styles.eyebrow}>{t('journey.report.eyebrow', { year })}</Text>
      <Text style={styles.title}>{t('journey.report.title', { year })}</Text>
      {!!guideName && <Text style={styles.byline}>{t('journey.report.byline', { name: guideName })}</Text>}
    </View>
  );
};

const Writing: React.FC<{ report: JourneyReport | null }> = ({ report }) => {
  const t = useT();
  const done = report?.progress.done ?? 0;
  const total = report?.progress.total || 11;
  return (
    <View style={styles.writing}>
      <ActivityIndicator color={colors.gold} size="small" />
      <View style={styles.flex}>
        <Text style={styles.writingText}>{t('journey.report.writing', { done, total })}</Text>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${Math.max(6, (done / total) * 100)}%` }]} />
        </View>
      </View>
    </View>
  );
};

function sectionTitle(t: ReturnType<typeof useT>, sec: ReportSection, year: number, lang: Lang): string {
  if (sec.kind === 'quarter' && sec.months?.length) {
    return `${monthLabel(sec.months[0], lang)} – ${monthLabel(sec.months[sec.months.length - 1], lang)}`;
  }
  if (sec.id === 'overview' || sec.id === 'direction') return t(`journey.report.sec.${sec.id}` as TranslationKey, { year });
  return t(`journey.sub.${sec.id}` as TranslationKey);
}

const Section: React.FC<{ n: number; sec: ReportSection; year: number; lang: Lang; price: number | null; state: ReportState }> = ({
  n, sec, year, lang, price, state,
}) => {
  const t = useT();
  return (
    <View style={styles.section}>
      <Text style={styles.chapter}>{`CHAPTER ${String(n).padStart(2, '0')}`}</Text>
      <View style={styles.titleRow}>
        <Text style={styles.sectionTitle}>{sectionTitle(t, sec, year, lang)}</Text>
        {sec.stars != null && sec.stars > 0 && <Stars n={sec.stars} />}
      </View>
      {!!sec.headline && <Text style={styles.headline}>{sec.headline}</Text>}
      {!!sec.keyMonths?.length && (
        <Text style={styles.keyMonths}>{t('journey.report.keyMonths', { months: sec.keyMonths.map(m => monthLabel(m, lang)).join(' · ') })}</Text>
      )}
      {sec.blocks.map((b, i) => (
        <Block key={`${sec.id}-${i}`} block={b} price={price} state={state} />
      ))}
      {sec.details?.map(d => (
        <View key={d.month} style={styles.month}>
          <View style={styles.monthHead}>
            <Text style={styles.monthName}>{monthWithYear(year, d.month, lang)}</Text>
            {!!d.ganji && <Text style={styles.monthGanji}>{d.ganji}</Text>}
            <Stars n={d.stars} />
          </View>
          {!!d.headline && <Text style={styles.monthLine}>{d.headline}</Text>}
          {d.areas &&
            AREAS.filter(a => d.areas?.[a]).map(a => (
              <View key={a} style={styles.area}>
                <Text style={styles.areaName}>{t(`journey.report.area.${a}` as TranslationKey)}</Text>
                <Text style={styles.areaText}>{d.areas?.[a]}</Text>
              </View>
            ))}
        </View>
      ))}
    </View>
  );
};

const Block: React.FC<{ block: ReportBlock; price: number | null; state: ReportState }> = ({ block, price, state }) => {
  const t = useT();
  if (block.unlocked) {
    return (
      <>
        {(block.paragraphs ?? []).map((p, i) => (
          <Text key={i} style={styles.paragraph}>{p}</Text>
        ))}
      </>
    );
  }
  const busy = state.unlocking === block.momentId;
  const failed = !busy && state.unlockError?.momentId === block.momentId ? state.unlockError.reason : null;
  return (
    <View style={styles.locked}>
      <View style={styles.lockedHead}>
        <Icon name="lock" size={14} />
        {!!block.label && <Text style={styles.lockedLabel}>{block.label}</Text>}
      </View>
      {!!block.teaser && <Text style={styles.teaser}>{block.teaser}</Text>}
      <Pressable
        style={[styles.unlock, busy && styles.unlockBusy]}
        disabled={!!state.unlocking}
        onPress={() => {
          if (!block.momentId) return;
          sfx.tap();
          state.unlock(block.momentId);
        }}
        accessibilityRole="button">
        {busy ? (
          <ActivityIndicator color="#1A1330" size="small" />
        ) : (
          <Text style={styles.unlockText}>
            {price != null ? t('journey.report.unlock', { price }) : t('journey.moment.unlock')}
          </Text>
        )}
      </Pressable>
      {!!failed && (
        <Text style={styles.error}>{failed === 'insufficient' ? t('journey.report.noCoins') : t('journey.moment.failed')}</Text>
      )}
    </View>
  );
};

const Stars: React.FC<{ n: number }> = ({ n }) => {
  const k = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <Text style={styles.stars}>
      {'★'.repeat(k)}
      <Text style={styles.starsOff}>{'★'.repeat(5 - k)}</Text>
    </Text>
  );
};

const styles = StyleSheet.create({
  flex: { flex: 1 },
  book: { gap: spacing.lg, marginTop: spacing.lg },
  header: { gap: 4 },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 3 },
  title: { ...typography.h1, color: colors.textPrimary },
  byline: { ...typography.caption, color: colors.textMuted },
  writing: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg,
    borderRadius: radius.lg, backgroundColor: 'rgba(232,197,106,0.08)', borderWidth: 1, borderColor: 'rgba(232,197,106,0.25)',
  },
  writingText: { ...typography.caption, color: colors.textSecondary },
  bar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.1)', marginTop: 6, overflow: 'hidden' },
  barFill: { height: 3, backgroundColor: colors.gold },
  retry: { padding: spacing.lg, alignItems: 'center', gap: spacing.xs },
  retryText: { ...typography.bodyStrong, color: colors.gold },
  muted: { ...typography.caption, color: colors.textMuted },
  section: {
    padding: spacing.xl, borderRadius: radius.lg, gap: spacing.md,
    backgroundColor: 'rgba(255,255,255,0.04)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  chapter: { ...typography.tiny, color: colors.textMuted, letterSpacing: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  sectionTitle: { ...typography.h2, color: colors.textPrimary, flexShrink: 1 },
  headline: { ...typography.bodyStrong, color: colors.gold, lineHeight: 22 },
  keyMonths: { ...typography.caption, color: colors.textMuted },
  paragraph: { ...typography.body, color: colors.textSecondary, lineHeight: 25 },
  locked: {
    padding: spacing.lg, borderRadius: radius.md, gap: spacing.sm,
    backgroundColor: 'rgba(26,20,52,0.9)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.3)',
  },
  lockedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  lockedLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  teaser: { ...typography.body, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 22 },
  unlock: {
    alignSelf: 'flex-start', paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: radius.pill, backgroundColor: colors.gold, minWidth: 120, alignItems: 'center',
  },
  unlockBusy: { opacity: 0.7 },
  unlockText: { ...typography.caption, fontWeight: '700', color: '#1A1330' },
  error: { ...typography.caption, color: '#F87171' },
  month: { gap: spacing.xs, paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.1)' },
  monthHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  monthName: { ...typography.bodyStrong, color: colors.gold },
  monthGanji: { ...typography.caption, color: colors.textMuted },
  monthLine: { ...typography.body, color: colors.textPrimary },
  area: { gap: 2, marginTop: spacing.xs },
  areaName: { ...typography.tiny, color: colors.gold, letterSpacing: 1 },
  areaText: { ...typography.body, color: colors.textSecondary, lineHeight: 23 },
  stars: { ...typography.caption, color: colors.gold, marginLeft: 'auto' },
  starsOff: { color: 'rgba(255,255,255,0.18)' },
});
