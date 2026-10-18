import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../shared/i18n';
import { sayGlyphs } from '../../counseling/api/sajuGlyphs';
import { chartFromFields, type Chart } from '../chart';
import { currentDecadeIndex, fetchLuck, type Luck, type LuckItem } from '../luckApi';

export type Element = 'wood' | 'fire' | 'earth' | 'metal' | 'water';

export const ELEMENTS: Element[] = ['wood', 'fire', 'earth', 'metal', 'water'];

export const ELEMENT_OF: Record<string, Element> = {
  甲: 'wood', 乙: 'wood', 丙: 'fire', 丁: 'fire', 戊: 'earth',
  己: 'earth', 庚: 'metal', 辛: 'metal', 壬: 'water', 癸: 'water',
  寅: 'wood', 卯: 'wood', 巳: 'fire', 午: 'fire', 辰: 'earth', 戌: 'earth',
  丑: 'earth', 未: 'earth', 申: 'metal', 酉: 'metal', 亥: 'water', 子: 'water',
};

export const ELEMENT_COLOR: Record<Element, string> = {
  wood: '#4ADE80',
  fire: '#F87171',
  earth: '#E9C46A',
  metal: '#D4D4DC',
  water: '#60A5FA',
};

export interface SajuPerson {
  /** `YYYY-MM-DD`. */
  birthDate: string;
  /** `HH:MM`, absent = unknown. */
  birthTime?: string;
  /** A `KOREA_PLACES` name; absent = Seoul. */
  birthPlace?: string;
  gender: 'male' | 'female';
}

/** The pillars for a person, as the panel computes them — for a caller that also shows the clock
 *  (the summer-time label next to the birth time). */
export const useSajuChart = (birthDate?: string, birthTime?: string, birthPlace?: string): Chart | null =>
  useMemo(() => (birthDate ? chartFromFields(birthDate, birthTime, birthPlace) : null), [birthDate, birthTime, birthPlace]);

/**
 * A person's saju as the app shows it: the four pillars (computed on the phone, `chart.ts`), the
 * five elements, then 대운 and 세운 from the server's 만세력, and the clock correction underneath.
 * 내 정보 shows the account holder through it; the 2027 journey shows whoever was picked to ride.
 *
 * Renders nothing when the date cannot be read. The luck rows appear once the server answers and
 * stay out if it does not.
 */
export const SajuChartPanel: React.FC<{ person: SajuPerson; /** Someone else's ("사주팔자", not "내 사주"). */ other?: boolean }> = ({
  person,
  other,
}) => {
  const t = useT();
  const lang = useLang();
  const { birthDate, birthTime, birthPlace, gender } = person;
  const chart = useSajuChart(birthDate, birthTime, birthPlace);

  // 대운·세운 come from the server (the 대운수 needs the solar-term distance).
  const [luck, setLuck] = useState<Luck | null>(null);
  useEffect(() => {
    setLuck(null);
    if (!chart) return;
    const ac = new AbortController();
    fetchLuck({ birthDate, birthTime, gender }, ac.signal).then(l => {
      if (!ac.signal.aborted) setLuck(l);
    });
    return () => ac.abort();
  }, [birthDate, birthTime, gender, chart]);

  const counts = useMemo(() => {
    const out: Record<Element, number> = { wood: 0, fire: 0, earth: 0, metal: 0, water: 0 };
    if (chart) {
      [chart.zodiacTime, chart.zodiacDay, chart.zodiacMonth, chart.zodiacYear].forEach(g =>
        g?.split('').forEach(c => ELEMENT_OF[c] && out[ELEMENT_OF[c]]++),
      );
    }
    return out;
  }, [chart]);

  if (!chart) return null;

  // Traditional order, right to left on paper: 시 일 월 년.
  const pillars = [
    { label: t('myInfo.pillar.hour'), ganji: chart.zodiacTime },
    { label: t('myInfo.pillar.day'), ganji: chart.zodiacDay },
    { label: t('myInfo.pillar.month'), ganji: chart.zodiacMonth },
    { label: t('myInfo.pillar.year'), ganji: chart.zodiacYear },
  ];
  const total = ELEMENTS.reduce((n, e) => n + counts[e], 0);
  const dayStem = chart.zodiacDay[0];
  const nowDecade = luck ? currentDecadeIndex(luck.decades, Number(birthDate.slice(0, 4))) : -1;
  const thisYear = new Date().getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');

  return (
    <>
      <Text style={styles.sectionTitle}>{t(other ? 'myInfo.chartTitleOther' : 'myInfo.chartTitle')}</Text>
      <View style={styles.card}>
        <View style={styles.pillarRow}>
          {pillars.map(p => (
            <View key={p.label} style={styles.pillar}>
              <Text style={styles.pillarLabel}>{p.label}</Text>
              {p.ganji ? (
                p.ganji.split('').map((c, i) => (
                  <Glyph key={i} char={c} lang={lang} highlight={p.ganji === chart.zodiacDay && i === 0} />
                ))
              ) : (
                <>
                  <View style={[styles.glyph, styles.glyphUnknown]}>
                    <Text style={styles.unknownMark}>?</Text>
                  </View>
                  <View style={[styles.glyph, styles.glyphUnknown]}>
                    <Text style={styles.unknownMark}>?</Text>
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
        {!!dayStem && (
          <Text style={styles.note}>
            {t('myInfo.dayMaster', {
              stem: lang === 'ja' || lang.startsWith('zh') ? dayStem : `${dayStem}(${sayGlyphs(dayStem, lang)})`,
              element: t(`myInfo.el.${ELEMENT_OF[dayStem]}` as TranslationKey),
            })}
          </Text>
        )}
      </View>

      <Text style={styles.sectionTitle}>{t('myInfo.elementsTitle')}</Text>
      <View style={styles.card}>
        {ELEMENTS.map(e => (
          <View key={e} style={styles.elRow}>
            <Text style={[styles.elLabel, { color: ELEMENT_COLOR[e] }]}>{t(`myInfo.el.${e}` as TranslationKey)}</Text>
            <View style={styles.elTrack}>
              <View
                style={[
                  styles.elFill,
                  { width: `${total ? (counts[e] / total) * 100 : 0}%`, backgroundColor: ELEMENT_COLOR[e] },
                ]}
              />
            </View>
            <Text style={styles.elCount}>{counts[e]}</Text>
          </View>
        ))}
      </View>

      {luck && luck.decades.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('myInfo.decadeTitle')}</Text>
          <LuckRow
            items={luck.decades}
            current={nowDecade}
            label={d => t('myInfo.age', { age: d.number ?? 0 })}
            nowLabel={t('myInfo.now')}
          />
        </>
      )}
      {luck && luck.years.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>{t('myInfo.yearTitle')}</Text>
          <LuckRow
            items={luck.years}
            current={luck.years.findIndex(y => y.number === thisYear)}
            label={y => String(y.number)}
            nowLabel={t('myInfo.thisYear')}
          />
        </>
      )}

      <Text style={styles.footnote}>
        {chart.timeUnknown
          ? t('myInfo.noteTimeUnknown')
          : t('myInfo.noteAdjusted', { time: `${pad(chart.adjusted!.hour)}:${pad(chart.adjusted!.minute)}` }) +
            (chart.summerTime ? ` ${t('myInfo.noteSummer')}` : '')}
      </Text>
    </>
  );
};

const Glyph: React.FC<{ char: string; lang: string; highlight: boolean }> = ({ char, lang, highlight }) => {
  const color = ELEMENT_COLOR[ELEMENT_OF[char]];
  const reading = lang === 'ja' || lang.startsWith('zh') ? null : sayGlyphs(char, lang as never);
  return (
    <View style={[styles.glyph, { borderColor: color }, highlight && { backgroundColor: `${color}26` }]}>
      <Text style={[styles.glyphChar, { color }]}>{char}</Text>
      {!!reading && <Text style={styles.glyphReading}>{reading}</Text>}
    </View>
  );
};

const LUCK_CELL = 64;

/** A horizontal strip of 간지 cells — 대운 or 세운 — scrolled so the current one is in view.
 *  Laid out the way a 만세력 writes them, like the pillars above: right to left, so the later
 *  대운/year sits on the left. `items` and `current` come in time order. */
const LuckRow: React.FC<{
  items: LuckItem[];
  current: number;
  label: (item: LuckItem) => string;
  nowLabel: string;
}> = ({ items: inOrder, current: currentInOrder, label, nowLabel }) => {
  const items = [...inOrder].reverse();
  const current = currentInOrder < 0 ? -1 : items.length - 1 - currentInOrder;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.luckRow}
      contentOffset={{ x: Math.max(0, (current - 1) * (LUCK_CELL + spacing.sm)), y: 0 }}>
      {items.map((it, i) => {
        const now = i === current;
        return (
          <View key={`${it.luck}-${it.number}`} style={[styles.luckCell, now && styles.luckCellNow]}>
            <Text style={[styles.luckLabel, now && styles.luckLabelNow]}>{now ? nowLabel : label(it)}</Text>
            {it.luck.split('').map((c, k) => (
              <Text key={k} style={[styles.luckChar, { color: ELEMENT_COLOR[ELEMENT_OF[c]] ?? colors.textPrimary }]}>
                {c}
              </Text>
            ))}
            <Text style={styles.luckProp} numberOfLines={1}>
              {it.skyProp}
            </Text>
            <Text style={styles.luckProp} numberOfLines={1}>
              {it.earthProp}
            </Text>
            {now && <Text style={styles.luckSub}>{label(it)}</Text>}
          </View>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg },
  sectionTitle: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xl, marginBottom: spacing.sm },
  pillarRow: { flexDirection: 'row', gap: spacing.sm },
  pillar: { flex: 1, alignItems: 'center', gap: spacing.sm },
  pillarLabel: { ...typography.tiny, color: colors.textMuted },
  glyph: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyphUnknown: { borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed' },
  glyphChar: { fontSize: 28, fontWeight: '700' },
  glyphReading: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  unknownMark: { ...typography.h2, color: colors.textMuted },
  note: { ...typography.caption, color: colors.textSecondary, marginTop: spacing.lg, textAlign: 'center' },
  elRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: 6 },
  elLabel: { ...typography.bodyStrong, width: 44 },
  elTrack: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden' },
  elFill: { height: '100%', borderRadius: 4 },
  elCount: { ...typography.bodyStrong, color: colors.textPrimary, width: 20, textAlign: 'right' },
  footnote: { ...typography.tiny, color: colors.textMuted, marginTop: spacing.lg, lineHeight: 16 },
  luckRow: { gap: spacing.sm, paddingRight: spacing.lg },
  luckCell: {
    width: LUCK_CELL,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  luckCellNow: { borderColor: colors.violetSoft, backgroundColor: 'rgba(167,139,250,0.12)' },
  luckLabel: { ...typography.tiny, color: colors.textMuted, marginBottom: 4 },
  luckLabelNow: { color: colors.violetSoft },
  luckChar: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  luckProp: { ...typography.tiny, color: colors.textSecondary, marginTop: 2 },
  luckSub: { ...typography.tiny, color: colors.textMuted, marginTop: 2 },
});
