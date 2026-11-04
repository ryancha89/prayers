import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { SERIF } from '../../../shared/components/hud/Hud';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { useScreen } from '../../../shared/device/screen';
import { sfx } from '../../../shared/audio/sfx';
import type { CounselorSummary } from '../../counselors/types';
import type { WorldZone } from '../../counseling/types';
import { journeyActive, useJourneyPlayer } from '../../journey/player/journeyPlayer';
import { JOURNEYS } from '../../journey/data/journeys';
import { useCoins } from '../../coins/store/coinStore';
import { CoinGlyph } from '../../coins/components/CoinGlyph';
import { formatCoins } from '../../coins/format';
import { zoneInfo } from '../data/zones';
import { counselingRoster } from './WorldSheets';
import { STICK_ZONE } from './WorldJoystick';

/**
 * At a door, what is behind it (13-10 redesign — "vào các phòng từ 3D nên có UI khác cho hợp lý").
 *
 * Before: the same gold "Enter →" at every door, so a player could not tell the counselling hall from
 * the shop without the floating sign, and the counselling door then dropped them onto Home's 2D list.
 * Now each door says where it goes and what is live in there, and offers the one thing to do:
 *
 *   · counseling  the counselors' faces — tapping one IS entering, with that counselor
 *   · journey     where the trip stands (the chapter, if one is running) and Board / Continue
 *   · meditation  the session (10 min · 4·4·6) and Begin
 *   · shop        the balance, and Enter
 *   · myroom      one line, and Enter
 *   · cafe        one line, and Enter (the coffee shop, 16-10)
 *
 * Portrait: low, just over the stick's ring (DOOR_LIFT) — at the old pill's height (PROMPT_LIFT, 250) it
 * stood on the player's back (30-10, "사람 안가리게 밑으로"). Landscape: low too (30-10, "가로모드에서도
 * 아래에"), in the gap between the stick and the Map·Quest·Menu row. Before that: top centre,
 * under the top row — the World camera frames the player low and centred, and at the bottom the card
 * stood on him (simulator, 13-10). Same pop either way when the door changes.
 */
export const DoorCard: React.FC<{
  zone: WorldZone;
  journeyYear: number;
  onEnter(zone: WorldZone, counselor?: CounselorSummary): void;
}> = ({ zone, journeyYear, onEnter }) => {
  const t = useT();
  const lang = useLang();
  const safe = useSafeAreaInsets();
  const landscape = useScreen().landscape;
  const info = zoneInfo(zone);
  const pop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 7, tension: 80, useNativeDriver: true }).start();
  }, [zone, pop]);

  const roster = useMemo(() => (zone === 'counseling' ? counselingRoster(lang).slice(0, 4) : []), [zone, lang]);
  const journey = useJourneyPlayer(s => (journeyActive(s) && s.journeyId ? s : null));
  const balance = useCoins(s => s.balance);

  const go = (counselor?: CounselorSummary) => { sfx.select(); onEnter(zone, counselor); };

  let line: React.ReactNode = <Text style={styles.line} numberOfLines={1}>{t(info.sub, { year: journeyYear })}</Text>;
  let cta: string | null = t('world.enter');
  if (zone === 'journey' && journey) {
    const chapter = JOURNEYS[journey.journeyId!]?.chapters[journey.chapterIndex];
    const total = JOURNEYS[journey.journeyId!]?.chapters.length ?? 0;
    line = (
      <Text style={styles.line} numberOfLines={1}>
        {`${journey.chapterIndex + 1}/${total}`}{chapter?.subtitle ? ` · ${t(chapter.subtitle)}` : ''}
      </Text>
    );
  }
  if (zone === 'journey') cta = journey ? t('world.journey.resume') : t('world.journey.cta');
  if (zone === 'meditation') {
    // Two sessions now (10-minute meditation, sleep guide): the door opens onto the choice.
    line = <Text style={styles.line} numberOfLines={1}>{t(info.sub)}</Text>;
  }
  if (zone === 'shop') {
    line = (
      <View style={styles.coinLine}>
        <CoinGlyph size={14} />
        <Text style={styles.line}>{balance == null ? '—' : formatCoins(balance)}</Text>
      </View>
    );
  }
  if (zone === 'myroom') cta = t('world.myroom.cta');
  if (zone === 'cafe') cta = t('world.cafe.cta');
  if (zone === 'counseling') cta = null;

  return (
    <Animated.View
      pointerEvents="box-none"
      testID={`world-door-${zone}`}
      style={[
        styles.wrap,
        {
          left: safe.left + (landscape ? STICK_ZONE.width : spacing.md),
          right: safe.right + (landscape ? LANDSCAPE_RIGHT : spacing.md),
          bottom: safe.bottom + (landscape ? spacing.lg : DOOR_LIFT),
          opacity: pop,
          transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
        },
      ]}>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.emblem}>
            <Icon name={info.icon} size={16} color={colors.gold} />
          </View>
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>{t(info.label)}</Text>
            {line}
          </View>
          {cta ? (
            <Pressable testID="world-door-enter" onPress={() => go()} accessibilityRole="button" accessibilityLabel={cta}
              style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
              <Text style={styles.ctaText} numberOfLines={1}>{cta}</Text>
              <Icon name="arrowRight" size={14} color={INK} />
            </Pressable>
          ) : null}
        </View>
        {roster.length > 0 && (
          <View style={styles.faces}>
            {roster.map(c => (
              <Pressable key={c.id} testID={`world-door-counselor-${c.id}`} onPress={() => go(c)} accessibilityRole="button"
                accessibilityLabel={c.name} style={({ pressed }) => [styles.face, pressed && styles.pressed]}>
                {c.avatarImage
                  ? <Image source={c.avatarImage} style={styles.avatar} />
                  : <View style={[styles.avatar, { backgroundColor: c.accent }]} />}
                <Text style={styles.faceName} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
};

/**
 * Walking through: the room's name, set in the plaque's serif, while Unity takes the player in. Before
 * this the screen showed nothing for the 2–6 s of the walk, and a blank world reads as a hang.
 */
export const DoorTitle: React.FC<{ zone: WorldZone }> = ({ zone }) => {
  const t = useT();
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 700, delay: 250, useNativeDriver: true }).start();
  }, [zone, fade]);
  return (
    <Animated.View pointerEvents="none" style={[styles.titleWrap, { opacity: fade }]} testID="world-door-title">
      <View style={styles.rule} />
      <Text style={styles.doorTitle}>{t(zoneInfo(zone).label)}</Text>
      <View style={styles.rule} />
    </Animated.View>
  );
};

const INK = '#1A1330';
const AVATAR = 38;
/** Portrait: the card's bottom, over the joystick's resting ring (its top is ~124 pt up the stick zone). */
const DOOR_LIFT = STICK_ZONE.height - 88;
/** Landscape: clear of WorldScreen's bottom-right row — three ROUND (46) rings, their gaps and its inset. */
const LANDSCAPE_RIGHT = 3 * 46 + 2 * spacing.md + spacing.lg + spacing.sm;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  card: {
    width: '100%', maxWidth: 330, paddingVertical: spacing.sm, paddingHorizontal: spacing.md, gap: spacing.sm, borderRadius: radius.lg,
    backgroundColor: 'rgba(18,14,40,0.88)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  emblem: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)', backgroundColor: 'rgba(233,196,106,0.08)',
  },
  titles: { flex: 1, gap: 2 },
  title: { fontFamily: SERIF, fontSize: 16, color: colors.textPrimary, letterSpacing: 0.3 },
  line: { ...typography.caption, color: colors.textMuted },
  coinLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  ctaText: { ...typography.bodyStrong, fontSize: 14, color: INK, maxWidth: 140 },
  pressed: { opacity: 0.75 },
  faces: { flexDirection: 'row', justifyContent: 'space-around' },
  face: { alignItems: 'center', gap: 3, width: 64 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 1.5, borderColor: 'rgba(233,196,106,0.7)' },
  faceName: { ...typography.caption, color: colors.textPrimary },
  titleWrap: { ...absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  rule: { width: 56, height: StyleSheet.hairlineWidth, backgroundColor: colors.gold },
  doorTitle: {
    fontFamily: SERIF, fontSize: 28, color: colors.textPrimary, letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
});
