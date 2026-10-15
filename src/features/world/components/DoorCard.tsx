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
import { counselingRoster, WorldSheetTop } from './WorldSheets';
import { PROMPT_LIFT } from './PromptButton';

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
 *
 * Portrait: where the old pill was (PROMPT_LIFT, centred between the safe edges). Landscape: top centre,
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
  const barBottom = React.useContext(WorldSheetTop);
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
    line = <Text style={styles.line} numberOfLines={1}>{t(info.sub)}{'  ·  10′ · 4·4·6'}</Text>;
    cta = t('world.med.cta');
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
  if (zone === 'counseling') cta = null;

  return (
    <Animated.View
      pointerEvents="box-none"
      testID={`world-door-${zone}`}
      style={[
        styles.wrap,
        {
          left: safe.left + spacing.md,
          right: safe.right + spacing.md,
          ...(landscape ? { top: Math.max(barBottom, safe.top) + spacing.sm } : { bottom: safe.bottom + PROMPT_LIFT.portrait }),
          opacity: pop,
          transform: [{ translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [landscape ? -16 : 16, 0] }) }],
        },
      ]}>
      <View style={styles.card}>
        <View style={styles.head}>
          <View style={styles.emblem}>
            <Icon name={info.icon} size={18} color={colors.gold} />
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
const AVATAR = 44;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', alignItems: 'center' },
  card: {
    width: '100%', maxWidth: 380, padding: spacing.md, gap: spacing.md, borderRadius: radius.lg,
    backgroundColor: 'rgba(18,14,40,0.88)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  emblem: {
    width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.55)', backgroundColor: 'rgba(233,196,106,0.08)',
  },
  titles: { flex: 1, gap: 2 },
  title: { fontFamily: SERIF, fontSize: 19, color: colors.textPrimary, letterSpacing: 0.3 },
  line: { ...typography.caption, color: colors.textMuted },
  coinLine: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  cta: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  ctaText: { ...typography.bodyStrong, color: INK, maxWidth: 150 },
  pressed: { opacity: 0.75 },
  faces: { flexDirection: 'row', justifyContent: 'space-around' },
  face: { alignItems: 'center', gap: 4, width: 72 },
  avatar: { width: AVATAR, height: AVATAR, borderRadius: AVATAR / 2, borderWidth: 1.5, borderColor: 'rgba(233,196,106,0.7)' },
  faceName: { ...typography.caption, color: colors.textPrimary },
  titleWrap: { ...absoluteFill, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  rule: { width: 56, height: StyleSheet.hairlineWidth, backgroundColor: colors.gold },
  doorTitle: {
    fontFamily: SERIF, fontSize: 28, color: colors.textPrimary, letterSpacing: 2,
    textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 8, textShadowOffset: { width: 0, height: 1 },
  },
});
