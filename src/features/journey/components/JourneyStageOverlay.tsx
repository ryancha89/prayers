import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { partsOf, teaserOf, useJourneyPlayer } from '../player/journeyPlayer';
import { REVEAL_ART, REVEAL_ART_DEFAULT } from '../art';
import { CardPick } from './CardPick';
import { monthsLabel } from '../format';
import { useCoins } from '../../coins/store/coinStore';
import { useScreen } from '../../../shared/device/screen';
import type { Journey } from '../types';
import { isNativeUnity } from '../../counseling/bridge';

const INK = '#1A1330';

/** The stages whose counsellor beat (JOURNEY_STATE `stage`, character-setup sheet 06-10) plays BEFORE the
 *  card covers the cabin: thinking at a station's title, the open-hand "which one?" at a choice. Shown at
 *  once, the opaque card hid the whole gesture (sim QA 06-10). */
const BEAT_FIRST = new Set(['title', 'pick', 'branch', 'quarters']);
/** How long the counsellor has before the card rises: the beat's fade-in and its pose (~1.5 s). */
export const STAGE_BEAT_LEAD_MS = 1500;

/** The stage the overlay may draw: a BEAT_FIRST stage arrives here STAGE_BEAT_LEAD_MS late when the 3D
 *  cabin is behind it (Unity already has the stage and is gesturing); everything else at once. */
export function useShownStage(stage: string): string {
  const lead = isNativeUnity() && BEAT_FIRST.has(stage);
  const [shown, setShown] = useState(lead ? '' : stage);
  useEffect(() => {
    if (!lead) { setShown(stage); return undefined; }
    setShown('');
    const timer = setTimeout(() => setShown(stage), STAGE_BEAT_LEAD_MS);
    return () => clearTimeout(timer);
  }, [stage, lead]);
  return lead ? shown : stage;
}

/**
 * Everything the 2027 mockup (01-10) puts over the train while it waits on the player: the station's
 * title card, the three face-down cards, the branch choice, the quarter list, the locked moment,
 * the reveal card, and the buttons that leave a station. One component, driven by the player's
 * `stage` and `moment` — the cabin behind it keeps running.
 *
 * ⚠️ EVERY CARD FITS THE WINDOW IT IS IN, and that is a tap rule before it is a looks rule: RN does
 * not deliver a touch to a child outside its parent's bounds, so a card taller than the window had a
 * Continue button you could see and not press (sim QA 01-10). In landscape the window is ~340pt
 * tall, so the cards are capped at the window (`maxHeight: '100%'`), their words scroll, and the
 * button sits OUTSIDE the scroll where it can never be pushed off.
 */
export const JourneyStageOverlay: React.FC<{ journey: Journey }> = ({ journey }) => {
  const t = useT();
  const lang = useLang();
  const s = useJourneyPlayer();
  const stage = useShownStage(s.stage);
  const coins = useCoins(c => c.balance);
  const landscape = useScreen().landscape;
  const center = [styles.center, landscape && styles.centerSide];
  const chapter = journey.chapters[s.chapterIndex];
  if (!chapter || s.status === 'transition') return null;
  const parts = partsOf(s.content, chapter.id);
  const price = s.content?.momentPrice ?? null;
  const station = chapter.subtitle ? t(chapter.subtitle) : '';

  // ── The station's title card: "1. 사회운 (Social & Career)" ─────────────────────────────
  if (stage === 'title') {
    return (
      <View style={center}>
        <Card landscape={landscape}
          footer={<Primary label={t('journey.station.view', { station })} onPress={() => { sfx.select(); s.beginStation(); }} />}>
          <Text style={styles.number}>{chapter.number}.</Text>
          <Text style={styles.heading}>{chapter.heading ? t(chapter.heading) : station}</Text>
          {chapter.blurb ? <Text style={styles.blurb}>{t(chapter.blurb)}</Text> : null}
        </Card>
      </View>
    );
  }

  // ── Pick one of three face-down cards; the one picked turns over to the station's card ──
  if (stage === 'pick') {
    const card = s.content?.chapters.find(c => c.id === chapter.id)?.card;
    return (
      <View style={center}>
        {s.pickedCard == null ? <Text style={styles.prompt}>{t('journey.pick.prompt')}</Text> : null}
        <CardPick
          picked={s.pickedCard}
          onPick={i => { sfx.select(); s.pickCard(i); }}
          title={card?.title ?? station}
          line={card?.line}
          small={landscape}
          footer={<Primary label={t('journey.continue')} onPress={() => { sfx.tap(); s.beginReading(); }} />}
        />
      </View>
    );
  }

  // ── Which of the station's two paid parts first ────────────────────────────────────────
  if (stage === 'branch') {
    const paid = parts.map((p, i) => ({ p, i })).filter(x => x.p.momentId);
    return (
      <View style={center}>
        <Card landscape={landscape}>
          <Text style={styles.blurb}>{chapter.branchPrompt ? t(chapter.branchPrompt) : ''}</Text>
          {paid.map(({ p, i }) => (
            <Pressable key={p.momentId} style={styles.choice} onPress={() => { sfx.select(); s.chooseBranch(i); }} accessibilityRole="button">
              {!p.unlocked && <Icon name="lock" size={16} color={colors.gold} />}
              <Text style={styles.choiceText}>{p.label ?? p.momentId}</Text>
            </Pressable>
          ))}
        </Card>
      </View>
    );
  }

  // ── The monthly station: four quarters, each opened on its own ────────────────────────
  if (stage === 'quarters') {
    return (
      <View style={center}>
        {/* Its own list scrolls, so the card does not: the list is what gives way to the window. */}
        <View style={[styles.card, landscape && styles.cardSide]}>
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
          <UnlockNote error={s.unlockError} coins={coins} price={price} />
          <Primary label={t('journey.stationEnd.next')} onPress={() => { sfx.tap(); s.nextStation(); }} />
        </View>
      </View>
    );
  }

  // ── A locked moment: the offer, unlock, or later ──────────────────────────────────────
  if (s.moment === 'locked' && s.stage === '') {
    return (
      <View style={[center, styles.dim]}>
        <View style={[styles.lockBadge, landscape && styles.lockBadgeSide]}>
          <Icon name="lock" size={landscape ? 22 : 30} color={colors.gold} />
        </View>
        {/* The offer is what gives way to a short window; the buttons under it never do. */}
        <ScrollView style={styles.shrink} contentContainerStyle={styles.teaserBody} bounces={false}>
          <Text style={styles.teaser}>{teaserOf(s)}</Text>
        </ScrollView>
        <Pressable style={[styles.primary, styles.fixed, s.unlocking && styles.busy]} disabled={s.unlocking}
          onPress={() => { sfx.select(); s.unlock(); }} accessibilityRole="button"
          accessibilityLabel={`${price ?? ''} ${t('journey.moment.unlock')}`}>
          {s.unlocking ? <ActivityIndicator color={INK} /> : (
            <>
              {price != null && <><Icon name="coin" size={18} color={INK} /><Text style={styles.primaryText}>{price}</Text></>}
              <Text style={styles.primaryText}>{t('journey.moment.unlock')}</Text>
            </>
          )}
        </Pressable>
        <Pressable style={[styles.secondary, styles.fixed]} disabled={s.unlocking} onPress={() => { sfx.tap(); s.later(); }} accessibilityRole="button">
          <Text style={styles.secondaryText}>{t('journey.moment.later')}</Text>
        </Pressable>
        <UnlockNote error={s.unlockError} coins={coins} price={price} />
      </View>
    );
  }

  // ── The card a just-unlocked part opens with ──────────────────────────────────────────
  if (stage === 'reveal' && s.reveal) {
    return (
      <View style={center}>
        <RevealIn>
        {/* Landscape lays the card on its side — the art down the left, the words beside it — since
            the art on top would leave the words ~150pt of a ~340pt window. */}
        <View style={[styles.reveal, landscape && styles.revealSide]}>
          <Image source={REVEAL_ART[chapter.id] ?? REVEAL_ART_DEFAULT}
            style={[styles.revealArt, landscape && styles.revealArtSide]} resizeMode="cover" />
          <View style={[styles.revealBody, landscape && styles.revealBodySide]}>
            <ScrollView style={landscape ? styles.shrink : styles.revealScroll}
              contentContainerStyle={styles.revealScrollInner} bounces={false}>
              <Text style={styles.eyebrow}>{t('journey.card.eyebrow', { year: journey.year })}</Text>
              <Text style={styles.heading}>{s.reveal.title}</Text>
              {s.reveal.months.length > 0 && <Text style={styles.months}>{monthsLabel(s.reveal.months, lang)}</Text>}
              {s.reveal.description ? <Text style={styles.blurb} numberOfLines={4}>{s.reveal.description}</Text> : null}
              <Text style={styles.stars}>{'★'.repeat(s.reveal.stars)}{'☆'.repeat(Math.max(0, 5 - s.reveal.stars))}</Text>
            </ScrollView>
            <Primary label={t('journey.continue')} onPress={() => { sfx.tap(); s.continueReveal(); }} />
          </View>
        </View>
        </RevealIn>
      </View>
    );
  }

  // ── Leaving a station, and leaving the train ──────────────────────────────────────────
  if (stage === 'stationEnd' || stage === 'ending') {
    return (
      <View style={styles.bottom}>
        {stage === 'stationEnd'
          ? <Primary label={t('journey.stationEnd.next')} onPress={() => { sfx.tap(); s.nextStation(); }} />
          : <Primary label={t('journey.ending.finish')} onPress={() => { sfx.select(); s.finish(); }} />}
      </View>
    );
  }
  return null;
};

/** The reveal card waits for the cabin's unlock burst (Unity plays it on locked → premium) and then
 *  fades in — shown at once it covered the burst completely (sim QA 01-10). */
const REVEAL_DELAY_MS = 1200;
const RevealIn: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const fade = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    const a = Animated.sequence([Animated.delay(REVEAL_DELAY_MS), Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true })]);
    a.start();
    return () => a.stop();
  }, [fade]);
  return <Animated.View style={[styles.revealIn, { opacity: fade }]}>{children}</Animated.View>;
};

/** Under an unlock: what went wrong, else the coins the player has. */
const UnlockNote: React.FC<{ error: string | null; coins: number | null; price: number | null }> = ({ error, coins, price }) => {
  const t = useT();
  // Stale once the shop has topped the wallet up past the price (sim QA 01-10: "Not enough coins
  // (you have 500)" stayed under the button after buying 500).
  const short = coins == null || price == null || coins < price;
  if (error === 'insufficient' && short) return <Text style={styles.error}>{t('journey.moment.noCoins', { balance: coins ?? 0 })}</Text>;
  if (error === 'failed' || error === 'unknown') return <Text style={styles.error}>{t('journey.moment.failed')}</Text>;
  return coins != null ? <Text style={styles.note}>{t('journey.moment.balance', { balance: coins.toLocaleString() })}</Text> : null;
};

/** A card over the window: its words scroll when the window is too short for them, its `footer` (the
 *  one button that moves the journey on) stays outside the scroll and so always inside the card. */
const Card: React.FC<{ landscape: boolean; footer?: React.ReactNode; children: React.ReactNode }> = ({ landscape, footer, children }) => (
  <View style={[styles.card, landscape && styles.cardSide]}>
    <ScrollView style={styles.shrink} contentContainerStyle={[styles.cardBody, landscape && styles.cardBodySide]} bounces={false}>
      {children}
    </ScrollView>
    {footer}
  </View>
);

const Primary: React.FC<{ label: string; onPress(): void }> = ({ label, onPress }) => (
  <Pressable style={[styles.primary, styles.fixed]} onPress={onPress} accessibilityRole="button">
    <Text style={styles.primaryText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  center: { ...absoluteFill, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, gap: spacing.md },
  centerSide: { padding: spacing.sm, gap: spacing.sm },
  // Gives way to the window; `fixed` never does.
  shrink: { flexGrow: 0, flexShrink: 1, alignSelf: 'stretch' },
  fixed: { flexShrink: 0 },
  bottom: { ...absoluteFill, alignItems: 'center', justifyContent: 'flex-end', padding: spacing.lg },
  dim: { backgroundColor: 'rgba(5,4,20,0.62)' },
  flex: { flex: 1 },
  card: {
    width: '88%', maxWidth: 460, maxHeight: '100%', padding: spacing.xl, gap: spacing.md, alignItems: 'center',
    borderRadius: radius.xl, backgroundColor: 'rgba(18,14,40,0.9)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.45)',
  },
  cardSide: { padding: spacing.lg, gap: spacing.sm },
  cardBody: { alignItems: 'center', gap: spacing.md },
  cardBodySide: { gap: spacing.sm },
  number: { ...typography.h2, color: colors.gold },
  heading: { ...typography.h2, color: colors.textPrimary, textAlign: 'center' },
  blurb: { ...typography.body, color: colors.textSecondary, textAlign: 'center', lineHeight: 22 },
  prompt: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center' },
  cardRow: { flexDirection: 'row', gap: spacing.md },
  cardBack: {
    width: 86, height: 128, borderRadius: radius.md, overflow: 'hidden',
    backgroundColor: '#2A1F5A', borderWidth: 1, borderColor: colors.gold,
  },
  cardBackSide: { width: 72, height: 108 },
  cardBackArt: { width: '100%', height: '100%' },
  choice: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    paddingVertical: spacing.md, paddingHorizontal: spacing.lg, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.gold, backgroundColor: 'rgba(233,196,106,0.08)',
  },
  choiceText: { ...typography.bodyStrong, color: colors.textPrimary, textAlign: 'center', flexShrink: 1 },
  quarterList: { alignSelf: 'stretch', maxHeight: 260, flexGrow: 0, flexShrink: 1 },
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
  lockBadgeSide: { width: 44, height: 44, borderRadius: 22 },
  teaserBody: { alignItems: 'center' },
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
    width: '84%', maxWidth: 560, maxHeight: '100%', borderRadius: radius.xl, overflow: 'hidden',
    backgroundColor: 'rgba(18,14,40,0.95)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
  // The card must fit the window between the header and the panel: past it, its Continue button
  // left the overlay's bounds and no tap reached it (sim QA 01-10). The art gives way first.
  revealIn: { width: '100%', maxHeight: '100%', alignItems: 'center' },
  revealArt: { width: '100%', height: 150, minHeight: 56, flexShrink: 1 },
  revealBody: { padding: spacing.lg, gap: spacing.sm, alignItems: 'center', flexShrink: 0 },
  revealScroll: { flexGrow: 0, alignSelf: 'stretch' },
  revealScrollInner: { alignItems: 'center', gap: spacing.sm },
  revealSide: { flexDirection: 'row' },
  revealArtSide: { width: '38%', height: 'auto', minHeight: 0, alignSelf: 'stretch' },
  revealBodySide: { flex: 1, flexShrink: 1, padding: spacing.md },
  eyebrow: { ...typography.tiny, color: colors.gold, letterSpacing: 2 },
  months: { ...typography.h3, color: colors.gold },
  stars: { fontSize: 16, color: colors.gold, letterSpacing: 3 },
});
