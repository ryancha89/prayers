import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { RING_COMPACT, RingButton } from '../../../shared/components/hud/Hud';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useLang, useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { RootStackParamList } from '../../../navigation/types';
import { getLocalizedCounselor } from '../../counselors/data/mockCounselors';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { hasBirthData, useSubjectsStore } from '../../subjects/store/subjectsStore';
import { JOURNEYS } from '../data/journeys';
import { TRANSITION_MS, cabinAmbientOf, cabinMomentOf, currentPart, teaserOf, useJourneyPlayer, type ActiveCard } from '../player/journeyPlayer';
import { BEAT_LINES, dropPendingBeatLines, openStoryboard, prefetchBeatLines, sayBeatLine, stopBeatVoice } from '../player/beatVoice';
import { TrainWindow } from '../components/TrainWindow';
import { JourneyBackdrop } from '../components/JourneyBackdrop';
import { moodOf, roughOf } from '../player/cabinMood';
import { RailwayProgress } from '../components/RailwayProgress';
import { JourneyStageOverlay } from '../components/JourneyStageOverlay';
import { CoinPill } from '../../coins/components/CoinPill';
import { useCoins } from '../../coins/store/coinStore';
import { FortuneCardOverlay } from '../components/FortuneCardOverlay';
import { StationTransition } from '../components/StationTransition';
import { clock, monthsLabel } from '../format';
import { UnityHost } from '../../counseling/components/UnityHost';
import { isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import type { JourneyStatePayload } from '../../counseling/types';
import type { BackgroundMedia } from '../types';
import { useCabinCamera } from '../components/useCabinCamera';
import { useScreen } from '../../../shared/device/screen';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';

/** What shows while the 3D cabin loads: the station's night sky, the platform's own painting — not
 *  the drawn 2D window, which flashed up for a moment before every 3D journey (29-09). */
const PLATFORM_NIGHT = require('../assets/platform_night.jpg');
/** A hard month on screen shakes the carriage: 1★ hardest, 2★ or one of the reading's own caution
 *  months half (the model often rates those 3★), anything else rides smooth. */

/** Mount the cabin's host this long after the screen opens if no transitionEnd arrives (a resume
 *  without an animation). Past the stack's fade (~350 ms). */
export const JOURNEY_HOST_FALLBACK_MS = 500;

/**
 * What of the cabin the screen's own UI hides, for VIEW_INSETS: the header across the top, and the
 * panel — under the window in portrait, down the right-hand side in landscape. Exported for the
 * layout test; the rectangles are onLayout's, so `body` and `panel` are relative to their parents.
 */
export function journeyCoveredPx(r: MeasuredRects, landscape: boolean) {
  const { host, header, body, panel } = r;
  if (!host) return null;
  const top = header ? header.y + header.height : 0;
  if (!body || !panel) return { top };
  return landscape
    ? { top, right: host.width - (body.x + panel.x) }
    : { top, bottom: host.height - (body.y + panel.y) };
}

/** How long a month card with a feeling waits, over the cabin, for the counsellor's reaction — the
 *  same lead a stage's beat gets before its card (STAGE_BEAT_LEAD_MS). */
export const MOOD_BEAT_LEAD_MS = 1500;

/** How long the counsellor's invitation is on screen before they lead the player aboard. */
const AUTO_BOARD_MS = 3500;

/** The window's landscape key for Unity: a drawn scene is its own key; media carries its poster. */
function sceneKeyOf(media?: BackgroundMedia): string {
  if (!media) return '';
  if (media.type === 'scene') return media.scene;
  if (media.type === 'video') return media.poster ?? '';
  return '';
}

type Nav = NativeStackNavigationProp<RootStackParamList>;

/** Sentences, and where each starts as a share of the whole — so the line on screen follows the
 *  voice without word timings: a sentence is on while the voice is in its share of the chapter. */
function sentencesOf(text: string) {
  const parts = text.match(/[^.!?。！？]+[.!?。！？]?/g)?.map(s => s.trim()).filter(Boolean) ?? [];
  const total = parts.reduce((n, p) => n + p.length, 0) || 1;
  let acc = 0;
  return parts.map(p => {
    const start = acc / total;
    acc += p.length;
    return { text: p, start };
  });
}

/**
 * The train. The window is the screen — the counsellor is a small face below it, the narrator of
 * a view that belongs to the player. Only the sentence being said is on screen, never the reading.
 */
export const JourneyScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const t = useT();
  const lang = useLang();
  const s = useJourneyPlayer();
  // Landscape splits the screen instead of stacking it: the cabin keeps the left ~60%, and the
  // dialogue, transport and rail move into a panel down the right (01-10). The tree is the SAME in
  // both orientations — only styles change — so a rotation re-lays out and never remounts: not the
  // UnityHost (a remount reloads the cabin), and not the overlay the player is in the middle of.
  const screen = useScreen();
  const landscape = screen.landscape;
  // Landscape: the safe area is applied per piece, not around the whole screen. A safe-area root
  // pads BOTH long sides by the Dynamic Island's ~60 pt even though the island is on one side only —
  // the side panel floated with a strip of cabin to its right and the header sat indented (sim 01-10).
  // The panel's background now runs to the screen edge and only its content keeps clear of the
  // island/notch and the home indicator; the window keeps clear on its own side.
  const safe = useSafeAreaInsets();
  const addMemory = useArchiveStore(a => a.add);
  const journey = s.journeyId ? JOURNEYS[s.journeyId] : null;

  // The journey finished → the ending painting, then the collection (mockup panels 21-22).
  useEffect(() => {
    if (s.status === 'done') navigation.replace('JourneyEnding');
  }, [s.status, navigation]);

  // An unlock refused because the journey pass is not owned: for a journey sold through the pass,
  // the pass screen is the way on. A coin journey (2027, `pass: false`) never goes there. The
  // error is cleared so coming back does not bounce.
  useEffect(() => {
    if (s.unlockError !== 'purchase' || !s.journeyId) return;
    useJourneyPlayer.setState({ unlockError: null });
    if (JOURNEYS[s.journeyId]?.pass) navigation.navigate('JourneyPass', { journeyId: s.journeyId });
  }, [s.unlockError, s.journeyId, navigation]);

  // Not enough coins for an unlock: the coin shop opens on the spot (mockup, 01-10). Nothing was
  // charged; the lock is still there when the sheet closes.
  useEffect(() => {
    if (s.unlockError === 'insufficient') useCoins.getState().openShop();
  }, [s.unlockError]);

  // Boarding refused for want of birth data → the player went to the form → came back with it.
  // Leave again on their behalf; a "try again" tap after filling in a form reads as the app not
  // having noticed.
  const selfReady = useSubjectsStore(st => hasBirthData(st.self));
  const reboard = useCallback(() => {
    if (s.journeyId && s.counselorId && s.tone) void s.board(s.journeyId, s.counselorId, s.tone, lang);
  }, [s, lang]);
  useFocusEffect(
    useCallback(() => {
      if (s.status === 'error' && s.error === 'no-chart' && selfReady) reboard();
    }, [s.status, s.error, selfReady, reboard]),
  );

  const index = s.transitionTo ?? s.chapterIndex;
  const chapter = journey?.chapters[index];

  // ── The 3D cabin (spec 003) ─────────────────────────────────────────────────────────────
  // With the Unity player in the build, the drawn window gives way to the train cabin: Unity sits
  // behind the whole screen and this screen stays opaque over it until JOURNEY_READY, so a player
  // that never answers leaves the drawn window exactly as it was.
  const unity = isNativeUnity();
  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: r => journeyCoveredPx(r, landscape),
  });
  const [cabinUp, setCabinUp] = useState(false);
  // The cabin's UnityView goes in once the screen's fade has finished. Mounted with the screen, the
  // native Metal view ignores the fade's opacity and showed BLACK over the whole picker for two frames
  // before Unity drew (sim QA 06-10, at JOURNEY_INIT). The bridge re-sends JOURNEY_INIT when the view
  // registers, so nothing is lost by waiting; the loading art covers the window meanwhile.
  const [hostOn, setHostOn] = useState(false);
  useEffect(() => {
    if (!unity) return undefined;
    const timer = setTimeout(() => setHostOn(true), JOURNEY_HOST_FALLBACK_MS);
    const off = navigation.addListener('transitionEnd', (e: { data?: { closing?: boolean } }) => {
      if (!e?.data?.closing) setHostOn(true);
    });
    return () => { clearTimeout(timer); off(); };
  }, [unity, navigation]);
  // The loading art fades off the cabin instead of vanishing on the frame Unity is ready — that was a
  // one-frame cut from the starry poster to the platform, on the first spoken line (QA 30-09).
  const curtain = useRef(new Animated.Value(1)).current;
  const [curtainGone, setCurtainGone] = useState(false);
  useEffect(() => {
    if (!cabinUp) { curtain.setValue(1); setCurtainGone(false); return; }
    Animated.timing(curtain, { toValue: 0, duration: 700, useNativeDriver: true }).start(() => setCurtainGone(true));
  }, [cabinUp, curtain]);
  // A journey that has not started reading yet opens on the station platform (Jeongmin 29-09:
  // "when user press onboard button consultant take the user to the seat"); a resumed one does not.
  const onPlatformTrip = useRef(false);
  const [embarking, setEmbarking] = useState(false);
  // Seated for good: the platform sheet never comes back after this, even while chapter 1's voice
  // is still loading (measured 29-09: seated at +11 s, reading at +17 s).
  const [seated, setSeated] = useState(false);
  // The storyboard step Unity is on, and the last line it gave (step 4, the walk, has none).
  const [beat, setBeat] = useState(0);
  const [beatLine, setBeatLine] = useState(1);
  // The counsellor is saying a storyboard line right now: the cabin's mouth follows it (beats 9–10,
  // once seated; on the platform the stand-in has no lip sync).
  const [beatSpeaking, setBeatSpeaking] = useState(false);
  useEffect(() => {
    if (!unity || !s.journeyId || !s.counselorId) return undefined;
    const st = useJourneyPlayer.getState().status;
    onPlatformTrip.current = st === 'boarding' || st === 'platform';
    const tone = useJourneyPlayer.getState().tone;
    // Every line of the storyboard, voiced in the counsellor's own reading voice (30-09: they were
    // subtitles only). Fetched now so no beat waits on synthesis.
    const lineOf = (n: number) => t(`journey.beat.${n}` as 'journey.beat.1');
    if (onPlatformTrip.current && tone) {
      prefetchBeatLines(BEAT_LINES.map(lineOf), tone, lang);
      openStoryboard();   // chapter 1 waits for the last line, "Shall we explore your first stop?"
    }
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type === 'JOURNEY_READY') setCabinUp(true);
      if (e.type === 'JOURNEY_BEAT') {
        const n = e.payload?.beat ?? 0;
        setBeat(n);
        if (n > 0 && n !== 4) {
          setBeatLine(n);
          // Not once the reading has begun: step 10 can land after chapter 1's voice started.
          if (onPlatformTrip.current && tone && useJourneyPlayer.getState().status !== 'playing') {
            sayBeatLine(lineOf(n), tone, lang, clip => {
              setBeatSpeaking(true);
              if (clip.envelope) {
                nativeUnityBridge.sendJourneyVoice({ key: `beat:${n}:${Date.now()}`, ...clip.envelope, startAt: 0 });
              }
            }, () => setBeatSpeaking(false), n === BEAT_LINES[BEAT_LINES.length - 1], n <= 2);
          }
        }
      }
      // Seated: start the reading. `embarking` stays on until it really starts (the first chapter's
      // voice takes a few seconds) — cleared then, or the button lit up again over the cabin.
      if (e.type === 'JOURNEY_SEATED') {
        setSeated(true);
        useJourneyPlayer.getState().depart();
      }
    });
    nativeUnityBridge.openJourneyRoom({
      journeyId: s.journeyId, counselorId: s.counselorId, lang, platform: onPlatformTrip.current,
    });
    return () => {
      off();
      stopBeatVoice();
      setBeatSpeaking(false);
      nativeUnityBridge.closeJourneyRoom();
      setCabinUp(false);
      setEmbarking(false);
      setSeated(false);
      setBeat(0);
      setBeatLine(1);
      readingStarted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unity, s.journeyId, s.counselorId]);

  // The month in the window: the LAST month card of this chapter, held between cards so the
  // seasons do not flick back to the chapter's own landscape while the voice moves on.
  const lastMonth = useRef<{ chapter: number; month: number }>({ chapter: -1, month: 0 });
  if (lastMonth.current.chapter !== s.chapterIndex) lastMonth.current = { chapter: s.chapterIndex, month: 0 };
  if (s.activeCard && s.activeCard.months.length === 1) lastMonth.current.month = s.activeCard.months[0];
  const month = s.status === 'transition' ? 0 : lastMonth.current.month;

  const onPlatform = cabinUp && onPlatformTrip.current && !seated && (s.status === 'boarding' || s.status === 'platform');
  const board = useCallback(() => {
    sfx.select();
    setEmbarking(true);
    nativeUnityBridge.sendJourneyBoard();
  }, []);
  useEffect(() => {
    if (s.status !== 'platform' && s.status !== 'boarding') setEmbarking(false);
  }, [s.status]);
  // After payment the counsellor says "let's go on a train journey together" and leads the way
  // (Jeongmin 29-09): the line is up for AUTO_BOARD_MS, then the boarding starts by itself. The
  // button stays for anyone who does not want to wait.
  // Timed from the invitation (step 2). A Unity build without the storyboard never sends it: board
  // anyway after the line has been up a while.
  useEffect(() => {
    if (!onPlatform || s.status !== 'platform' || embarking) return undefined;
    const timer = setTimeout(board, beat >= 2 ? AUTO_BOARD_MS : AUTO_BOARD_MS + 5000);
    return () => clearTimeout(timer);
  }, [onPlatform, s.status, embarking, board, beat]);
  // The storyboard's lines stay up from the platform until the first chapter really plays.
  // Once the first chapter has played, the storyboard is over: the station transitions between
  // chapters are not 'playing' either, and step 10's line came back at every tunnel (29-09).
  const readingStarted = useRef(false);
  if (s.status === 'playing') readingStarted.current = true;
  // The reading has begun (it waited for the last line — journeyPlayer): nothing more is queued.
  useEffect(() => {
    if (s.status === 'playing') dropPendingBeatLines();
  }, [s.status]);
  // While the cabin is still loading too: otherwise chapter 1's first line and a live play button
  // showed for a few seconds before the platform's greeting (30-09).
  const storyShowing = unity && onPlatformTrip.current && !readingStarted.current
    && (!cabinUp || onPlatform || embarking || (seated && s.status !== 'playing'));
  // The walk to the seat takes ~11 s (door hold, platform, aisle, sitting down). A cabin that never
  // answers must not strand the player on the platform: start the reading anyway.
  useEffect(() => {
    if (!embarking) return undefined;
    const timer = setTimeout(() => {
      setEmbarking(false);
      useJourneyPlayer.getState().depart();
    }, 25000);
    return () => clearTimeout(timer);
  }, [embarking]);

  const cabinState: JourneyStatePayload | null = journey
    ? {
        scene: sceneKeyOf(journey.chapters[s.chapterIndex]?.background),
        // Unity's plan knows no "platform": for the train it is still standing at the station.
        status: s.status === 'platform' ? 'boarding' : s.status,
        transitionTo: s.transitionTo != null ? sceneKeyOf(journey.chapters[s.transitionTo]?.background) : '',
        transitionMs: TRANSITION_MS,
        month,
        speaking: s.status === 'playing' || beatSpeaking || s.teaserSpeaking,
        rough: roughOf(s.activeCard, s.content?.summary.cautionMonths),
        ...cabinMomentOf(s),
        ambient: cabinAmbientOf(journey.chapters[s.chapterIndex]?.id),
        stage: s.stage,
        mood: moodOf(s.activeCard, s.content?.summary.bestMonths, s.content?.summary.cautionMonths),
      }
    : null;
  const cabinKey = cabinState ? JSON.stringify(cabinState) : '';
  const cabinCamera = useCabinCamera(cabinUp && !onPlatform);
  // The narration's loudness, so the counsellor's mouth follows the real voice. Declared BEFORE the
  // state effect: the voice has to be there when `speaking` starts the mouth's clock.
  useEffect(() => {
    if (unity && s.voice) {
      const { key, fps, levels, startAt } = s.voice;
      nativeUnityBridge.sendJourneyVoice({ key, fps, levels, startAt });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unity, s.voice?.key]);
  useEffect(() => {
    if (unity && cabinState) nativeUnityBridge.sendJourneyState(cabinState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unity, cabinKey]);
  const guide = s.counselorId ? getLocalizedCounselor(s.counselorId, lang) : undefined;
  // The line on screen follows the part being told — each part is its own clip.
  const narration = currentPart(s)?.text ?? '';
  const sentences = useMemo(() => sentencesOf(narration), [narration]);
  const progress = s.duration > 0 ? Math.min(1, s.position / s.duration) : 0;
  // A lock or an overlay holds the narration: the transport waits with it.
  const waiting = s.moment === 'locked' || s.stage !== '';
  // At a lock the counsellor's offer is the line; leaving a station has its own; an overlay that
  // carries its own words leaves the box empty rather than repeat a stale sentence.
  const line = s.status === 'transition' || s.status === 'boarding'
    ? ''
    : s.moment === 'locked' && s.stage === ''
      ? teaserOf(s)
      : s.stage === 'stationEnd'
        ? t('journey.stationEnd.line')
        : s.stage !== '' && s.stage !== 'ending'
          ? ''
          : [...sentences].reverse().find(x => x.start <= progress)?.text ?? sentences[0]?.text ?? '';

  const saveCard = useCallback(
    (card: ActiveCard) => {
      if (!journey) return;
      addMemory({
        category: 'story',
        content: `${journey.year} ${monthsLabel(card.months, lang)} · ${card.title}`,
        details: { year: String(journey.year), kind: 'travel', note: card.description },
        importance: 2,
      });
    },
    [addMemory, journey, lang],
  );

  if (!journey || !chapter) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.header}>
          <RingButton testID="journey-back" icon="back" size={RING_COMPACT} label={t('hud.back')}
            onPress={() => { sfx.back(); navigation.goBack(); }} />
        </View>
      </SafeAreaView>
    );
  }

  const speed = s.status === 'transition' ? 3.2 : s.status === 'boarding' ? 0.25 : s.status === 'paused' ? 0 : 1;

  const overlays = (
    <>
      {s.status === 'transition' && chapter.subtitle && (
        <StationTransition station={chapter.subtitle} final={index === journey.chapters.length - 1} />
      )}
      {s.status === 'boarding' && !onPlatform && (
        <View style={styles.boarding}>
          <ActivityIndicator color={colors.gold} />
          <Text style={styles.boardingTitle}>{t('journey.boarding')}</Text>
          <Text style={styles.boardingSub}>{t('journey.boarding.sub', { year: journey.year })}</Text>
        </View>
      )}
      {s.status === 'error' && s.error === 'no-chart' && (
        <View style={styles.boarding}>
          <Text style={styles.boardingTitle}>{t('journey.error.noChart')}</Text>
          <Text style={styles.boardingSub}>{t('journey.error.noChart.sub')}</Text>
          <Pressable
            style={styles.retry}
            onPress={() => {
              sfx.select();
              navigation.navigate('AddSubject', { subjectId: 'self' });
            }}>
            <Text style={styles.retryText}>{t('journey.error.addProfile')}</Text>
          </Pressable>
        </View>
      )}
      {s.status === 'error' && s.error !== 'no-chart' && (
        <View style={styles.boarding}>
          <Text style={styles.boardingTitle}>{t('journey.error')}</Text>
          <Pressable style={styles.retry} onPress={reboard}>
            <Text style={styles.retryText}>{t('journey.retry')}</Text>
          </Pressable>
        </View>
      )}
      {s.activeCard && (
        // Over the cabin a month card sits low in the window, over the table, and one with a feeling
        // waits for the counsellor's reaction (cabinState.mood → Happy/Concerned/Sad): centred and at
        // once, it covered the face the reaction is on (07-10).
        <View style={[styles.cardLayer, unity && styles.cardLayerCabin]} pointerEvents="box-none">
          <FortuneCardOverlay card={s.activeCard} year={journey.year} onDone={s.dismissCard} onSave={saveCard}
            delayMs={unity && cabinState?.mood ? MOOD_BEAT_LEAD_MS : 0} />
        </View>
      )}
      <JourneyStageOverlay journey={journey} />
    </>
  );

  return (
    <View style={styles.stage} onLayout={insets.track('host')}>
      {/* Never hidden or faded: an embedded UnityView under a transparent PARENT stops being
          drawn (meditation room, measured on device). The screen above it is what changes. */}
      {unity && hostOn && <UnityHost style={styles.unity} />}
      {/* Beside the UnityView, never its parent (a transparent parent stops it drawing). */}
      {unity && cabinUp && !curtainGone && (
        <Animated.View pointerEvents="none" style={[styles.curtain, { opacity: curtain }]} />
      )}
    <SafeAreaView edges={landscape ? ['top'] : ['top', 'bottom', 'left', 'right']} style={[styles.root, cabinUp && styles.rootOverCabin]}>
      <View style={[styles.header, landscape && { paddingLeft: safe.left + spacing.md, paddingRight: safe.right + spacing.md }]}
        onLayout={insets.track('header')}>
        {/* The HUD's compact ring, as every in-world top bar has it (My Room's row: md from the
            safe edge, sm under the status bar). */}
        <RingButton
          testID="journey-back"
          icon="back"
          size={RING_COMPACT}
          label={t('hud.back')}
          onPress={() => {
            sfx.back();
            navigation.goBack(); // the journey keeps going; the mini player carries it
          }}
        />
        <Text style={styles.brand}>{t('journey.header', { year: journey.year })}</Text>
        <CoinPill />
      </View>

      <View style={[styles.body, landscape && styles.bodySide]} onLayout={insets.track('body')}>
      {unity ? (
        // ONE element from "Boarding…" to the cabin: the loading art stays mounted and fades with the
        // curtain. Two branches (a plain Image, then a fresh Animated.Image once the cabin was up)
        // remounted it, and the new image showed one black frame before it decoded (sim QA 06-10).
        // Once the cabin is up the area is clear, only the overlays ride on it.
        // Drag to turn, pinch to zoom, double-tap to toggle the close-up — see useCabinCamera.
        <View style={[styles.window, landscape && styles.windowSide, landscape && { marginLeft: safe.left + spacing.xs, marginBottom: safe.bottom + spacing.xs }]}
          {...(cabinUp ? cabinCamera.panHandlers : null)} onTouchEnd={cabinUp ? cabinCamera.onTouchEnd : undefined}>
          {!curtainGone && (
            <Animated.Image source={PLATFORM_NIGHT} resizeMode="cover"
              style={[styles.loadingArt, { opacity: curtain.interpolate({ inputRange: [0, 1], outputRange: [0, 0.85] }) }]} />
          )}
          {overlays}
        </View>
      ) : (
        <TrainWindow style={landscape ? { ...styles.window, ...styles.windowSide } : styles.window}>
          <JourneyBackdrop media={chapter.background} speed={speed} />
          {overlays}
        </TrainWindow>
      )}

      {/* One panel from the platform to the last station (30-09, "UI lúc mở đầu nên đồng bộ với phần
          còn lại"): during the boarding storyboard the counsellor's lines sit where the reading's
          lines will, the player controls keep their place (dimmed), and the round play button IS
          "board the train". */}
      {/* Landscape: the same panel, down the right-hand side and scrollable — 402pt of height holds
          it on every phone measured, the scroll is for the largest text sizes. */}
      <View
        style={[cabinUp && styles.panel, landscape && styles.panelSide,
          // Out to the screen edge; the width the content gets stays `sidePanel`.
          landscape && { width: screen.sidePanel + safe.right, paddingRight: safe.right, paddingBottom: safe.bottom }]}
        onLayout={insets.track('panel')}>
      <ScrollView
        style={landscape ? styles.panelScrollSide : styles.panelScroll}
        scrollEnabled={landscape}
        showsVerticalScrollIndicator={false}
        bounces={false}>
      {/* The dialogue box (mockup): who is speaking, the line, and "››" while the voice goes on. */}
      <View style={styles.dialogue}>
        <View style={[styles.narrator, landscape && styles.narratorSide]}>
          {guide?.avatarImage ? <Image source={guide.avatarImage} style={styles.avatar} /> : null}
          <Text style={styles.guideName}>{guide?.name}</Text>
          <Text style={styles.station}>{chapter.subtitle ? t(chapter.subtitle) : ''}</Text>
        </View>
        <View style={[styles.lineBox, landscape && styles.lineBoxSide]}>
          <Text style={[styles.line, landscape && styles.lineSide]} numberOfLines={landscape ? 4 : 3}>
            {storyShowing ? t(`journey.beat.${beatLine}` as 'journey.beat.1') : line}
          </Text>
        </View>
        {s.status === 'playing' && <Text style={styles.more}>››</Text>}
      </View>

      <View style={[styles.progress, storyShowing && styles.dimmed]} pointerEvents={storyShowing ? 'none' : 'auto'}>
        <View style={styles.bar}>
          <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          <View style={[styles.knob, { left: `${progress * 100}%` }]} />
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>{clock(s.position)}</Text>
          <Text style={styles.time}>{clock(s.duration)}</Text>
        </View>
      </View>

      <View style={[styles.controls, landscape && styles.controlsSide]}>
        <Pressable hitSlop={10} disabled={storyShowing} style={storyShowing && styles.dimmed}
          onPress={() => { sfx.tap(); s.prev(); }} accessibilityRole="button">
          <Icon name="prev" size={20} color={colors.textSecondary} />
        </Pressable>
        <Pressable hitSlop={10} disabled={storyShowing} style={storyShowing && styles.dimmed}
          onPress={() => s.seekBy(-15)} accessibilityRole="button">
          <Icon name="back15" size={30} />
        </Pressable>
        {storyShowing ? (
          // On the platform: board the train. Afterwards: waiting for the seat and the first line.
          <Pressable
            onPress={board}
            style={styles.playBtn}
            disabled={!onPlatform || embarking || s.status !== 'platform'}
            accessibilityRole="button"
            accessibilityLabel={t('journey.platform.board')}>
            {onPlatform && !embarking && s.status === 'platform'
              ? <Icon name="play" size={26} color="#1A1330" />
              : <ActivityIndicator color="#1A1330" />}
          </Pressable>
        ) : (
          <Pressable
            onPress={() => { sfx.tap(); s.toggle(); }}
            disabled={s.status === 'boarding' || s.status === 'transition' || waiting}
            style={[styles.playBtn, waiting && styles.dimmed]}
            accessibilityRole="button">
            <Icon name={s.status === 'playing' ? 'pause' : 'play'} size={26} color="#1A1330" />
          </Pressable>
        )}
        <Pressable hitSlop={10} disabled={storyShowing} style={storyShowing && styles.dimmed}
          onPress={() => s.seekBy(15)} accessibilityRole="button">
          <Icon name="fwd15" size={30} />
        </Pressable>
        <Pressable hitSlop={10} disabled={storyShowing} style={storyShowing && styles.dimmed}
          onPress={() => { sfx.tap(); s.next(); }} accessibilityRole="button">
          <Icon name="next" size={20} color={colors.textSecondary} />
        </Pressable>
      </View>

      <View style={storyShowing && styles.dimmed} pointerEvents={storyShowing ? 'none' : 'auto'}>
      <RailwayProgress
        chapters={journey.chapters}
        current={index}
        progress={s.status === 'transition' ? 0 : progress}
        onStation={i => { sfx.tap(); s.goTo(i); }}
      />
      </View>
      </ScrollView>
      </View>
      </View>
    </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: '#07061A' },
  unity: { ...absoluteFill },
  root: { flex: 1, backgroundColor: '#07061A' },
  rootOverCabin: { backgroundColor: 'transparent' },
  curtain: { ...absoluteFill, backgroundColor: '#07061A' },
  // Over the cabin the controls sit on a dark glass panel: the table and the counsellor's lap are
  // under it, the counsellor's face and the window above it.
  panel: {
    backgroundColor: 'rgba(7,6,26,0.78)',
    borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg,
    borderTopWidth: 1, borderColor: 'rgba(233,196,106,0.25)',
    paddingTop: spacing.xs,
  },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  brand: { ...typography.tiny, color: colors.gold, letterSpacing: 3, flex: 1 },
  chapter: { ...typography.tiny, color: colors.textSecondary, letterSpacing: 1 },
  // The window and the panel: a column in portrait, a row in landscape.
  body: { flex: 1 },
  bodySide: { flexDirection: 'row' },
  window: { flex: 1, marginHorizontal: spacing.md, marginTop: spacing.xs },
  windowSide: { marginRight: spacing.sm, marginBottom: spacing.xs },
  panelScroll: { flexGrow: 0 },
  panelScrollSide: { flex: 1 },
  // Down the right edge: rounded on the side that faces the cabin, full height under the header.
  panelSide: {
    borderTopRightRadius: 0, borderTopLeftRadius: radius.lg, borderBottomLeftRadius: radius.lg,
    borderTopWidth: 0, borderLeftWidth: 1, borderColor: 'rgba(233,196,106,0.25)',
  },
  loadingArt: { ...absoluteFill, width: '100%', height: '100%', borderRadius: radius.lg, opacity: 0.85 },
  dimmed: { opacity: 0.35 },
  boarding: {
    ...absoluteFill,
    alignItems: 'center', justifyContent: 'center', gap: spacing.sm,
    backgroundColor: 'rgba(5,4,20,0.45)',
  },
  boardingTitle: { ...typography.h3, color: colors.textPrimary },
  boardingSub: { ...typography.caption, color: colors.textSecondary },
  retry: { marginTop: spacing.sm, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.gold },
  retryText: { ...typography.bodyStrong, color: '#1A1330' },
  cardLayer: { ...absoluteFill, justifyContent: 'center' },
  cardLayerCabin: { justifyContent: 'flex-end', paddingBottom: spacing.md },
  narrator: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  avatar: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(233,196,106,0.5)' },
  guideName: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
  station: { ...typography.caption, color: colors.textMuted },
  dialogue: {
    marginHorizontal: spacing.md, marginTop: spacing.md, paddingBottom: spacing.sm, borderRadius: radius.lg,
    borderWidth: 1, borderColor: 'rgba(233,196,106,0.3)', backgroundColor: 'rgba(18,14,40,0.55)',
  },
  narratorSide: { marginTop: spacing.sm },
  lineBoxSide: { minHeight: 0, marginTop: spacing.xs },
  lineSide: { fontSize: 16, lineHeight: 24 },
  controlsSide: { paddingHorizontal: spacing.lg, marginVertical: spacing.sm },
  more: { position: 'absolute', right: spacing.lg, bottom: spacing.xs, ...typography.bodyStrong, color: colors.gold },
  lineBox: { minHeight: 76, justifyContent: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  line: { fontSize: 18, lineHeight: 27, fontWeight: '600', color: colors.textPrimary },
  progress: { paddingHorizontal: spacing.xl, marginTop: spacing.sm },
  bar: { height: 3, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.14)', justifyContent: 'center' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: colors.gold },
  knob: { position: 'absolute', width: 11, height: 11, marginLeft: -5.5, borderRadius: 6, backgroundColor: colors.gold },
  times: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { ...typography.tiny, color: colors.textMuted },
  controls: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl, marginVertical: spacing.md,
  },
  playBtn: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: colors.gold,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: colors.gold, shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 0, height: 0 },
  },
});
