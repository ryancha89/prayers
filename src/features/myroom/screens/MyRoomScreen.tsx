import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, Share, StyleSheet, View } from 'react-native';
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
import { CoinPill } from '../../coins/components/CoinPill';
import { useMyRoomCamera } from '../components/useMyRoomCamera';
import { WorldJoystick } from '../../world/components/WorldJoystick';
import type { MyRoomAction, MyRoomItemAnchor, MyRoomNearItem } from '../../counseling/types';
import { ItemPrompt } from '../components/ItemPrompt';
import { itemName } from '../names';
import type { TranslationKey } from '../../../shared/i18n';
import { useCoins } from '../../coins/store/coinStore';
import { MYROOM_PICTURE } from '../picture';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { bookFor, sameBook } from '../diary/book';
import { syncDiary } from '../diary/diaryApi';
import { DiaryOverlay, type DiaryRoute } from '../diary/components/DiaryOverlay';
import { devlog } from '../../../shared/devlog';
import type { MyRoomBook } from '../../counseling/types';
import { checkIn, fetchAttendance, type AttendanceStatus } from '../../tickets/api/attendance';
import { WorldSheet, WorldSheetTop } from '../../world/components/WorldSheets';
import { HUD_ICON, HudIcon, IVORY, Motto, PillButton, ProfileBadge, RingButton, badgeMaxWidth } from '../../../shared/components/hud/Hud';
import { ProfileSheet, useMyRoomLevel, usePlayerName } from '../components/ProfileSheet';
import { InboxSheet } from '../components/InboxSheet';
import { DecorateSheet, type DecorTab } from '../components/DecorateSheet';
import { unreadCount, useInbox } from '../inbox/inboxStore';
import type { InboxLink } from '../inbox/lines';

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
    case 'write': return acting ? 'myroom.act.back' : 'myroom.act.write';
    default: return acting ? 'myroom.act.back' : 'myroom.act.look';
  }
}

/** A piece's name for its prompt (myroom/names.ts). Re-exported for the tests. */
export { itemName } from '../names';

/**
 * What of the room the screen's UI hides, for VIEW_INSETS: the top row (badge and icons) and the
 * bottom row (편집, the motto, share), in either orientation. The stick and the run button stand in
 * the corners and are not counted — the player walks behind them, the camera does not frame around
 * them (the world's rule). Exported for the layout test.
 */
export function myRoomCoveredPx(r: MeasuredRects) {
  const { host, top, bottom } = r;
  if (!host) return null;
  return {
    top: top ? top.y + top.height : 0,
    bottom: bottom ? Math.max(0, host.height - bottom.y) : 0,
  };
}

/** The bottom row's height (the 편집 pill), and the run button's size. */
const ROW = 40;
const RUN = 54;

/**
 * My Room (개인실) — the world's fifth door (02-10: "my room xài room hôm qua của tôi đi"), walkable
 * the same day ("cho đi vô phòng được và chỉnh camera tương tác với my room được luôn"): the player
 * walks in with the world's stick and looks round with the world's camera fingers — one-finger drag,
 * pinch, double-tap back behind the player.
 *
 * THE HUD (07-10 mockup): profile badge top-left; mail, gift, diary and menu as bare icons top-right;
 * the stick bottom-left over 편집, run over share bottom-right, the motto between them. What used to
 * be the top bar — back to the world, 2D, the coin pill — lives in the menu sheet now. Each piece is
 * backed by something real:
 *   badge  level + title derived from the player's own activity (myroom/level.ts); tap → profile
 *   mail   the app's own events (myroom/inbox), dot = unread; rows link to the diary, the check-in,
 *          the coin shop or 편집 — never off the room
 *   gift   the daily check-in (its dot = not checked in today)
 *   편집    the decorate sheet: owned pieces and the server's shop (coins). Arranging them is Unity's
 *          decorate mode, not built — the sheet says so
 *   run    MYROOM_RUN on/off (the room's own message; Unity's walker may not honour it yet)
 *   share  the system share sheet with a line of text.
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
    bridge.openMyRoom({ lang });
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
        // The camera is on the book: Write opens over it (spec 006 US1 1).
        if (p.action === 'write' && p.active) setDiary(d => d ?? { screen: 'write' });
      } else if (e.type === 'MYROOM_BOOK_STATE') {
        // The book's glyph self-check (R13): the only trace of a missing glyph on a device.
        const p = e.payload;
        if (p) devlog(`[myroom] book ${p.id} shown=${p.shown} missing=${p.missing?.length ? p.missing.map(c => c.toString(16)).join(',') : 'none'}`);
      }
    });
    bridge.openMyRoom({ lang, book: bookRef.current });
    return () => {
      off();
      bridge.closeMyRoom();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridge]);

  // The stick and the look layer wait for the room (until READY the picture covers it, and a stick
  // pushed then would walk the player off on their own once it loads); the coin shop covers both.
  const shopOpen = useCoins(s => s.shopOpen);
  // One sheet at a time over the room: the menu, the profile, the mailbox, or 편집.
  const [sheet, setSheet] = useState<'menu' | 'profile' | 'inbox' | 'decor' | null>(null);
  const [decorTab, setDecorTab] = useState<DecorTab>('owned');
  // The coin shop opens over everything; the sheet that opened it goes.
  useEffect(() => { if (shopOpen) setSheet(null); }, [shopOpen]);
  const controlsOn = (!unity || roomUp) && !shopOpen && !diary && !sheet;
  const send = useCallback((c: Parameters<typeof bridge.sendMyRoomCamera>[0]) => bridge.sendMyRoomCamera(c), [bridge]);
  const look = useMyRoomCamera(controlsOn, send);

  // Back to the world: it re-opens at the 개인실 door it remembered on the way in.
  const toWorld = () => {
    sfx.back();
    navigation.goBack();
  };
  // Leave pops in when the door is near, rather than appearing on one frame (the world's Enter).
  const leaveIn = useRef(new Animated.Value(0)).current;
  const leaveOn = nearDoor && controlsOn;
  useEffect(() => {
    if (!leaveOn) return;
    leaveIn.setValue(0);
    Animated.spring(leaveIn, { toValue: 1, friction: 6, tension: 90, useNativeDriver: true }).start();
  }, [leaveOn, leaveIn]);

  // One button for the piece in reach — the World's Enter, in the same place. Leave wins at the door.
  const itemOn = !!nearItem && nearItem.action !== '' && controlsOn && !leaveOn;
  const itemActing = !!nearItem && !!acting && acting.uid === nearItem.uid;
  const itemLabel = nearItem && nearItem.action !== ''
    ? t(myRoomActLabel(nearItem.action, itemActing, lampOn[nearItem.uid] !== false))
    : '';
  const useItem = () => {
    if (!nearItem || nearItem.action === '') return;
    if (itemActing) bridge.endMyRoomAct();
    else bridge.sendMyRoomAct(nearItem.uid, nearItem.action);
  };

  // Closing the diary ends the desk's act (the camera eases back) when the book opened it.
  const goDiary = useCallback((next: DiaryRoute | null) => {
    setDiary(next);
    if (!next && acting?.action === 'write') bridge.endMyRoomAct();
  }, [acting, bridge]);
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
    navigation.navigate('Tabs', { screen: 'Home' });
  };

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
      ...a, checkedToday: true, freeBalance: r.freeBalance, freeCap: r.freeCap,
      daysTotal: r.daysTotal ?? a.daysTotal + (r.ok ? 1 : 0),
    } : a));
    say(r.granted > 0
      ? t('home.attend.granted', { count: r.granted })
      : r.capReached ? t('home.attend.full', { cap: r.freeCap }) : t('home.attend.done'));
  };

  // No share flow exists in the app: the system sheet with one line is all this is.
  const share = () => {
    sfx.tap();
    Share.share({ message: t('myroom.shareText') }).catch(() => {});
  };

  const openSheet = (which: 'menu' | 'profile' | 'inbox') => () => { sfx.tap(); setSheet(which); };
  const openDecor = (tab: DecorTab = 'owned') => { setDecorTab(tab); setSheet('decor'); };
  const fromMenu = (go: () => void) => () => { setSheet(null); go(); };
  const closeSheet = useCallback(() => setSheet(null), []);

  // The mailbox: the dot is anything unread; a row's link opens its place in the room.
  const unread = useInbox(s => unreadCount(s.items));
  const followLink = (link: InboxLink) => {
    setSheet(null);
    if (link.to === 'diary') setDiary({ screen: 'detail', id: link.memoryId });
    else if (link.to === 'checkin') onGift();
    else if (link.to === 'coins') useCoins.getState().openShop();
    else openDecor('owned');
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

      {/* Top row: who you are on the left, the four icons on the right. */}
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

      {/* The world's stick, bottom-left over 편집 (WALK_INPUT), drawn in the room's gold. Hidden —
          and so released — while anything covers the room. */}
      <View
        pointerEvents="box-none"
        style={[styles.stick, { left: safe.left + spacing.xs, bottom: bottomPad + ROW + spacing.xs }]}>
        <WorldJoystick visible={controlsOn} />
      </View>

      {/* Run, over share: MYROOM_RUN, never WORLD_RUN (that would set the WORLD's run for the way
          back). Gold while on. */}
      {controlsOn && (
        <View pointerEvents="box-none" style={[styles.run, { right: safe.right + spacing.lg - (RUN - ROW - 4) / 2, bottom: bottomPad + ROW + spacing.lg }]}>
          <RingButton testID="myroom-run" icon="run" size={RUN} label={t('world.run')} active={running} onPress={toggleRun} />
        </View>
      )}

      {/* Bottom row: 편집, the motto, share. */}
      <View
        testID="myroom-bottom"
        pointerEvents="box-none"
        style={[styles.bottom, { paddingBottom: bottomPad, paddingLeft: safe.left + spacing.lg, paddingRight: safe.right + spacing.lg }]}
        onLayout={insets.track('bottom')}>
        <PillButton testID="myroom-edit" label={t('myroom.edit')} onPress={() => { sfx.tap(); openDecor('owned'); }} />
        <View style={styles.mottoBox} pointerEvents="none">
          <Motto text={t('myroom.motto')} width={Math.min(260, screen.width - 2 * (spacing.lg + 76 + spacing.md) - safe.left - safe.right)} />
        </View>
        <RingButton testID="myroom-share" icon="share" size={ROW + 4} label={t('myroom.share')} onPress={share} />
      </View>

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

      {/* At the door: the way out, where the world puts Enter. Hidden with the stick (shop open). */}
      {leaveOn && (
        <Animated.View
          pointerEvents="box-none"
          testID="myroom-leave"
          style={[styles.leaveWrap, { bottom: safe.bottom + (landscape ? 150 : 250), opacity: leaveIn, transform: [{ scale: leaveIn }] }]}>
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
      {sheet === 'decor' && <DecorateSheet initialTab={decorTab} onClose={closeSheet} />}

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
