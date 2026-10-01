import React from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { partsOf, teaserOf, useJourneyPlayer } from '../player/journeyPlayer';
import { REVEAL_ART, REVEAL_ART_DEFAULT } from '../art';
import { monthsLabel } from '../format';
import { useCoins } from '../../coins/store/coinStore';
import type { Journey } from '../types';

const INK = '#1A1330';

/**
 * Everything the 2027 mockup (01-10) puts over the train while it waits on the player: the station's
 * title card, the three face-down cards, the branch choice, the quarter list, the locked moment,
 * the reveal card, and the buttons that leave a station. One component, driven by the player's
 * `stage` and `moment` — the cabin behind it keeps running.
 */
export const JourneyStageOverlay: React.FC<{ journey: Journey }> = ({ journey }) => {
  const t = useT();
  const lang = useLang();
  const s = useJourneyPlayer();
  const coins = useCoins(c => c.balance);
  const chapter = journey.chapters[s.chapterIndex];
  if (!chapter || s.status === 'transition') return null;
  const parts = partsOf(s.content, chapter.id);
  const price = s.content?.momentPrice ?? null;
  const station = chapter.subtitle ? t(chapter.subtitle) : '';

  // ── The station's title card: "1. 사회운 (Social & Career)" ─────────────────────────────
  if (s.stage === 'title') {
    return (
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.number}>{chapter.number}.</Text>
          <Text style={styles.heading}>{chapter.heading ? t(chapter.heading) : station}</Text>
          {chapter.blurb ? <Text style={styles.blurb}>{t(chapter.blurb)}</Text> : null}
          <Primary label={t('journey.station.view', { station })} onPress={() => { sfx.select(); s.beginStation(); }} />
        </View>
      </View>
    );
  }

  // ── Pick one of three face-down cards; the one picked turns over to the station's card ──
  if (s.stage === 'pick') {
    const card = s.content?.chapters.find(c => c.id === chapter.id)?.card;
    return (
      <View style={styles.center}>
        {s.pickedCard == null ? (
          <>
            <Text style={styles.prompt}>{t('journey.pick.prompt')}</Text>
            <View style={styles.cardRow}>
              {[0, 1, 2].map(i => (
                <Pressable key={i} style={styles.cardBack} onPress={() => { sfx.select(); s.pickCard(i); }}
                  accessibilityRole="button" accessibilityLabel={`${i + 1}`}>
                  <Text style={styles.cardBackMark}>✦</Text>
                </Pressable>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.card}>
            <Text style={styles.heading}>{card?.title ?? station}</Text>
            {card?.line ? <Text style={styles.blurb}>{card.line}</Text> : null}
            <Primary label={t('journey.continue')} onPress={() => { sfx.tap(); s.beginReading(); }} />
          </View>
        )}
      </View>
    );
  }

  // ── Which of the station's two paid parts first ────────────────────────────────────────
  if (s.stage === 'branch') {
    const paid = parts.map((p, i) => ({ p, i })).filter(x => x.p.momentId);
    return (
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.blurb}>{chapter.branchPrompt ? t(chapter.branchPrompt) : ''}</Text>
          {paid.map(({ p, i }) => (
            <Pressable key={p.momentId} style={styles.choice} onPress={() => { sfx.select(); s.chooseBranch(i); }} accessibilityRole="button">
              {!p.unlocked && <Icon name="lock" size={16} color={colors.gold} />}
              <Text style={styles.choiceText}>{p.label ?? p.momentId}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  // ── The monthly station: four quarters, each opened on its own ────────────────────────
  if (s.stage === 'quarters') {
    return (
      <View style={styles.center}>
        <View style={styles.card}>
          <Text style={styles.heading}>{t('journey.quarters.title', { year: journey.year })}</Text>
          <ScrollView style={styles.quarterList} contentContainerStyle={styles.quarterListInner}>
            {parts.map((p, i) => (!p.momentId ? null : (
              <Pressable key={p.momentId} style={styles.quarter} disabled={s.unlocking}
                onPress={() => { sfx.select(); s.playQuarter(i); }} accessibilityRole="button">
                <Text style={styles.quarterLabel}>{p.label ?? p.momentId}</Text>
                <View style={styles.flex} />
                {s.unlocking && s.momentId === p.momentId ? (
                  <ActivityIndicator color={colors.gold} />
                ) : p.unlocked ? (
                  <>
                    <Icon name="play" size={14} color={colors.gold} />
                    <Text style={styles.quarterMeta}>{t('journey.quarters.play')}</Text>
                  </>
                ) : (
                  <>
                    <Icon name="lock" size={14} color={colors.gold} />
                    {price != null && <><Icon name="coin" size={14} color={colors.gold} /><Text style={styles.quarterMeta}>{price}</Text></>}
                  </>
                )}
              </Pressable>
            )))}
          </ScrollView>
          <UnlockNote error={s.unlockError} coins={coins} />
          <Primary label={t('journey.stationEnd.next')} onPress={() => { sfx.tap(); s.nextStation(); }} />
        </View>
      </View>
    );
  }

  // ── A locked moment: the offer, unlock, or later ──────────────────────────────────────
  if (s.moment === 'locked' && s.stage === '') {
    return (
      <View style={[styles.center, styles.dim]}>
        <View style={styles.lockBadge}>
          <Icon name="lock" size={30} color={colors.gold} />
        </View>
        <Text style={styles.teaser}>{teaserOf(s)}</Text>
        <Pressable style={[styles.primary, s.unlocking && styles.busy]} disabled={s.unlocking}
          onPress={() => { sfx.select(); s.unlock(); }} accessibilityRole="button"
          accessibilityLabel={`${price ?? ''} ${t('journey.moment.unlock')}`}>
          {s.unlocking ? <ActivityIndicator color={INK} /> : (
            <>
              {price != null && <><Icon name="coin" size={18} color={INK} /><Text style={styles.primaryText}>{price}</Text></>}
              <Text style={styles.primaryText}>{t('journey.moment.unlock')}</Text>
            </>
          )}
        </Pressable>
        <Pressable style={styles.secondary} disabled={s.unlocking} onPress={() => { sfx.tap(); s.later(); }} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('journey.moment.later')}</Text>
        </Pressable>
        <UnlockNote error={s.unlockError} coins={coins} />
      </View>
    );
  }

  // ── The card a just-unlocked part opens with ──────────────────────────────────────────
  if (s.stage === 'reveal' && s.reveal) {
    return (
      <View style={styles.center}>
        <View style={styles.reveal}>
          <Image source={REVEAL_ART[chapter.id] ?? REVEAL_ART_DEFAULT} style={styles.revealArt} resizeMode="cover" />
          <View style={styles.revealBody}>
            <Text style={styles.eyebrow}>{t('journey.card.eyebrow', { year: journey.year })}</Text>
            <Text style={styles.heading}>{s.reveal.title}</Text>
            {s.reveal.months.length > 0 && <Text style={styles.months}>{monthsLabel(s.reveal.months, lang)}</Text>}
            {s.reveal.description ? <Text style={styles.blurb}>{s.reveal.description}</Text> : null}
            <Text style={styles.stars}>{'★'.repeat(s.reveal.stars)}{'☆'.repeat(Math.max(0, 5 - s.reveal.stars))}</Text>
            <Primary label={t('journey.continue')} onPress={() => { sfx.tap(); s.continueReveal(); }} />
          </View>
        </View>
      </View>
    );
  }

  // ── Leaving a station, and leaving the train ──────────────────────────────────────────
  if (s.stage === 'stationEnd' || s.stage === 'ending') {
    return (
      <View style={styles.bottom}>
        {s.stage === 'stationEnd'
          ? <Primary label={t('journey.stationEnd.next')} onPress={() => { sfx.tap(); s.nextStation(); }} />
          : <Primary label={t('journey.ending.finish')} onPress={() => { sfx.select(); s.finish(); }} />}
      </View>
    );
  }
  return null;
};

/** Under an unlock: what went wrong, else the coins the player has. */
const UnlockNote: React.FC<{ error: string | null; coins: number | null }> = ({ error, coins }) => {
  const t = useT();
  if (error === 'insufficient') return <Text style={styles.error}>{t('journey.moment.noCoins', { balance: coins ?? 0 })}</Text>;
  if (error === 'failed' || error === 'unknown') return <Text style={styles.error}>{t('journey.moment.failed')}</Text>;
  return coins != null ? <Text style={styles.note}>{t('journey.moment.balance', { balance: coins.toLocaleString() })}</Text> : null;
};

const Primary: React.FC<{ label: string; onPress(): void }> = ({ label, onPress }) => (
  <Pressable style={styles.primary} onPress={onPress} accessibilityRole="button">
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  center: { ...absoluteFill, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  bottom: { ...absoluteFill, alignItems: 'center', justifyContent: 'flex-end', padding: spacing.lg },
  dim: { backgroundColor: 'rgba(5,4,20,0.62)' },
  flex: { flex: 1 },
  card: {
    width: '88%', padding: spacing.xl, gap: spacing.md, alignItems: 'center', borderRadius: radius.xl,
    backgroundColor: 'rgba(18,14,40,0.9)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
  },
  number: { ...typography.h2, color: colors.gold },
  heading: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  blurb: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  prompt: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  cardBack: {
    width: 86, height: 128, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#2A1F5A', borderWidth: 2, borderColor: colors.gold,
  },
  cardBackMark: { fontSize: 30, color: colors.gold },
  choice: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.gold, backgroundColor: 'rgba(233,196,106,0.08)',
  },
  choiceText: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center', flexShrink: 1 },
  quarterList: { alignSelf: 'stretch', maxHeight: 260 },
  quarterListInner: { gap: spacing.sm },
  quarter: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.md,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.05)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.25)',
  },
  quarterLabel: { ...typography.bodyStrong, color: colors.textPrimary },
  quarterMeta: { ...typography.caption, color: colors.gold },
  lockBadge: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)', backgroundColor: 'rgba(18,14,40,0.8)',
  },
  teaser: { ...typography.h3, color: colors.textPrimary, textAlign: 'center', paddingHorizontal: spacing.md, lineHeight: 26 },
  primary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, minHeight: 50,
    paddingHorizontal: spacing.xl, borderRadius: radius.pill, backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  primaryText: { ...typography.bodyStrong, color: INK },
  busy: { opacity: 0.6 },
  secondary: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
  secondaryText: { ...typography.body, color: colors.textSecondary, textDecorationLine: 'underline' },
  error: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  note: { ...typography.tiny, color: colors.textMuted, textAlign: 'center' },
  reveal: {
    width: '84%', borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: 'rgba(18,14,40,0.95)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
  revealArt: { width: '100%', height: 150 },
  revealBody: { padding: spacing.lg, gap: spacing.sm, alignItems: 'center' },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 2 },
  months: { ...typography.h3, color: colors.gold },
  stars: { fontSize: 16, color: colors.gold, letterSpacing: 3 },
});
