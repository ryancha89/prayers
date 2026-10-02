import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutRectangle, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon, IconName } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import type { RootStackParamList } from '../../../navigation/types';
import { UnityHost } from '../../counseling/components/UnityHost';
import { WorldJoystick } from '../components/WorldJoystick';
import { PromptButton } from '../components/PromptButton';
import { getWorldBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import type { WorldInitPayload, WorldZone } from '../../counseling/types';
import { CoinPill } from '../../coins/components/CoinPill';
import { useCoins } from '../../coins/store/coinStore';
import { openCounselor } from '../../counselors/openCounselor';
import { NEWYEAR_2027, journeyEntryRoute } from '../../journey/data/journeys';
import { journeyActive, useJourneyPlayer } from '../../journey/player/journeyPlayer';
import { useWorldStore } from '../store/worldStore';
import { isWorldZone } from '../data/zones';
import { WorldHubArt } from '../components/WorldHubArt';
import { MapSheet, MenuSheet, QuestSheet, ZoneOverlay, type ZoneActions } from '../components/WorldSheets';
import { useWorldCamera } from '../components/useWorldCamera';
import { useSoundStore } from '../../../shared/audio/store';

type Nav = NativeStackNavigationProp<RootStackParamList>;

/**
 * Back from a room, the world's UnityView is only mounted again once the room's own has gone.
 * `transitionEnd` is the signal; this is the backstop for a navigator that never sends one.
 */
export const HOST_REMOUNT_FALLBACK_MS = 700;

/**
 * Into a room, the next screen's UnityView is only mounted this long (worldTiming.hostReleaseMs; 0 in tests that are not about it) after the world's went. The
 * native teardown of an unmounted UnityView runs after the JS commit; a room host mounted in the
 * same beat had the engine paused under it — on the simulator (02-10) My Room sent five MYROOM_INITs
 * into a frozen player, and the scene only loaded 45 s later when the world's host came back.
 */
export const worldTiming = { hostReleaseMs: 450 };

/**
 * What of the world the screen's UI hides, for VIEW_INSETS: the top bar always, and an open sheet —
 * from the bottom in portrait, down the right in landscape. The walk keys and the round buttons float
 * in the corners and are not counted: the player walks behind them, the camera does not frame
 * around them. Exported for the layout test.
 */
export function worldCoveredPx(r: MeasuredRects, landscape: boolean) {
  const { host, top, sheet } = r;
  if (!host) return null;
  const covered = { top: top ? top.y + top.height : 0 };
  if (!sheet) return covered;
  return landscape ? { ...covered, right: host.width - sheet.x } : { ...covered, bottom: host.height - sheet.y };
}

/**
 * The 3D world (spec 004): walk the Prayers sanctuary and go in through its doors.
 *
 * UNITY IS THE WORLD, RN IS EVERYTHING YOU TOUCH. The player, the plaza, the floating door labels
 * (and a tap on one) are Unity's; the walk keys, run, Map / Quest / Menu, Enter and every entrance
 * overlay are this screen's — the line the consultation room drew (WalkControls explains why).
 *
 * THE HOST IS DOWN WHILE THE PLAYER IS IN A ROOM. Every door leads to a screen that mounts its own
 * UnityView (the cabin, the meditation room, the consultation), and unmounting a UnityView unloads
 * the engine — so two mounted at once means one of them unloads the other's. Going in, this screen
 * unmounts its host FIRST and only then navigates (`leaveTo`); coming back it waits for the room's
 * screen to be gone (`transitionEnd`) before mounting its host again, which boots the world at the
 * door the player left by (WORLD_INIT.zone). A rotation changes styles only — the host stays at the
 * same place in the tree whichever way up the phone is, because a remount reloads the world.
 *
 * WITHOUT THE PLAYER (jest, a build with no Unity framework) the drawn hub stands in for the world:
 * its door labels open the same overlays, and Map "arrives" at once (MockUnityBridge), so every 2D
 * path out of the world can be walked.
 */
export const WorldScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const screen = useScreen();
  const landscape = screen.landscape;
  // Per piece, not a SafeAreaView round the screen: the world runs under the island and the home
  // indicator; only the controls keep clear of them (JourneyScreen, 01-10).
  const safe = useSafeAreaInsets();
  const unity = isNativeUnity();
  const bridge = getWorldBridge();

  const [hostOn, setHostOn] = useState(true);
  const [worldUp, setWorldUp] = useState(false);
  const [near, setNear] = useState<WorldZone | null>(null);
  const [overlay, setOverlay] = useState<WorldZone | null>(null);
  const [sheet, setSheet] = useState<'map' | 'quest' | 'menu' | null>(null);
  const [run, setRun] = useState(false);
  const journeyRunning = useJourneyPlayer(s => journeyActive(s) && s.journeyId === NEWYEAR_2027.id);
  // The Menu's music / sound switches also reach the world's own audio (Unity): sent on every change,
  // and the bridge replays the last value when the hub comes up.
  const musicOn = useSoundStore(s => s.musicEnabled);
  const sfxOn = useSoundStore(s => s.sfxEnabled);
  useEffect(() => { bridge.sendWorldAudio(musicOn, sfxOn); }, [bridge, musicOn, sfxOn]);

  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: r => worldCoveredPx(r, landscape),
  });
  const putSheet = useCallback((rect: LayoutRectangle | null) => insets.put('sheet', rect), [insets]);

  // What Unity says, for the whole life of the screen — not of the host: a WORLD_POSITION can land
  // while the host is on its way down, and that is exactly the one worth keeping.
  useEffect(() => {
    const off = bridge.onEvent(e => {
        switch (e.type) {
          case 'WORLD_READY':
            setWorldUp(true);
            // The door has been used; the next visit starts from the saved spot.
            useWorldStore.getState().setReturnZone(null);
            break;
          case 'WORLD_NEAR':
            if (!isWorldZone(e.payload?.zone)) break;
            if (e.payload.near) setNear(e.payload.zone);
            else setNear(cur => (cur === e.payload.zone ? null : cur));
            break;
          case 'WORLD_ARRIVED':
            if (!isWorldZone(e.payload?.zone)) break;
            setSheet(null);
            setOverlay(e.payload.zone);
            break;
          case 'WORLD_POSITION':
            useWorldStore.getState().setPosition(e.payload);
            break;
        }
    });
    return () => {
      off();
      // Out of the world altogether (2D): a door not yet used must not decide the next visit's spawn.
      useWorldStore.getState().setReturnZone(null);
    };
  }, [bridge]);

  // Open the world whenever the host is up; close it when it goes. Spawn comes from the store, read
  // once it has been read back from the phone — opening before that would always start on the plaza.
  useEffect(() => {
    if (!hostOn) return undefined;
    let cancelled = false;
    const open = () => {
      if (cancelled) return;
      const { position, returnZone } = useWorldStore.getState();
      const init: WorldInitPayload = { lang, spawn: position };
      if (returnZone) init.zone = returnZone;
      bridge.openWorld(init);
    };
    const persist = useWorldStore.persist;
    let unsub: (() => void) | undefined;
    if (!persist || persist.hasHydrated()) open();
    else unsub = persist.onFinishHydration(open);
    return () => {
      cancelled = true;
      unsub?.();
      bridge.closeWorld();
      setWorldUp(false);
      setNear(null);
      setRun(false);
    };
    // `lang` is read at open time only: a language change mid-walk is not worth reloading the world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostOn, bridge]);

  // Back from a room: mount the host again once the room's screen (and its UnityView) has gone.
  // Keyed on whether the host is down, not on "not the first focus": whether the initial focus event
  // reaches a listener added in an effect is the navigator's business, and a host that is up needs
  // nothing either way.
  const hostUp = useRef(hostOn);
  hostUp.current = hostOn;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let waiting = false;
    const remount = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      waiting = false;
      setHostOn(true);
    };
    const offFocus = navigation.addListener('focus', () => {
      if (hostUp.current || waiting) return;
      waiting = true;
      timer = setTimeout(remount, HOST_REMOUNT_FALLBACK_MS);
    });
    const offEnd = navigation.addListener('transitionEnd', (e: { data?: { closing?: boolean } }) => {
      if (waiting && !e?.data?.closing) remount();
    });
    // The backstop for a way out that did not go through leaveTo: drop the world, never leave two
    // UnityViews mounted.
    const offBlur = navigation.addListener('blur', () => setHostOn(false));
    return () => {
      if (timer) clearTimeout(timer);
      offFocus();
      offEnd();
      offBlur();
    };
  }, [navigation]);

  /**
   * Into a room: remember the door, take the host down, THEN navigate — see the class comment. The
   * navigation runs from an effect so it happens after the commit that unmounted the UnityView.
   */
  const pendingNav = useRef<(() => void) | null>(null);
  const [leaving, setLeaving] = useState(0);
  const leaveTo = useCallback((zone: WorldZone, go: () => void) => {
    useWorldStore.getState().setReturnZone(zone);
    setOverlay(null);
    setSheet(null);
    setHostOn(false);
    pendingNav.current = go;
    setLeaving(n => n + 1);
  }, []);
  useEffect(() => {
    const go = pendingNav.current;
    if (!go || hostOn) return;
    pendingNav.current = null;
    // Native-side teardown first (HOST_RELEASE_MS); with no player in the build there is none.
    if (!unity || worldTiming.hostReleaseMs <= 0) { go(); return undefined; }
    const timer = setTimeout(go, worldTiming.hostReleaseMs);
    return () => clearTimeout(timer);
  }, [leaving, hostOn, unity]);

  const to2D = useCallback(() => {
    sfx.back();
    navigation.navigate('Tabs', { screen: 'Home' });
  }, [navigation]);

  const actions: ZoneActions = {
    counsel: c => leaveTo('counseling', () => openCounselor(navigation, c)),
    browse: () => navigation.navigate('Tabs', { screen: 'Home' }),
    meditate: () => leaveTo('meditation', () => navigation.navigate('MeditationRoom')),
    journey: () =>
      leaveTo('journey', () => {
        if (journeyRunning) navigation.navigate('Journey');
        else navigation.navigate(journeyEntryRoute(NEWYEAR_2027), { journeyId: NEWYEAR_2027.id });
      }),
    // The shop sheet floats over every screen (App.tsx): the world stays where it is under it.
    coins: () => useCoins.getState().openShop(),
    myroom: () => leaveTo('myroom', () => navigation.navigate('MyRoom')),
  };

  const goTo = (zone: WorldZone) => {
    setSheet(null);
    // With a world to walk, Unity walks there and answers WORLD_ARRIVED. A world still loading has
    // no NavMesh yet: open the door's overlay straight away rather than drop the request.
    if (unity && !worldUp) setOverlay(zone);
    else bridge.sendWorldGoto(zone);
  };

  const toggleRun = () => {
    sfx.tap();
    const on = !run;
    setRun(on);
    bridge.sendWorldRun(on);
  };

  const lookOn = hostOn && worldUp && !overlay && !sheet;
  const camera = useWorldCamera(lookOn);
  const busy = overlay != null || sheet != null;
  // While the 3D world loads there is nothing to walk: no stick, no run (02-10 screenshot: they
  // floated over the old drawing). Map stays — a door picked while loading opens at once.
  const loadingWorld = unity && !worldUp;

  return (
    <View style={styles.stage} onLayout={insets.track('host')}>
      {/* Never hidden or faded, and never inside a transparent parent: an embedded UnityView in one
          stops drawing (meditation room, measured on device). */}
      {unity && hostOn && <UnityHost style={styles.unity} />}
      {(!unity || !worldUp) && (
        <WorldHubArt
          onZone={unity ? undefined : setOverlay}
          caption={unity ? t('world.loading') : undefined}
        />
      )}
      {/* The look-around layer: transparent, over the Unity view, under every control. A touch on
          the UnityView itself never reaches RN (useWorldCamera says why); taps are handed on. */}
      {unity && lookOn && <View style={StyleSheet.absoluteFill} testID="world-look" {...camera} />}

      <View
        style={[styles.top, { paddingTop: safe.top + spacing.sm, paddingLeft: safe.left + spacing.lg, paddingRight: safe.right + spacing.lg }]}
        onLayout={insets.track('top')}>
        <Pressable
          hitSlop={8}
          onPress={to2D}
          accessibilityRole="button"
          accessibilityLabel={t('world.toHome')}
          style={({ pressed }) => [styles.to2d, pressed && styles.pressed]}>
          <Icon name="home" size={16} color={colors.textPrimary} />
          <Text style={styles.to2dText}>2D</Text>
        </Pressable>
        <View style={styles.titleBox}>
          <Text style={styles.title} numberOfLines={1}>{t('world.title')}</Text>
          {!landscape && <Text style={styles.subtitle} numberOfLines={1}>{t('world.subtitle')}</Text>}
        </View>
        <CoinPill />
      </View>

      {/* The analogue stick, bottom-left (mockup ②–③): WALK_INPUT, the message the world mover reads. */}
      <View
        pointerEvents="box-none"
        style={[styles.stick, { left: safe.left + spacing.xs, bottom: safe.bottom + spacing.xs }]}>
        <WorldJoystick visible={!busy && !loadingWorld} />
      </View>

      {!busy && (
        <View
          pointerEvents="box-none"
          style={[styles.buttons, { right: safe.right + spacing.lg, bottom: safe.bottom + spacing.lg }]}>
          {!loadingWorld && <Pressable
            onPress={toggleRun}
            accessibilityRole="button"
            accessibilityLabel={t('world.run')}
            accessibilityState={{ selected: run }}
            style={({ pressed }) => [styles.run, run && styles.runOn, pressed && styles.pressed]}>
            <Icon name="run" size={26} color={run ? '#1A1330' : colors.textPrimary} />
          </Pressable>}
          <View style={styles.round3}>
            <RoundButton icon="map" label={t('world.map')} onPress={() => setSheet('map')} />
            <RoundButton icon="quest" label={t('world.quest')} onPress={() => setSheet('quest')} />
            <RoundButton icon="menu" label={t('world.menu')} onPress={() => setSheet('menu')} />
          </View>
        </View>
      )}

      {/* Enter pops in when a door is near (re-pops for the next door); the room's Talk is the same
          pill. */}
      {near && !busy && <PromptButton label={t('world.enter')} popKey={near} onPress={() => setOverlay(near)} />}

      {overlay && (
        <ZoneOverlay
          zone={overlay}
          journeyYear={NEWYEAR_2027.year}
          journeyRunning={journeyRunning}
          actions={actions}
          onClose={() => setOverlay(null)}
          onRect={putSheet}
        />
      )}
      {sheet === 'map' && <MapSheet journeyYear={NEWYEAR_2027.year} onGo={goTo} onClose={() => setSheet(null)} onRect={putSheet} />}
      {sheet === 'quest' && <QuestSheet onClose={() => setSheet(null)} onRect={putSheet} />}
      {sheet === 'menu' && <MenuSheet onTo2D={to2D} onClose={() => setSheet(null)} onRect={putSheet} />}
    </View>
  );
};

const RoundButton: React.FC<{ icon: IconName; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable
    onPress={() => { sfx.tap(); onPress(); }}
    accessibilityRole="button"
    accessibilityLabel={label}
    style={({ pressed }) => [styles.round, pressed && styles.pressed]}>
    <Icon name={icon} size={18} color={colors.textPrimary} />
    <Text style={styles.roundText} numberOfLines={1}>{label}</Text>
  </Pressable>
);

const ROUND = 50;

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0B0A26' },
  unity: { ...absoluteFill },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingBottom: spacing.sm,
  },
  to2d: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.8)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.6)',
  },
  to2dText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  titleBox: { flex: 1 },
  title: { ...typography.h3, color: colors.textPrimary },
  subtitle: { ...typography.tiny, color: 'rgba(255,255,255,0.75)', fontWeight: '500' },
  stick: { position: 'absolute' },
  buttons: { position: 'absolute', alignItems: 'flex-end', gap: spacing.md },
  run: {
    width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(18,14,40,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)',
  },
  runOn: { backgroundColor: colors.gold, borderColor: colors.gold },
  round3: { flexDirection: 'row', gap: spacing.sm },
  round: {
    width: ROUND, height: ROUND, borderRadius: ROUND / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(18,14,40,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)',
  },
  roundText: { fontSize: 9, fontWeight: '600', color: colors.textPrimary, marginTop: 1 },
  pressed: { opacity: 0.75 },
});
