import React, { useMemo, useState } from 'react';
import { Image, LayoutRectangle, Pressable, ScrollView, StyleSheet, Switch, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon, IconName } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { useScreen } from '../../../shared/device/screen';
import { sfx } from '../../../shared/audio/sfx';
import { useSoundStore } from '../../../shared/audio/store';
import { localizeCounselors } from '../../counselors/data/mockCounselors';
import { speakingPlayable } from '../../counselors/data/registry';
import type { CounselorSummary } from '../../counselors/types';
import type { WorldZone } from '../../counseling/types';
import { MEDITATION_CHIPS, SHOP_TABS, WORLD_ZONES, koWith, zoneInfo } from '../data/zones';
import { MYROOM_PICTURE } from '../../myroom/picture';

/** Where the World's top bar ends (points from the screen top). A landscape sheet starts below it:
 *  from the top it ran its title into "2D / Prayers World". */
export const WorldSheetTop = React.createContext(0);

/**
 * The 2D layer over the 3D world (spec 004, mockup ④): one sheet shape for the doors' entrance
 * overlays and for the Map / Quest / Menu buttons.
 *
 * PORTRAIT it rises from the bottom over the lower part of the world, the way the mockup draws it;
 * LANDSCAPE it is the right-hand panel every 3D screen uses (`useScreen().sidePanel`), so the world
 * keeps the left of the screen. Its background runs to the screen edge and only its content keeps
 * clear of the island and the home indicator — the safe area is applied per piece (JourneyScreen).
 */
export const WorldSheet: React.FC<{
  title: string;
  line?: string;
  onClose: () => void;
  /** The sheet's box in the screen, for VIEW_INSETS; null when it goes. */
  onRect?: (rect: LayoutRectangle | null) => void;
  testID?: string;
  children: React.ReactNode;
}> = ({ title, line, onClose, onRect, testID, children }) => {
  const t = useT();
  const screen = useScreen();
  const safe = useSafeAreaInsets();
  const landscape = screen.landscape;
  const barBottom = React.useContext(WorldSheetTop);
  React.useEffect(() => () => onRect?.(null), [onRect]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none" testID={testID}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('world.close')} />
      <View
        onLayout={e => onRect?.(e.nativeEvent.layout)}
        style={[
          styles.sheet,
          landscape
            ? [styles.sheetSide, { top: barBottom, width: screen.sidePanel + safe.right, paddingRight: safe.right + spacing.lg, paddingTop: spacing.md, paddingBottom: safe.bottom + spacing.md }]
            : [styles.sheetBottom, { maxHeight: screen.vh(0.66, 320, 600), paddingBottom: safe.bottom + spacing.lg }],
        ]}>
        <View style={styles.head}>
          <View style={styles.headText}>
            <Text style={styles.title}>{title}</Text>
            {line ? <Text style={styles.line}>{line}</Text> : null}
          </View>
          <Pressable hitSlop={12} onPress={() => { sfx.back(); onClose(); }} accessibilityRole="button" accessibilityLabel={t('world.close')}>
            <Icon name="close" size={20} color={colors.textSecondary} />
          </Pressable>
        </View>
        <ScrollView style={styles.scroll} bounces={false} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
      </View>
    </View>
  );
};

/** The gold call to action of every overlay ("상담하기 →", "기차에 탑승하기 →"). */
const Cta: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={() => { sfx.select(); onPress(); }}
    style={({ pressed }) => [styles.cta, pressed && styles.pressed]}>
    <Text style={styles.ctaText}>{label}</Text>
  </Pressable>
);

const Secondary: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={() => { sfx.tap(); onPress(); }}
    style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
    <Text style={styles.secondaryText}>{label}</Text>
  </Pressable>
);

/** A square tile with an icon and a word: the meditation sessions and the shop's aisles. */
const Tile: React.FC<{ icon: IconName; label: string; note?: string; onPress?: () => void }> = ({ icon, label, note, onPress }) => (
  <Pressable
    disabled={!onPress}
    accessibilityRole={onPress ? 'button' : undefined}
    accessibilityLabel={label}
    onPress={onPress ? () => { sfx.tap(); onPress(); } : undefined}
    style={({ pressed }) => [styles.tile, pressed && styles.pressed]}>
    <Icon name={icon} size={22} color={colors.gold} />
    <Text style={styles.tileText} numberOfLines={1}>{label}</Text>
    {note ? <Text style={styles.tileNote} numberOfLines={1}>{note}</Text> : null}
  </Pressable>
);

/**
 * Who the 상담의 방 offers: the counsellors who can hold a consultation, the four with a 3D room
 * first (the roster's own order otherwise). The meditation guide is not here — she has her own door.
 */
export function counselingRoster(lang: Parameters<typeof localizeCounselors>[0]): CounselorSummary[] {
  const roomed = new Set(speakingPlayable.map(c => c.characterId));
  const open = localizeCounselors(lang).filter(c => c.category !== 'meditation' && !c.comingSoon);
  return [...open.filter(c => roomed.has(c.characterId)), ...open.filter(c => !roomed.has(c.characterId))];
}

export interface ZoneActions {
  /** 상담하기 → with this counsellor: the Home card's path (CounselorDetail). */
  counsel(c: CounselorSummary): void;
  /** 상담사 둘러보기 → the counsellor list. */
  browse(): void;
  meditate(): void;
  /** Board (or resume) the 2027 journey. */
  journey(): void;
  coins(): void;
  /** 들어가기 → into My Room. */
  myroom(): void;
}

/** The entrance overlay of one door — what WORLD_ARRIVED (or Enter) opens. */
export const ZoneOverlay: React.FC<{
  zone: WorldZone;
  journeyYear: number;
  journeyRunning: boolean;
  actions: ZoneActions;
  onClose: () => void;
  onRect?: (rect: LayoutRectangle | null) => void;
}> = ({ zone, journeyYear, journeyRunning, actions, onClose, onRect }) => {
  const t = useT();
  const lang = useLang();
  const roster = useMemo(() => counselingRoster(lang), [lang]);
  const [picked, setPicked] = useState(0);
  const chosen = roster[Math.min(picked, roster.length - 1)];
  const info = zoneInfo(zone);
  const sheet = (title: string, line: string | undefined, body: React.ReactNode) => (
    <WorldSheet title={title} line={line} onClose={onClose} onRect={onRect} testID={`world-overlay-${zone}`}>
      {body}
    </WorldSheet>
  );

  switch (zone) {
    case 'counseling':
      return sheet(
        t(info.label),
        chosen ? t('world.counsel.line', { name: lang === 'ko' ? koWith(chosen.name) : chosen.name }) : undefined,
        <>
          {roster.map((c, i) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected: c === chosen }}
              accessibilityLabel={c.name}
              onPress={() => { sfx.tap(); setPicked(i); }}
              style={[styles.counselor, c === chosen && styles.counselorOn]}>
              {c.avatarImage ? <Image source={c.avatarImage} style={styles.avatar} /> : <View style={[styles.avatar, { backgroundColor: c.accent }]} />}
              <View style={styles.counselorBody}>
                <Text style={styles.counselorName}>{c.name}</Text>
                <View style={styles.tags}>
                  {c.specialties.slice(0, 3).map(s => (
                    <Text key={s} style={styles.tag}>{s}</Text>
                  ))}
                </View>
              </View>
              <Icon name="next" size={14} color={c === chosen ? colors.gold : colors.textMuted} />
            </Pressable>
          ))}
          {chosen ? <Cta label={t('world.counsel.cta')} onPress={() => actions.counsel(chosen)} /> : null}
          <Secondary label={t('world.counsel.browse')} onPress={actions.browse} />
        </>,
      );
    case 'meditation':
      return sheet(
        t(info.label),
        t('world.med.line'),
        <>
          <View style={styles.tiles}>
            {MEDITATION_CHIPS.map(chip => (
              <Tile key={chip.key} icon={chip.icon} label={t(chip.key)} onPress={actions.meditate} />
            ))}
          </View>
          <Cta label={t('world.med.cta')} onPress={actions.meditate} />
        </>,
      );
    case 'journey':
      return sheet(
        t(info.label),
        t('world.zone.journey.sub', { year: journeyYear }),
        <>
          <View style={styles.bubble}>
            <Text style={styles.bubbleText}>{t('world.journey.line', { year: journeyYear })}</Text>
          </View>
          <Cta label={journeyRunning ? t('world.journey.resume') : t('world.journey.cta')} onPress={actions.journey} />
        </>,
      );
    case 'shop':
      return sheet(
        t(info.label),
        t('world.shop.line'),
        <>
          <View style={styles.tiles}>
            {SHOP_TABS.map(tab => (
              <Tile key={tab.key} icon={tab.icon} label={t(tab.key)} note={t('world.soon')} />
            ))}
          </View>
          <Cta label={t('world.shop.coins')} onPress={actions.coins} />
        </>,
      );
    case 'myroom':
      // The mockup's card: the room itself, one line, and the way in.
      return sheet(
        t('world.myroom.title'),
        t('world.myroom.line'),
        <>
          <Image source={MYROOM_PICTURE.landscape} style={styles.roomPicture} resizeMode="cover" accessibilityIgnoresInvertColors />
          <Cta label={t('world.myroom.cta')} onPress={actions.myroom} />
        </>,
      );
  }
};

/** Map: the five doors. A row asks Unity to walk the player there (WORLD_GOTO). */
export const MapSheet: React.FC<{
  journeyYear: number;
  onGo: (zone: WorldZone) => void;
  onClose: () => void;
  onRect?: (rect: LayoutRectangle | null) => void;
}> = ({ journeyYear, onGo, onClose, onRect }) => {
  const t = useT();
  return (
    <WorldSheet title={t('world.map.title')} onClose={onClose} onRect={onRect} testID="world-sheet-map">
      {WORLD_ZONES.map(z => (
        <Pressable
          key={z.id}
          accessibilityRole="button"
          accessibilityLabel={t(z.label)}
          onPress={() => { sfx.tap(); onGo(z.id); }}
          style={({ pressed }) => [styles.mapRow, pressed && styles.pressed]}>
          <View style={styles.mapIcon}><Icon name={z.icon} size={20} color={colors.gold} /></View>
          <View style={styles.counselorBody}>
            <Text style={styles.counselorName}>{t(z.label)}</Text>
            <Text style={styles.mapSub}>{t(z.sub, { year: journeyYear })}</Text>
          </View>
          <Icon name="next" size={14} color={colors.textMuted} />
        </Pressable>
      ))}
    </WorldSheet>
  );
};

/** Quest: out of scope this round (spec 004) — said plainly, not a dead button. */
export const QuestSheet: React.FC<{ onClose: () => void; onRect?: (rect: LayoutRectangle | null) => void }> = ({ onClose, onRect }) => {
  const t = useT();
  return (
    <WorldSheet title={t('world.quest.title')} onClose={onClose} onRect={onRect} testID="world-sheet-quest">
      <View style={styles.soonCard}>
        <Icon name="quest" size={28} color={colors.gold} />
        <Text style={styles.soonTitle}>{t('world.soon')}</Text>
        <Text style={styles.soonBody}>{t('world.quest.line')}</Text>
      </View>
    </WorldSheet>
  );
};

/** Menu: the two sound switches (the same settings as My Page) and the way back to 2D. */
export const MenuSheet: React.FC<{
  onTo2D: () => void;
  onClose: () => void;
  onRect?: (rect: LayoutRectangle | null) => void;
}> = ({ onTo2D, onClose, onRect }) => {
  const t = useT();
  const music = useSoundStore(s => s.musicEnabled);
  const setMusic = useSoundStore(s => s.setMusicEnabled);
  const fx = useSoundStore(s => s.sfxEnabled);
  const setFx = useSoundStore(s => s.setSfxEnabled);
  const toggle = (label: string, value: boolean, set: (v: boolean) => void) => (
    <View style={styles.toggle}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={set}
        trackColor={{ false: 'rgba(255,255,255,0.18)', true: colors.gold }}
        thumbColor={colors.textPrimary}
        ios_backgroundColor="rgba(255,255,255,0.18)"
      />
    </View>
  );
  return (
    <WorldSheet title={t('world.menu.title')} onClose={onClose} onRect={onRect} testID="world-sheet-menu">
      {toggle(t('world.menu.music'), music, setMusic)}
      {toggle(t('my.sfx'), fx, setFx)}
      <Secondary label={t('world.menu.to2d')} onPress={onTo2D} />
    </WorldSheet>
  );
};

const styles = StyleSheet.create({
  backdrop: { ...absoluteFill, backgroundColor: 'rgba(5,4,20,0.25)' },
  // No left/right here: Fabric's style merge drops an `undefined`, so `left: undefined` in the side
  // style could not take back a `left: 0` set here — the landscape sheet stood on the LEFT, under the
  // Dynamic Island, and VIEW_INSETS called the whole width covered (sim QA 05-10).
  sheet: {
    position: 'absolute', bottom: 0,
    paddingTop: spacing.lg, paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(14,11,34,0.94)',
    borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
    borderTopWidth: 1, borderColor: 'rgba(233,196,106,0.3)',
  },
  sheetBottom: { left: 0, right: 0 },
  sheetSide: {
    right: 0,
    paddingLeft: spacing.lg,
    borderTopRightRadius: 0, borderTopLeftRadius: radius.xl, borderBottomLeftRadius: radius.xl,
    borderTopWidth: 0, borderLeftWidth: 1,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md },
  headText: { flex: 1, gap: spacing.xs },
  title: { ...typography.h2, color: colors.gold },
  line: { ...typography.body, color: colors.textSecondary },
  scroll: { flexGrow: 0 },
  counselor: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    padding: spacing.md, marginBottom: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', backgroundColor: 'rgba(255,255,255,0.04)',
  },
  counselorOn: { borderColor: 'rgba(233,196,106,0.7)', backgroundColor: 'rgba(233,196,106,0.08)' },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  counselorBody: { flex: 1, gap: spacing.xs },
  counselorName: { ...typography.h3, color: colors.textPrimary },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  tag: {
    ...typography.tiny, color: colors.textSecondary,
    paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  cta: {
    marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.gold, alignItems: 'center',
  },
  ctaText: { ...typography.bodyStrong, color: '#1A1330' },
  secondary: {
    marginTop: spacing.sm, paddingVertical: spacing.md, borderRadius: radius.pill,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)', alignItems: 'center',
  },
  secondaryText: { ...typography.bodyStrong, color: colors.textPrimary },
  tiles: { flexDirection: 'row', gap: spacing.sm },
  tile: {
    flex: 1, alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
    borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.25)',
  },
  tileText: { ...typography.tiny, color: colors.textPrimary },
  tileNote: { ...typography.tiny, color: colors.textMuted, fontWeight: '500' },
  bubble: {
    alignSelf: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.md,
    borderRadius: radius.pill, backgroundColor: 'rgba(255,255,255,0.92)',
  },
  bubbleText: { ...typography.bodyStrong, color: '#1A1330' },
  soonCard: {
    alignItems: 'center', gap: spacing.sm, padding: spacing.xl,
    borderRadius: radius.lg, backgroundColor: 'rgba(233,196,106,0.08)',
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.35)',
  },
  soonTitle: { ...typography.h3, color: colors.textPrimary },
  soonBody: { ...typography.caption, color: colors.textSecondary, textAlign: 'center' },
  roomPicture: {
    width: '100%', aspectRatio: 1200 / 552, borderRadius: radius.md,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.3)',
  },
  mapRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.1)',
  },
  mapIcon: {
    width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.goldDim,
  },
  mapSub: { ...typography.caption, color: colors.textSecondary },
  toggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.md },
  toggleLabel: { ...typography.body, color: colors.textPrimary },
  pressed: { opacity: 0.75 },
});
