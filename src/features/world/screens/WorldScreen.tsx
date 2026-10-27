import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, LayoutRectangle, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { absoluteFill, spacing } from '../../../shared/theme';
import { HUD_ICON, ProfileBadge, RING_COMPACT, RingButton, badgeMaxWidth } from '../../../shared/components/hud/Hud';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import type { RootStackParamList } from '../../../navigation/types';
import { UnityHost } from '../../counseling/components/UnityHost';
import { WorldJoystick } from '../components/WorldJoystick';
import { DoorCard, DoorTitle } from '../components/DoorCard';
import { getWorldBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import { playerCharacter, playerHair, playerGender } from '../../counseling/bridge/playerGender';
import type { WorldInitPayload, WorldZone } from '../../counseling/types';
import { CoinPill } from '../../coins/components/CoinPill';
import { useCoins } from '../../coins/store/coinStore';
import { openCounselor } from '../../counselors/openCounselor';
import { NEWYEAR_2027, journeyEntryRoute } from '../../journey/data/journeys';
import { journeyActive, useJourneyPlayer } from '../../journey/player/journeyPlayer';
import { useWorldStore } from '../store/worldStore';
import { isWorldZone } from '../data/zones';
import { WorldHubArt } from '../components/WorldHubArt';
import { MapSheet, MenuSheet, QuestSheet, WorldSheetTop, ZoneOverlay, type ZoneActions } from '../components/WorldSheets';
import { useWorldCamera } from '../components/useWorldCamera';
import { useSoundStore } from '../../../shared/audio/store';
import { ProfileSheet, useMyRoomLevel, usePlayerName } from '../../myroom/components/ProfileSheet';
import { fetchAttendance } from '../../tickets/api/attendance';
import type { CounselorSummary } from '../../counselors/types';
import { beginSceneTransition } from '../../../shared/transition/sceneTransition';

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
export const worldTiming = {
  hostReleaseMs: 450,
  /**
   * How long a door is waited on (Enter, or Unity's own WORLD_ARRIVED) before its card opens anyway.
   * Unity's walk through a door — approach, the swing, the step in, the fade — measured 1.7–5.8 s in
   * the play smoke (06-10); a player that never answers must not leave the screen empty for long.
   */
  enterFallbackMs: 9000,
};

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
  if (!landscape) return { ...covered, bottom: host.height - sheet.y };
  // The side it actually stands on, not the side it is meant to: a sheet on the left reported as
  // `right: host.width - 0` told Unity the whole view was covered (sim QA 05-10).
  return sheet.x + sheet.width / 2 < host.width / 2
    ? { ...covered, left: sheet.x + sheet.width }
    : { ...covered, right: host.width - sheet.x };
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
 * DOORS OPEN (06-10, spec 004 "Enter opens the door"). Enter sends WORLD_ENTER and the screen shows
 * nothing over the world — no stick, no Enter, no buttons — while Unity walks the player to the door,
 * opens it and walks him through; WORLD_ENTERED then goes straight to that door's screen (since
 * 12-10; it used to open the zone's card over the world). Unity runs the same walk by itself when the player walks into a
 * doorway or an auto-walk arrives, so WORLD_ARRIVED is now only "a door is opening": wait for ENTERED.
 * Either wait ends in the card if ENTERED never comes (worldTiming.enterFallbackMs).
 *
 * WITHOUT THE PLAYER (jest, a build with no Unity framework) the drawn hub stands in for the world:
 * its door labels open the same overlays, and Map "arrives" at once (MockUnityBridge), so every 2D
 * path out of the world can be walked.
 */
export const WorldScreen: React.FC = () => {
  // The shared loading screen (picture, intro, tip) until this place's READY — sceneTransition.ts.
  useEffect(() => { beginSceneTransition('world'); }, []);
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
  const [sheet, setSheet] = useState<'map' | 'quest' | 'menu' | 'profile' | null>(null);
  const [run, setRun] = useState(false);
  // The door Unity is walking the player through (WORLD_ENTER sent, or ARRIVED seen), until ENTERED.
  const [entering, setEntering] = useState<WorldZone | null>(null);
  const enterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearEnterTimer = useCallback(() => {
    if (enterTimer.current) clearTimeout(enterTimer.current);
    enterTimer.current = null;
  }, []);
  const journeyRunning = useJourneyPlayer(s => journeyActive(s) && s.journeyId === NEWYEAR_2027.id);
  // The Menu's music / sound switches also reach the world's own audio (Unity): sent on every change,
  // and the bridge replays the last value when the hub comes up.
  const musicOn = useSoundStore(s => s.musicEnabled);
  const sfxOn = useSoundStore(s => s.sfxEnabled);
  useEffect(() => { bridge.sendWorldAudio(musicOn, sfxOn); }, [bridge, musicOn, sfxOn]);

  // The badge: the same name, level and title as My Room's (myroom/level.ts). The level counts every
  // check-in ever, which only the server knows; until it answers the level counts the rest.
  const playerName = usePlayerName();
  const [checkIns, setCheckIns] = useState<number | null>(null);
  useEffect(() => {
    const ac = new AbortController();
    fetchAttendance(ac.signal).then(a => { if (a && !ac.signal.aborted) setCheckIns(a.daysTotal); });
    return () => ac.abort();
  }, []);
  const level = useMyRoomLevel(checkIns);

  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: r => worldCoveredPx(r, landscape),
  });
  const putSheet = useCallback((rect: LayoutRectangle | null) => insets.put('sheet', rect), [insets]);
  // Where the top bar ends: a landscape sheet starts under it (WorldSheetTop).
  const [barBottom, setBarBottom] = useState(0);
  const trackTop = insets.track('top');
  const onTopLayout = useCallback((e: LayoutChangeEvent) => {
    trackTop(e);
    const { y, height } = e.nativeEvent.layout;
    setBarBottom(Math.round(y + height));
  }, [trackTop]);

  // The door handlers the event subscription below calls — reassigned every render (they need the
  // render's leaveTo), read through a ref so the subscription itself never has to be renewed.
  const door = useRef({ wait: (_zone: WorldZone) => {}, entered: (_zone: WorldZone) => {} });

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
            // The door is opening (Unity walks him in on its own): wait for ENTERED.
            if (!isWorldZone(e.payload?.zone)) break;
            door.current.wait(e.payload.zone);
            break;
          case 'WORLD_ENTERED':
            if (!isWorldZone(e.payload?.zone)) break;
            door.current.entered(e.payload.zone);
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
      const init: WorldInitPayload = { lang, spawn: position, playerGender: playerGender(), playerCharacter: playerCharacter(), playerHair: playerHair() };
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
      clearEnterTimer();
      setEntering(null);
    };
    // `lang` is read at open time only: a language change mid-walk is not worth reloading the world.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hostOn, bridge]);
  useEffect(() => clearEnterTimer, [clearEnterTimer]);

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
    // popTo, not navigate: since React Navigation 7 navigate pushes a second Tabs over this screen
    // and leaves it mounted underneath (16-10: the consultation room then exited into the World).
    navigation.popTo('Tabs', { screen: 'Home' });
  }, [navigation]);

  const actions: ZoneActions = {
    counsel: c => leaveTo('counseling', () => openCounselor(navigation, c)),
    browse: () => navigation.popTo('Tabs', { screen: 'Home' }),
    // Through the door (27-10, "vào thẳng phòng rồi chọn"): into the room, where the two sessions
    // are offered — the choice no longer opens over the world.
    meditate: () => leaveTo('meditation', () => navigation.navigate('MeditationRoom', { fromDoor: true })),
    sleep: () => leaveTo('meditation', () => navigation.navigate('SleepGuide')),
    journey: () =>
      leaveTo('journey', () => {
        if (journeyRunning) navigation.navigate('Journey');
        else navigation.navigate(journeyEntryRoute(NEWYEAR_2027), { journeyId: NEWYEAR_2027.id });
      }),
    // The shop sheet floats over every screen (App.tsx): the world stays where it is under it.
    coins: () => useCoins.getState().openShop(),
    myroom: () => leaveTo('myroom', () => navigation.navigate('MyRoom')),
    cafe: () => leaveTo('cafe', () => navigation.navigate('Cafe')),
  };

  /**
   * Through the door: straight into that door's own screen (12-10, user: the rooms belong on their
   * screens, not as a card over the map). The doors without a room of their own go to the 2D screen
   * that does the job: counseling → Home's counselor list, shop → Tickets. Each leaves through
   * leaveTo, so coming back puts the player on that door's step. The cards (ZoneOverlay) remain for
   * the fallback below and for a world still loading.
   */
  const throughDoor = (zone: WorldZone) => {
    clearEnterTimer();
    setEntering(null);
    setSheet(null);
    doorScreen[zone]();
  };
  // The counselor picked on the counselling door's card (DoorCard): through the door goes straight to
  // them. None picked — Map → Counseling, or walking into the doorway — opens the counselor picker
  // over the world (13-10: it used to drop the player on Home's 2D list, out of the world for no
  // reason). Unity puts the player back outside the door and fades in when nothing leaves.
  const doorCounselor = useRef<CounselorSummary | null>(null);
  const doorScreen: Record<WorldZone, () => void> = {
    counseling: () => {
      const c = doorCounselor.current;
      doorCounselor.current = null;
      if (c) actions.counsel(c);
      else setOverlay('counseling');
    },
    // Straight in, like the cafe (27-10): the room itself offers its two sessions.
    meditation: actions.meditate,
    journey: actions.journey,
    shop: () => leaveTo('shop', () => navigation.navigate('Tickets')),
    myroom: actions.myroom,
    // Straight in (21-10): no choice sheet anywhere; coffee or tarot is chosen from the table's menu
    // once the player has sat down.
    cafe: actions.cafe,
  };
  /** A door's overlay — except the cafe's and the meditation room's, which have none any more: every way of reaching that door
   *  (Unity silent at the door, Map while loading, the drawn hub) goes in instead. */
  const openOverlay = (zone: WorldZone) => {
    if (zone === 'cafe') actions.cafe();
    else if (zone === 'meditation') actions.meditate();
    else setOverlay(zone);
  };
  door.current = {
    wait: zone => {
      if (entering === zone && enterTimer.current) return;
      setSheet(null);
      setOverlay(null);
      setEntering(zone);
      clearEnterTimer();
      // Unity never answered: what the door did before it opened — its card (My Room's included).
      enterTimer.current = setTimeout(() => {
        enterTimer.current = null;
        setEntering(null);
        openOverlay(zone);
      }, worldTiming.enterFallbackMs);
    },
    entered: throughDoor,
  };
  const enter = (zone: WorldZone, counselor?: CounselorSummary) => {
    doorCounselor.current = counselor ?? null;
    bridge.sendWorldEnter(zone);
    door.current.wait(zone);
  };

  const goTo = (zone: WorldZone) => {
    setSheet(null);
    // With a world to walk, Unity walks there and answers WORLD_ARRIVED. A world still loading has
    // no NavMesh yet: open the door's overlay straight away rather than drop the request.
    if (unity && !worldUp) openOverlay(zone);
    else bridge.sendWorldGoto(zone);
  };

  const openSheet = (which: 'map' | 'quest' | 'menu') => () => { sfx.tap(); setSheet(which); };

  const toggleRun = () => {
    sfx.tap();
    const on = !run;
    setRun(on);
    bridge.sendWorldRun(on);
  };

  // A run tap from a second finger while the stick is held reaches the stick, not the button (see
  // WorldJoystick); it is hit-tested here against the button's window rect.
  const runRef = useRef<View>(null);
  const runRect = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const measureRun = () => runRef.current?.measureInWindow((x, y, w, h) => { runRect.current = { x, y, w, h }; });
  const tapWhileSteering = (px: number, py: number) => {
    const r = runRect.current;
    const slop = 8;
    if (r && px >= r.x - slop && px <= r.x + r.w + slop && py >= r.y - slop && py <= r.y + r.h + slop) toggleRun();
  };

  const lookOn = hostOn && worldUp && !overlay && !sheet && !entering;
  const camera = useWorldCamera(lookOn);
  // While a door is being walked through, nothing is drawn over the world.
  const busy = overlay != null || sheet != null || entering != null;
  // While the 3D world loads there is nothing to walk: no stick, no run (02-10 screenshot: they
  // floated over the old drawing). Map stays — a door picked while loading opens at once.
  const loadingWorld = unity && !worldUp;

  return (
    <WorldSheetTop.Provider value={barBottom}>
    <View style={styles.stage} onLayout={insets.track('host')}>
      {/* Never hidden or faded, and never inside a transparent parent: an embedded UnityView in one
          stops drawing (meditation room, measured on device). */}
      {unity && hostOn && <UnityHost style={styles.unity} />}
      {(!unity || !worldUp) && (
        <WorldHubArt
          onZone={unity ? undefined : openOverlay}
          caption={unity ? t('world.loading') : undefined}
        />
      )}
      {/* The look-around layer: transparent, over the Unity view, under every control. A touch on
          the UnityView itself never reaches RN (useWorldCamera says why); taps are handed on. */}
      {unity && lookOn && <View style={StyleSheet.absoluteFill} testID="world-look" {...camera} />}

      {/* Top row, as My Room's: who you are on the left (tap → the profile sheet), the coins and the
          way back to 2D on the right. */}
      <View
        testID="world-top"
        pointerEvents="box-none"
        style={[styles.top, { paddingTop: safe.top + spacing.sm, paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md }]}
        onLayout={onTopLayout}>
        <ProfileBadge
          testID="world-profile"
          name={playerName}
          level={level.info.level}
          title={t(level.info.title)}
          maxWidth={badgeMaxWidth(screen.width, safe.left + safe.right + 2 * spacing.md + TOP_RIGHT + spacing.md)}
          onPress={() => { sfx.tap(); setSheet('profile'); }}
        />
        <View style={styles.topRight}>
          <CoinPill />
          {/* 16-10 (user: "위쪽 오른쪽 메인화면 돌아가는 아이콘 개선"): it was a bare outline floating on the
              sky — the one control up here with no plate, easy to miss against a bright scene. Now the
              HUD's own ring (navy disk, gold hairline, ivory glyph), the height of the coin pill beside it,
              like the back ring of every in-world top bar. */}
          <RingButton testID="world-home" icon="home" size={RING_COMPACT} label={t('world.toHome')} onPress={to2D} />
        </View>
      </View>

      {/* The analogue stick, bottom-left (mockup ②–③): WALK_INPUT, the message the world mover reads. */}
      <View
        pointerEvents="box-none"
        style={[styles.stick, { left: safe.left + spacing.xs, bottom: safe.bottom + spacing.xs }]}>
        <WorldJoystick visible={!busy && !loadingWorld} onOtherTouch={tapWhileSteering} />
      </View>

      {!busy && (
        <View
          pointerEvents="box-none"
          style={[styles.buttons, { right: safe.right + spacing.lg, bottom: safe.bottom + spacing.lg }]}>
          {/* Run is the row's size (10-22, "뛰기를 다른 아이콘이랑 크기 같게"), right above Menu. */}
          {!loadingWorld && (
            <View ref={runRef} onLayout={measureRun}>
              <RingButton testID="world-run" icon="run" size={ROUND} label={t('world.run')} active={run} onPress={toggleRun} />
            </View>
          )}
          <View style={styles.round3}>
            <RingButton testID="world-map" icon="map" size={ROUND} caption label={t('world.map')} onPress={openSheet('map')} />
            <RingButton testID="world-quest" icon="quest" size={ROUND} caption label={t('world.quest')} onPress={openSheet('quest')} />
            <RingButton testID="world-menu" icon="menu" size={ROUND} caption label={t('world.menu')} onPress={openSheet('menu')} />
          </View>
        </View>
      )}

      {/* At a door, its card: where it goes, what is live in there, and the way in (WORLD_ENTER). The
          counselling door's way in is a counselor's face. */}
      {near && !busy && <DoorCard zone={near} journeyYear={NEWYEAR_2027.year} onEnter={enter} />}
      {/* Walking through: the room's name while Unity takes the player in. */}
      {entering && <DoorTitle zone={entering} />}

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
      {sheet === 'profile' && (
        <ProfileSheet name={playerName} activity={level.activity} xp={level.xp} info={level.info} onClose={() => setSheet(null)} onRect={putSheet} />
      )}
    </View>
    </WorldSheetTop.Provider>
  );
};

/** The round buttons of a row — run included. My Room's run and exit match it. */
export const ROUND = 46;
/** What the top row keeps on its right: the coin pill (about 96 pt at four digits), a gap, Home. */
const TOP_RIGHT = 96 + spacing.sm + HUD_ICON;

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0B0A26' },
  unity: { ...absoluteFill },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingBottom: spacing.sm,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stick: { position: 'absolute' },
  buttons: { position: 'absolute', alignItems: 'flex-end', gap: spacing.md },
  round3: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
