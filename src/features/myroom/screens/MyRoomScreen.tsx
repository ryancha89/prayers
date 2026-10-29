import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import { useScreen } from '../../../shared/device/screen';
import type { RootStackParamList } from '../../../navigation/types';
import { UnityHost } from '../../counseling/components/UnityHost';
import { getMyRoomBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import { playerCharacter, playerHair, playerGender, playerOutfit } from '../../counseling/bridge/playerGender';
import { CoinPill } from '../../coins/components/CoinPill';
import { useMyRoomCamera } from '../components/useMyRoomCamera';
import { WorldJoystick } from '../../world/components/WorldJoystick';
import { ROUND } from '../../world/screens/WorldScreen';
import type { MyRoomAction, MyRoomItemAnchor, MyRoomNearItem } from '../../counseling/types';
import { ItemPrompt, MYROOM_LIFT } from '../components/ItemPrompt';
import { itemName, themeName } from '../names';
import type { TranslationKey } from '../../../shared/i18n';
import { useCoins } from '../../coins/store/coinStore';
import { MYROOM_PICTURE } from '../picture';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { bookFor, sameBook } from '../diary/book';
import { syncDiary } from '../diary/diaryApi';
import { DiaryOverlay, type DiaryRoute } from '../diary/components/DiaryOverlay';
import { DiaryBookBar } from '../diary/components/DiaryBookBar';
import { devlog } from '../../../shared/devlog';
import type { MyRoomBook, MyRoomInitPayload, MyRoomLayout } from '../../counseling/types';
import { myRoomUserKey, sameLayout, useMyRoomStore } from '../store/myRoomStore';
import { checkIn, fetchAttendance, type AttendanceStatus } from '../../tickets/api/attendance';
import { WorldSheet, WorldSheetTop } from '../../world/components/WorldSheets';
import { HUD_ICON, HudIcon, IVORY, Motto, PillButton, ProfileBadge, RingButton, badgeMaxWidth } from '../../../shared/components/hud/Hud';
import { ProfileSheet, useMyRoomLevel, usePlayerName } from '../components/ProfileSheet';
import { InboxSheet } from '../components/InboxSheet';
import { DecorateBar, SelectionBar } from '../components/DecorateBar';
import { DecorateTray } from '../components/DecorateTray';
import { DecorateCoach } from '../components/DecorateCoach';
import { useDecorate } from '../edit/useDecorate';
import { skinList, swapCandidates } from '../edit/decorate';
import { unreadCount, useInbox } from '../inbox/inboxStore';
import type { InboxLink } from '../inbox/lines';
import { beginSceneTransition } from '../../../shared/transition/sceneTransition';

/** How long the picture may say "Loading" before it offers a retry: past the bridge's last INIT retry. */
export const MYROOM_STALL_MS = 9000;

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** The action button's label for a piece (spec 005 US1): what a tap will do. `acting` = this piece's act
 *  is going (seated / resting / looking); `lampOn` = the lamp's last known state. Exported for the tests. */
export function myRoomActLabel(action: MyRoomAction, acting: boolean, lampOn: boolean): TranslationKey {
  switch (action) {
    case 'sit': return acting ? 'myroom.act.stand' : 'myroom.act.sit';
    case 'rest': return acting ? 'myroom.act.getUp' : 'myroom.act.rest';
    case 'lamp': return lampOn ? 'myroom.act.lampOff' : 'myroom.act.lampOn';
    case 'write': return acting ? 'myroom.act.back' : 'myroom.act.openDiary';
    default: return acting ? 'myroom.act.back' : 'myroom.act.look';
  }
}

/** A piece's name for its prompt (myroom/names.ts). Re-exported for the tests. */
export { itemName } from '../names';

/**
 * What of the room the screen's UI hides, for VIEW_INSETS: the top row (badge and icons) and the
 * bottom row (편집, the motto, exit), in either orientation. The stick and the run button stand in
 * the corners and are not counted — the player walks behind them, the camera does not frame around
 * them (the world's rule). In decorate mode `top` is DecorateBar and `bottom` the tray's dock
 * (selection bar included), both measured — Unity fits the edit camera into what is left, and the
 * HUD rows re-measure on the way out. Exported for the layout test.
 */
export function myRoomCoveredPx(r: MeasuredRects) {
  const { host, top, bottom } = r;
  if (!host) return null;
  return {
    top: top ? top.y + top.height : 0,
    bottom: bottom ? Math.max(0, host.height - bottom.y) : 0,
  };
}

/** The bottom row's height (the 편집 pill). Run and exit are the world's round buttons (ROUND): 23-10,
 *  "버튼 크기도 월드맵이랑 같게" — they were 54 and 44. */
const ROW = 40;

/**
 * My Room (개인실) — the world's fifth door (02-10: "my room xài room hôm qua của tôi đi"), walkable
 * the same day ("cho đi vô phòng được và chỉnh camera tương tác với my room được luôn"): the player
 * walks in with the world's stick and looks round with the world's camera fingers — one-finger drag,
 * pinch, double-tap back behind the player.
 *
 * THE HUD (07-10 mockup): profile badge top-left; mail, gift, diary and menu as bare icons top-right;
 * the stick bottom-left over 편집, run over exit bottom-right, the motto between them. What used to
 * be the top bar — back to the world, 2D, the coin pill — lives in the menu sheet now. Each piece is
 * backed by something real:
 *   badge  level + title derived from the player's own activity (myroom/level.ts); tap → profile
 *   mail   the app's own events (myroom/inbox), dot = unread; rows link to the diary, the check-in,
 *          the coin shop or 편집 — never off the room
 *   gift   the daily check-in (its dot = not checked in today)
 *   편집    the decorate sheet: owned pieces and the server's shop (coins). Arranging them is Unity's
 *          decorate mode, not built — the sheet says so
 *   run    MYROOM_RUN on/off (the room's own message; Unity's walker may not honour it yet)
 *   exit   back to the world, from anywhere in the room (share removed 10-15).
 *
 * UNITY IS THE ROOM, RN IS EVERYTHING YOU TOUCH, as on the world: the stick sends WALK_INPUT (Unity
 * routes it to the room's walker while the room is up), the camera gestures are read on a layer over
 * the UnityView and sent as MYROOM_CAMERA; Unity keeps the lens inside the room whatever it is asked.
 *
 * ONE UNITYVIEW AT A TIME. The world unmounts its host before navigating here (WorldScreen.leaveTo)
 * and mounts it again only after this screen has gone, at the 개인실 door (returnZone 'myroom'). This
 * screen's host is mounted once and never keyed on the orientation — a remount reloads the room.
 *
 * THE DOOR (02-10, "có cửa mà hỏng có nút mở hả"): walking up to the room's door makes Unity say
 * MYROOM_NEAR, and Leave pops in over the stick where the world's Enter does — the same way out as
 * the back button. Without the player there is no door to walk to, so the back button is the way.
 *
 * WITHOUT THE PLAYER (jest, a build with no Unity framework) the picture of the room stands in, and
 * the gestures go to the mock bridge, so the whole path in and out of the room can be walked.
 */
export const MyRoomScreen: React.FC = () => {
  // The shared loading screen (picture, intro, tip) until this place's READY — sceneTransition.ts.
  useEffect(() => { beginSceneTransition('myroom'); }, []);
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const screen = useScreen();
  const landscape = screen.landscape;
  // Per piece, not a SafeAreaView: the room runs under the island and the home indicator.
  const safe = useSafeAreaInsets();
  const unity = isNativeUnity();
  const bridge = getMyRoomBridge();
  const [roomUp, setRoomUp] = useState(false);
  const [nearDoor, setNearDoor] = useState(false);
  // The furniture (spec 005 US1): Unity says which piece is in reach and what is going on; the screen
  // only labels one button and forwards the tap. The reach test lives in Unity, never copied here.
  const [nearItem, setNearItem] = useState<MyRoomNearItem | null>(null);
  // Where that piece is on screen (MYROOM_ITEM_ANCHOR); null until Unity says — an older player build
  // never does, and the prompt then stays at the bottom where it always was.
  const [anchor, setAnchor] = useState<MyRoomItemAnchor | null>(null);
  const [acting, setActing] = useState<{ uid: string; action: MyRoomAction } | null>(null);
  const [lampOn, setLampOn] = useState<Record<string, boolean>>({});
  // No MYROOM_READY after the bridge's retries: say so and offer another try, instead of
  // "Loading your room…" forever (the bridge gives up after MEDITATION_MAX_TRIES, ~7.5 s).
  const [stalled, setStalled] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!unity || roomUp) { setStalled(false); return undefined; }
    const timer = setTimeout(() => setStalled(true), MYROOM_STALL_MS);
    return () => clearTimeout(timer);
  }, [unity, roomUp, attempt]);
  const retry = () => {
    sfx.tap();
    setStalled(false);
    setAttempt(a => a + 1);
    bridge.openMyRoom(initFor());
  };

  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: myRoomCoveredPx,
  });

  // The diary (spec 006). Its screens are overlays over the room (plan R15); the desk book's Write
  // opens one, and so does the top bar's Diary button — the way in that needs no desk (the book
  // stored in decorate mode, or a build with no player at all).
  const [diary, setDiary] = useState<DiaryRoute | null>(null);
  // The book shows the newest entry, formatted here (Unity has no worded UI). Sent with INIT, then
  // again whenever it changes: a save, an edit, a delete, or a pull from another device.
  const memories = useArchiveStore(s => s.memories);
  const book = React.useMemo(() => bookFor(memories, lang), [memories, lang]);
  const bookRef = useRef<MyRoomBook | null>(book);
  // The furnished room (spec 005 T022/T024): INIT carries the cached layout at once, and the GET's
  // copy follows as MYROOM_LAYOUT only when it differs from what INIT carried.
  const sentLayout = useRef<MyRoomLayout | null>(null);
  // This visit's GET answered. Until it does — offline, signed out — the cached room is shown and
  // Decorate says it needs a connection.
  const [online, setOnline] = useState(false);
  const initFor = (): MyRoomInitPayload => {
    const cached = useMyRoomStore.getState().current();
    sentLayout.current = cached?.layout ?? null;
    return {
      lang, book: bookRef.current, layout: cached?.layout ?? null, owned: cached?.owned ?? null,
      playerGender: playerGender(),
      playerCharacter: playerCharacter(),
      playerHair: playerHair(),
      playerOutfit: playerOutfit(),
    };
  };
  useEffect(() => {
    if (sameBook(bookRef.current, book)) return;
    bookRef.current = book;
    bridge.sendMyRoomBook(book);
  }, [book, bridge]);
  // Reflections and photos that landed since the last visit (and entries from another device).
  useEffect(() => { syncDiary().catch(() => {}); }, []);

  // Ask for the room on the way in; close it on the way out. `lang` is read once: a language change
  // inside the room is not worth reloading it.
  useEffect(() => {
    const off = bridge.onEvent(e => {
      if (e.type === 'MYROOM_READY') setRoomUp(true);
      else if (e.type === 'MYROOM_NEAR') setNearDoor(e.payload?.near === true);
      else if (e.type === 'MYROOM_NEAR_ITEM') {
        const p = e.payload;
        if (p?.near && p.action) {
          setNearItem(p);
          if (p.action === 'lamp') setLampOn(m => ({ ...m, [p.uid]: p.active }));
        } else setNearItem(null);
      } else if (e.type === 'MYROOM_ITEM_ANCHOR') {
        if (e.payload) setAnchor(e.payload);
      } else if (e.type === 'MYROOM_ACT_STATE') {
        const p = e.payload;
        if (!p) return;
        if (p.action === 'lamp') setLampOn(m => ({ ...m, [p.uid]: p.active }));
        else if (p.active) setActing({ uid: p.uid, action: p.action });
        else setActing(cur => (cur && cur.uid === p.uid ? null : cur));
        // The camera is on the book: the page is up, and DiaryBookBar offers Read / Write / Back
        // (08-10: it used to open Write at once, leaving no way to only look).
      } else if (e.type === 'MYROOM_LAYOUT_APPLIED') {
        const p = e.payload;
        if (p) devlog(`[myroom] layout applied ${p.theme} placed=${p.placed} skipped=${p.skipped?.length ? p.skipped.map(x => `${x.item}:${x.reason}`).join(',') : 'none'}`);
      } else if (e.type === 'MYROOM_BOOK_STATE') {
        // The book's glyph self-check (R13): the only trace of a missing glyph on a device.
        const p = e.payload;
        if (p) devlog(`[myroom] book ${p.id} shown=${p.shown} missing=${p.missing?.length ? p.missing.map(c => c.toString(16)).join(',') : 'none'}`);
      }
    });
    bridge.openMyRoom(initFor());
    // Then the account's copy. Offline (null) the cached room stands. The bridge holds a layout that
    // lands while the room is still loading and posts it on MYROOM_READY.
    const ac = new AbortController();
    useMyRoomStore.getState().refresh(ac.signal).then(room => {
      if (!room || ac.signal.aborted) return;
      if (!sameLayout(room.layout, sentLayout.current)) {
        sentLayout.current = room.layout;
        bridge.sendMyRoomLayout(room.layout, room.owned);
      }
      // Decorate needs this answer: a save sends the version it brought (spec 005 US2 scenario 2).
      setOnline(true);
    });
    return () => {
      ac.abort();
      off();
      bridge.closeMyRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  // The stick and the look layer wait for the room (until READY the picture covers it, and a stick
  // pushed then would walk the player off on their own once it loads); the coin shop covers both.
  const shopOpen = useCoins(s => s.shopOpen);
  // One sheet at a time over the room: the menu, the profile or the mailbox. 편집 is not a sheet
  // any more: it is decorate mode (DecorateBar + DecorateTray), the room itself the canvas.
  const [sheet, setSheet] = useState<'menu' | 'profile' | 'inbox' | null>(null);
  // The coin shop opens over everything; the sheet that opened it goes.
  useEffect(() => { if (shopOpen) setSheet(null); }, [shopOpen]);
  const controlsOn = (!unity || roomUp) && !shopOpen && !diary && !sheet;
  // The desk's act: the camera is on the open book (DiaryBookBar).
  const atBook = acting?.action === 'write';
  const send = useCallback((c: Parameters<typeof bridge.sendMyRoomCamera>[0]) => bridge.sendMyRoomCamera(c), [bridge]);

  // One short line over the room, for the check-in's
  // answer. Gone after a moment; a new one replaces it.
  const [note, setNote] = useState<string | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const say = useCallback((line: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    setNote(line);
    noteTimer.current = setTimeout(() => setNote(null), NOTE_MS);
  }, []);
  useEffect(() => () => { if (noteTimer.current) clearTimeout(noteTimer.current); }, []);

  // Decorate mode (spec 005 T025). While it is on there is no walking and nothing to use: the stick,
  // run, the item button and Leave go, and one finger on the room selects and drags instead.
  const decorate = useDecorate({
    bridge,
    roomUp,
    online,
    acting: !!acting,
    say,
    showLayout: (layout, owned) => {
      sentLayout.current = layout;
      bridge.sendMyRoomLayout(layout, owned);
    },
  });
  const editing = decorate.editing;
  // Walk mode's HUD stays away while decorating AND for the moment after (decorate.settling: until
  // Unity's MYROOM_LAYOUT_APPLIED, or 300 ms), so it never flashes over the edit camera on its way out.
  const held = editing || decorate.settling;
  const walkOn = controlsOn && !held;
  // Back while decorating (Android's back, or any navigation away) is Cancel — with Cancel's own
  // question when something changed — not leaving the room with an edit half-done. The edit stays
  // on screen until the player answers; a save in flight is not interrupted.
  const cancelRef = useRef(decorate.cancel);
  cancelRef.current = decorate.cancel;
  const savingRef = useRef(decorate.saving);
  savingRef.current = decorate.saving;
  useEffect(() => {
    if (!editing) return undefined;
    return navigation.addListener('beforeRemove', e => {
      e.preventDefault();
      if (!savingRef.current) cancelRef.current();
    });
  }, [editing, navigation]);
  // The 편집 pill grew a longer word and an icon (꾸미기 / Trang trí phòng): the motto between it and
  // exit is sized from its measured width, not a constant.
  const [pillW, setPillW] = useState(76);
  const look = useMyRoomCamera(controlsOn, send, editing ? { onTap: decorate.tap, onDrag: decorate.drag } : null);
  const owned = useMyRoomStore(s => s.byUser[myRoomUserKey()]?.owned ?? null);
  const skins = skinList(decorate.catalogThemes, owned, id => themeName(t, id) !== '');
  const swaps = swapCandidates(decorate.selected, owned, decorate.pending?.layout, decorate.catalog, id => itemName(t, id) !== '');
  const startDecorate = () => {
    if (!decorate.enter() && roomUp && !online) {
      // Offline: try the server again, so the button comes back on by itself once it answers.
      useMyRoomStore.getState().refresh().then(r => { if (r) setOnline(true); });
    }
  };

  // Back to the world: it re-opens at the 개인실 door it remembered on the way in.
  const toWorld = () => {
    sfx.back();
    navigation.goBack();
  };
  // Leave pops in when the door is near, rather than appearing on one frame (the world's Enter).
  const leaveIn = useRef(new Animated.Value(0)).current;
  const leaveOn = nearDoor && walkOn;
  useEffect(() => {
    if (!leaveOn) return;
    leaveIn.setValue(0);
    Animated.spring(leaveIn, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [leaveOn, leaveIn]);

  // One button for the piece in reach — the World's Enter, in the same place. Leave wins at the door.
  const itemOn = !!nearItem && nearItem.action !== '' && walkOn && !leaveOn && !atBook;
  const itemActing = !!nearItem && !!acting && acting.uid === nearItem.uid;
  const itemLabel = nearItem && nearItem.action !== ''
    ? t(myRoomActLabel(nearItem.action, itemActing, lampOn[nearItem.uid] !== false))
    : '';
  const useItem = () => {
    if (!nearItem || nearItem.action === '') return;
    if (itemActing) bridge.endMyRoomAct();
    else bridge.sendMyRoomAct(nearItem.uid, nearItem.action);
  };

  // Closing the diary returns to the open book when the desk opened it (the camera stays on the page,
  // which now shows what was just written); its bar's Back ends the act.
  const goDiary = useCallback((next: DiaryRoute | null) => setDiary(next), []);
  const openDiary = () => {
    sfx.tap();
    setDiary({ screen: 'list' });
  };
  // Talk to Counselor (spec 006 US2 5): the one way out of the room from the diary. Replaces this
  // screen, so the room's UnityView is gone before the consultation mounts its own (one UnityView at
  // a time); the entry rides along as the first turn's focus_memory_id.
  const talkAbout = useCallback((counselorId: string, memoryId: string) => {
    setDiary(null);
    navigation.replace('CounselorDetail', { counselorId, focusMemoryId: memoryId });
  }, [navigation]);

  const to2D = () => {
    sfx.back();
    // popTo, not navigate: since React Navigation 7 navigate pushes a second Tabs over this screen
    // and leaves it mounted underneath (16-10: the consultation room then exited into the World).
    navigation.popTo('Tabs', { screen: 'Home' });
  };

  const explain = (line: string) => { sfx.tap(); say(line); };


  // Who the badge names (the same name the World's badge shows).
  const playerName = usePlayerName();

  // The gift is the daily check-in (tickets/api/attendance): its dot means "not checked in today".
  // Checked in here, not on the Attendance page — any non-Unity route posts SESSION_END (App.tsx)
  // and would tear the room down under the player.
  const [attendance, setAttendance] = useState<AttendanceStatus | null>(null);
  const [checking, setChecking] = useState(false);
  useEffect(() => {
    const ac = new AbortController();
    fetchAttendance(ac.signal).then(a => { if (!ac.signal.aborted) setAttendance(a); });
    return () => ac.abort();
  }, []);
  const giftReady = attendance != null && !attendance.checkedToday;
  // The level counts every check-in ever (the server's days_total); unknown until it answers.
  const level = useMyRoomLevel(attendance ? attendance.daysTotal : null);
  const onGift = async () => {
    if (checking) return;
    if (!attendance) { sfx.tap(); fetchAttendance().then(setAttendance); return; }
    if (attendance.checkedToday) { explain(t('home.attend.done')); return; }
    sfx.select();
    setChecking(true);
    const r = await checkIn();
    setChecking(false);
    if (!r) return;
    setAttendance(a => (a ? {
      ...a, checkedToday: true, coinBalance: r.coinBalance ?? a.coinBalance,
      daysTotal: r.daysTotal ?? a.daysTotal + (r.ok ? 1 : 0),
    } : a));
    say(r.granted > 0 ? t('home.attend.granted', { count: r.granted }) : t(r.ok ? 'home.attend.capped' : 'home.attend.done'));
  };

  const openSheet = (which: 'menu' | 'profile' | 'inbox') => () => { sfx.tap(); setSheet(which); };
  const fromMenu = (go: () => void) => () => { setSheet(null); go(); };
  const closeSheet = useCallback(() => setSheet(null), []);

  // The mailbox: the dot is anything unread; a row's link opens its place in the room.
  const unread = useInbox(s => unreadCount(s.items));
  const followLink = (link: InboxLink) => {
    setSheet(null);
    if (link.to === 'diary') setDiary({ screen: 'detail', id: link.memoryId });
    else if (link.to === 'checkin') onGift();
    else if (link.to === 'coins') useCoins.getState().openShop();
    else startDecorate();
  };

  // Run: the room's own toggle (MYROOM_RUN). A visit starts walking, as the bridge does.
  const [running, setRunning] = useState(false);
  const toggleRun = () => {
    sfx.tap();
    const on = !running;
    setRunning(on);
    bridge.sendMyRoomRun(on);
  };

  // The landscape menu sheet starts under the top row (WorldSheet's rule).
  const [topEnd, setTopEnd] = useState(0);
  const trackTop = insets.track('top');
  const onTopLayout = (e: Parameters<typeof trackTop>[0]) => {
    trackTop(e);
    const { y, height } = e.nativeEvent.layout;
    setTopEnd(y + height);
  };
  const bottomPad = safe.bottom + spacing.sm;

  return (
    <WorldSheetTop.Provider value={topEnd}>
    <View style={styles.stage} onLayout={insets.track('host')}>
      {/* Never hidden or faded, and never inside a transparent parent: an embedded UnityView in one
          stops drawing (meditation room, measured on device). The picture sits OVER it until READY. */}
      {unity && <UnityHost style={styles.unity} />}
      {(!unity || !roomUp) && (
        <View style={styles.unity} testID="myroom-picture">
          <Image
            source={landscape ? MYROOM_PICTURE.landscape : MYROOM_PICTURE.portrait}
            style={styles.picture}
            resizeMode="cover"
          />
          {unity && (
            <View style={styles.loading}>
              <Text style={styles.loadingText}>{t(stalled ? 'myroom.stalled' : 'myroom.loading')}</Text>
              {stalled && (
                <Pressable style={styles.retry} onPress={retry} accessibilityRole="button" testID="myroom-retry">
                  <Text style={styles.retryText}>{t('myroom.retry')}</Text>
                </Pressable>
              )}
            </View>
          )}
        </View>
      )}

      {/* The look-around layer: transparent, over the Unity view, under every control. A touch on
          the UnityView itself never reaches RN (useFollowCamera says why). */}
      {controlsOn && <View style={StyleSheet.absoluteFill} testID="myroom-look" {...look} />}

      {/* Top row: who you are on the left, the four icons on the right. Decorate mode's bar instead. */}
      {held && !editing ? null : editing ? (
        <DecorateBar
          pending={decorate.pending}
          selected={decorate.selected}
          canUndo={decorate.canUndo}
          onUndo={decorate.undo}
          onHelp={decorate.showCoach}
          saving={decorate.saving}
          skin={decorate.unownedSkin}
          buyingSkin={decorate.buyingSkin}
          onBuySkin={decorate.buySkin}
          topInset={safe.top}
          sideInset={Math.max(safe.left, safe.right)}
          onCancel={decorate.cancel}
          onDone={decorate.done}
          onLayout={onTopLayout}
        />
      ) : (
      <View
        testID="myroom-top"
        pointerEvents="box-none"
        style={[styles.top, { paddingTop: safe.top + spacing.sm, paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md }]}
        onLayout={onTopLayout}>
        <ProfileBadge
          testID="myroom-profile"
          name={playerName}
          level={level.info.level}
          title={t(level.info.title)}
          maxWidth={badgeMaxWidth(screen.width, safe.left + safe.right + 2 * spacing.md + TOP_ICONS + spacing.md)}
          onPress={openSheet('profile')}
        />
        <View style={styles.icons}>
          <HudIcon testID="myroom-mail" icon="mail" label={t('myroom.mail')} badge={unread > 0} onPress={openSheet('inbox')} />
          <HudIcon testID="myroom-gift" icon="gift" label={t('myroom.gift')} badge={giftReady} muted={attendance == null} onPress={onGift} />
          <HudIcon testID="myroom-diary" icon="book" label={t('diary.open')} onPress={openDiary} />
          <HudIcon testID="myroom-menu" icon="menu" label={t('world.menu.title')} onPress={openSheet('menu')} />
        </View>
      </View>
      )}

      {/* The world's stick, bottom-left over 편집 (WALK_INPUT), drawn in the room's gold. Hidden —
          and so released — while anything covers the room. */}
      <View
        pointerEvents="box-none"
        style={[styles.stick, { left: safe.left + spacing.xs, bottom: bottomPad + ROW + spacing.xs }]}>
        <WorldJoystick visible={walkOn && !atBook} />
      </View>

      {/* Run, over exit: MYROOM_RUN, never WORLD_RUN (that would set the WORLD's run for the way
          back). Gold while on. */}
      {walkOn && !atBook && (
        <View pointerEvents="box-none" style={[styles.run, { right: safe.right + spacing.lg, bottom: bottomPad + ROUND + spacing.md }]}>
          <RingButton testID="myroom-run" icon="run" size={ROUND} label={t('world.run')} active={running} onPress={toggleRun} />
        </View>
      )}

      {/* Bottom row: 편집, the motto, the way out. Decorate mode's tray instead. */}
      {held && !editing ? null : editing ? (
        <DecorateTray
          owned={owned}
          layout={decorate.pending?.layout ?? null}
          bottomInset={safe.bottom}
          onAdd={decorate.add}
          furnitureForSale={decorate.furnitureForSale}
          onNotForSale={decorate.notForSale}
          skins={skins}
          catalog={decorate.catalog}
          currentTheme={decorate.pending?.layout.theme ?? null}
          onTheme={decorate.theme}
          onLayout={insets.track('bottom')}
          top={decorate.selected ? (
            <SelectionBar
              selected={decorate.selected}
              category={decorate.catalog?.find(c => c.id === decorate.selected!.item)?.category}
              swaps={swaps}
              onRotate={decorate.rotate}
              onSwap={decorate.swap}
              onStore={decorate.store}
            />
          ) : null}
        />
      ) : (
      <View
        testID="myroom-bottom"
        pointerEvents="box-none"
        style={[styles.bottom, { paddingBottom: bottomPad, paddingLeft: safe.left + spacing.lg, paddingRight: safe.right + spacing.lg }]}
        onLayout={insets.track('bottom')}>
        {/* Muted, not hidden, until the room is up and the server answered: a tap says why. */}
        <PillButton
          testID="myroom-edit"
          icon="armchair"
          label={t('myroom.edit')}
          muted={!decorate.canEnter}
          onPress={startDecorate}
          onLayout={e => setPillW(Math.max(76, Math.round(e.nativeEvent.layout.width)))}
        />
        <View style={styles.mottoBox} pointerEvents="none">
          <Motto text={t('myroom.motto')} width={Math.max(0, Math.min(260, screen.width - 2 * (spacing.lg + pillW + spacing.md) - safe.left - safe.right))} />
        </View>
        {/* Out to the world from anywhere in the room (10-15) — not only at the door or in ☰. */}
        <RingButton testID="myroom-exit" icon="exit" size={ROUND} label={t('myroom.back')} onPress={toWorld} />
      </View>
      )}

      {note && (
        <View pointerEvents="none" style={[styles.noteWrap, { top: topEnd + spacing.md }]} testID="myroom-note">
          <Text style={styles.note}>{note}</Text>
        </View>
      )}

      {/* By a usable piece: its one action (Sit/Stand, Rest/Get up, Lamp, Look/Back). Hidden with the
          stick, and at the door, where Leave is the button. */}
      {itemOn && (
        <ItemPrompt
          name={itemName(t, nearItem!.item)}
          label={itemLabel}
          action={nearItem!.action as MyRoomAction}
          // Hung on the piece while it is only offered; docked once it is in use (seated, he IS where
          // the chair's anchor is), off screen, or before Unity says where it is.
          anchor={!itemActing && anchor && anchor.onScreen && anchor.uid === nearItem!.uid ? anchor : null}
          popKey={nearItem!.uid + (itemActing ? ':in-use' : '')}
          onPress={useItem}
          testID="myroom-act"
        />
      )}

      {atBook && walkOn && (
        <DiaryBookBar
          onRead={() => setDiary({ screen: 'list' })}
          onWrite={() => setDiary({ screen: 'write' })}
          onBack={() => bridge.endMyRoomAct()}
        />
      )}

      {/* At the door: the way out, where the world puts Enter. Hidden with the stick (shop open). */}
      {leaveOn && (
        <Animated.View
          pointerEvents="box-none"
          testID="myroom-leave"
          style={[styles.leaveWrap, { bottom: safe.bottom + (landscape ? MYROOM_LIFT.landscape : MYROOM_LIFT.portrait), opacity: leaveIn, transform: [{ scale: leaveIn }] }]}>
          <Pressable
            onPress={toWorld}
            accessibilityRole="button"
            accessibilityLabel={t('myroom.leave')}
            style={({ pressed }) => [styles.leave, pressed && styles.pressed]}>
            <Text style={styles.leaveText}>{t('myroom.leave')}</Text>
            <Icon name="arrowRight" size={16} color="#1A1330" />
          </Pressable>
        </Animated.View>
      )}

      {/* What the old top bar held, so nothing that was reachable stopped being so. */}
      {sheet === 'menu' && (
        <WorldSheet title={t('world.menu.title')} onClose={closeSheet} testID="myroom-sheet-menu">
          <MenuRow icon="back" label={t('myroom.back')} onPress={fromMenu(toWorld)} />
          <MenuRow icon="home" label={t('world.menu.to2d')} onPress={fromMenu(to2D)} />
          <View style={styles.menuRow}>
            <Text style={styles.menuText}>{t('coins.title')}</Text>
            <CoinPill />
          </View>
        </WorldSheet>
      )}
      {sheet === 'profile' && (
        <ProfileSheet name={playerName} activity={level.activity} xp={level.xp} info={level.info} onClose={closeSheet} />
      )}
      {sheet === 'inbox' && <InboxSheet onClose={closeSheet} onLink={followLink} />}

      {editing && decorate.coachStep != null && (
        <DecorateCoach step={decorate.coachStep} topInset={safe.top} bottomInset={safe.bottom} onNext={decorate.nextCoach} />
      )}

      {diary && <DiaryOverlay route={diary} go={goDiary} onTalk={talkAbout} />}
    </View>
    </WorldSheetTop.Provider>
  );
};

/** The four icons of the top row (mail, gift, diary, menu) and the gaps between them. */
const TOP_ICONS = 4 * HUD_ICON + 3 * spacing.sm;

/** How long a note stays over the room. */
const NOTE_MS = 2600;

const MenuRow: React.FC<{ icon: 'back' | 'home'; label: string; onPress: () => void }> = ({ icon, label, onPress }) => (
  <Pressable
    accessibilityRole="button"
    accessibilityLabel={label}
    onPress={onPress}
    style={({ pressed }) => [styles.menuRow, pressed && styles.pressed]}>
    <Icon name={icon} size={18} color={colors.gold} />
    <Text style={[styles.menuText, styles.menuTextGrow]}>{label}</Text>
    <Icon name="arrowRight" size={16} color={colors.textSecondary} />
  </Pressable>
);

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#0B0A26' },
  unity: { ...absoluteFill },
  // An explicit size, not just four zero insets: an Image given only absoluteFill lays out at the
  // bitmap's own size (MeditationRoomScreen's lesson).
  picture: { ...absoluteFill, width: '100%', height: '100%' },
  loading: { position: 'absolute', left: 0, right: 0, bottom: '30%', alignItems: 'center' },
  retry: {
    marginTop: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.8)', borderWidth: 1, borderColor: 'rgba(167,139,250,0.6)',
  },
  retryText: { ...typography.caption, color: colors.textPrimary },
  loadingText: {
    ...typography.caption, color: colors.textPrimary,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.xs, borderRadius: radius.pill,
    backgroundColor: 'rgba(18,14,40,0.6)', overflow: 'hidden',
  },
  top: {
    position: 'absolute', left: 0, right: 0, top: 0,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, paddingBottom: spacing.sm,
  },
  icons: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bottom: {
    position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: spacing.xs,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  // Centred on the screen, not between two buttons of different widths.
  mottoBox: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  run: { position: 'absolute' },
  noteWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.xl },
  note: {
    ...typography.caption, color: IVORY, textAlign: 'center', overflow: 'hidden',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radius.pill,
    backgroundColor: 'rgba(14,12,40,0.86)', borderWidth: 1, borderColor: 'rgba(233,196,106,0.6)',
  },
  menuRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md,
    paddingVertical: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(233,196,106,0.25)',
  },
  menuText: { ...typography.body, color: colors.textPrimary },
  menuTextGrow: { flex: 1 },
  stick: { position: 'absolute' },
  // The world's Enter (WorldScreen styles.enter), so the two doors read as one control.
  leaveWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  leave: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingHorizontal: spacing.xxl, paddingVertical: spacing.md, borderRadius: radius.pill,
    backgroundColor: colors.gold,
    shadowColor: colors.gold, shadowOpacity: 0.6, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
  leaveText: { ...typography.h3, color: '#1A1330' },
  pressed: { opacity: 0.75 },
});
