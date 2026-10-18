import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT, type TranslationKey } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { sayGlyphs } from '../../counseling/api/sajuGlyphs';
import { useSajuChart, ELEMENT_COLOR, ELEMENT_OF } from './SajuChartPanel';
import { starSign, zodiacAnimal } from '../signs';
import { findKoreaPlace } from '../data/koreaPlaces';

/**
 * What a birth date says, shown on the birth form the moment the date is complete (10-15, user:
 * "생년월일 입력하면 자동으로 별자리랑 사주 여기에 보일수있게 하고 영어로 사주에대해 알기쉽게").
 *
 * The star sign and the zodiac animal first — the two things a player who has never heard of saju
 * already recognises — then the four pillars themselves, and a plain "What is saju?" that opens
 * under them. Everything is computed on the phone (chart.ts); the form never waits on the server.
 * A birth time typed later adds the hour pillar in place. Under the pillars: the clock the hour
 * pillar was read from — the birthplace's longitude and, inside Korea's summer-time years, the hour
 * taken off — with a 서머타임 badge when it applied (10-17).
 */
export const BirthPreview: React.FC<{ birthDate: string; birthTime?: string; birthPlace?: string }> = ({ birthDate, birthTime, birthPlace }) => {
  const t = useT();
  const lang = useLang();
  const chart = useSajuChart(birthDate, birthTime, birthPlace);
  const [explain, setExplain] = useState(false);
  if (!chart) return null;

  const [, m, d] = birthDate.split('-').map(Number);
  const sign = starSign(m, d, lang);
  const animal = zodiacAnimal(chart.zodiacYear, lang);
  const showReading = !(lang === 'ja' || lang.startsWith('zh'));
  const pillars = [
    { key: 'hour', label: t('myInfo.pillar.hour'), ganji: chart.zodiacTime },
    { key: 'day', label: t('myInfo.pillar.day'), ganji: chart.zodiacDay },
    { key: 'month', label: t('myInfo.pillar.month'), ganji: chart.zodiacMonth },
    { key: 'year', label: t('myInfo.pillar.year'), ganji: chart.zodiacYear },
  ];
  const dayStem = chart.zodiacDay[0];

  return (
    <View style={styles.card} testID="birth-preview">
      <Text style={styles.title}>{t('birthPreview.title')}</Text>

      <View style={styles.badges}>
        <View style={styles.badge}>
          <Text style={styles.badgeIcon}>{sign.symbol}</Text>
          <View style={styles.badgeText}>
            <Text style={styles.badgeLabel}>{t('birthPreview.starSign')}</Text>
            <Text style={styles.badgeValue} numberOfLines={1}>{sign.name}</Text>
          </View>
        </View>
        {animal && (
          <View style={styles.badge}>
            <Text style={styles.badgeIcon}>{animal.emoji}</Text>
            <View style={styles.badgeText}>
              <Text style={styles.badgeLabel}>{t('birthPreview.animal')}</Text>
              <Text style={styles.badgeValue} numberOfLines={1}>{animal.name}</Text>
            </View>
          </View>
        )}
      </View>

      <Text style={styles.subTitle}>{t('birthPreview.pillars')}</Text>
      {/* 시 일 월 년, right to left as a 만세력 writes them — the order 내 정보 shows too. */}
      <View style={styles.pillarRow}>
        {pillars.map(p => (
          <View key={p.key} style={styles.pillar}>
            <Text style={styles.pillarLabel}>{p.label}</Text>
            {p.ganji ? (
              p.ganji.split('').map((c, i) => {
                const color = ELEMENT_COLOR[ELEMENT_OF[c]];
                const me = p.key === 'day' && i === 0;
                return (
                  <View key={i} style={[styles.glyph, { borderColor: color }, me && { backgroundColor: `${color}26` }]}>
                    <Text style={[styles.glyphChar, { color }]}>{c}</Text>
                    {showReading && <Text style={styles.glyphReading}>{sayGlyphs(c, lang)}</Text>}
                  </View>
                );
              })
            ) : (
              <View style={[styles.glyph, styles.glyphUnknown, styles.glyphTall]}>
                <Text style={styles.unknown}>{t('birthPreview.hourUnknown')}</Text>
              </View>
            )}
          </View>
        ))}
      </View>
      {!!dayStem && (
        <Text style={styles.dayMaster}>
          {t('myInfo.dayMaster', {
            stem: showReading ? `${dayStem}(${sayGlyphs(dayStem, lang)})` : dayStem,
            element: t(`myInfo.el.${ELEMENT_OF[dayStem]}` as TranslationKey),
          })}
        </Text>
      )}

      {chart.adjusted && (
        <View style={styles.clockRow} testID="birth-preview-clock">
          <View style={styles.clockText}>
            <Text style={styles.clockMain}>
              {t('myInfo.noteAdjusted', { time: `${pad(chart.adjusted.hour)}:${pad(chart.adjusted.minute)}` })}
            </Text>
            <Text style={styles.clockSub}>
              {t('birthPreview.placeOffset', {
                place: findKoreaPlace(birthPlace)?.name ?? t('birthPreview.seoul'),
                min: chart.offsetMinutes > 0 ? `+${chart.offsetMinutes}` : String(chart.offsetMinutes),
              })}
              {chart.summerTime ? ` · ${t('myInfo.noteSummer')}` : ''}
            </Text>
          </View>
          {chart.summerTime && (
            <View style={styles.summerBadge} testID="birth-preview-summer">
              <Text style={styles.summerBadgeText}>{t('myInfo.summerTag')}</Text>
            </View>
          )}
        </View>
      )}

      <Pressable
        onPress={() => { sfx.tap(); setExplain(v => !v); }}
        style={styles.whatRow}
        accessibilityRole="button"
        accessibilityState={{ expanded: explain }}
        hitSlop={6}>
        <Text style={styles.whatTitle}>{t('birthPreview.whatTitle')}</Text>
        <Text style={styles.whatChevron}>{explain ? '−' : '+'}</Text>
      </Pressable>
      {explain && <Text style={styles.whatBody}>{t('birthPreview.whatBody')}</Text>}
    </View>
  );
};

const pad = (n: number) => String(n).padStart(2, '0');

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md },
  title: { ...typography.bodyStrong, color: colors.textPrimary },
  badges: { flexDirection: 'row', gap: spacing.sm },
  badge: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  badgeIcon: { fontSize: 24, color: colors.violetSoft },
  badgeText: { flex: 1 },
  badgeLabel: { ...typography.tiny, color: colors.textMuted },
  badgeValue: { ...typography.bodyStrong, color: colors.textPrimary },
  subTitle: { ...typography.caption, color: colors.textMuted, marginTop: spacing.xs },
  pillarRow: { flexDirection: 'row', gap: spacing.sm },
  pillar: { flex: 1, alignItems: 'center', gap: spacing.xs },
  pillarLabel: { ...typography.tiny, color: colors.textMuted },
  glyph: {
    width: '100%', aspectRatio: 1, borderRadius: radius.md, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  glyphTall: { aspectRatio: 0.5 },
  glyphUnknown: { borderColor: 'rgba(255,255,255,0.12)', borderStyle: 'dashed', paddingHorizontal: 2 },
  glyphChar: { fontSize: 24, fontWeight: '700' },
  glyphReading: { ...typography.tiny, color: colors.textSecondary },
  unknown: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },
  dayMaster: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  clockRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    padding: spacing.md, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)',
  },
  clockText: { flex: 1, gap: 2 },
  clockMain: { ...typography.caption, color: colors.textPrimary },
  clockSub: { ...typography.tiny, color: colors.textMuted },
  summerBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: colors.gold },
  summerBadgeText: { ...typography.tiny, color: '#1A1330' },
  whatRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: 'rgba(255,255,255,0.12)',
  },
  whatTitle: { ...typography.bodyStrong, color: colors.violetSoft },
  whatChevron: { ...typography.h3, color: colors.violetSoft },
  whatBody: { ...typography.caption, color: colors.textSecondary, lineHeight: 20 },
});
