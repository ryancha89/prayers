import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '../../../shared/components/Text';
import { HAIRLINE, IVORY, PLATE, RING_COMPACT, RingButton } from '../../../shared/components/hud/Hud';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLang, useT } from '../../../shared/i18n';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { backgroundMusic } from '../../../shared/audio/backgroundMusic';
import { holdScreenAwake } from '../../../shared/device/keepAwake';
import { BREATH, CYCLE_MS, MeditationSession, SESSION_MS, breathSync, type Phase, type SessionState } from '../session';
import { UnityHost } from '../../counseling/components/UnityHost';
import { guideVoice } from '../guideVoice';
import { isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import { useScreen } from '../../../shared/device/screen';
import { BottomFade, MED, PaceLine, Threshold, Vignette } from '../components/BreathStage';
import { SERIF } from '../../../shared/components/hud/Hud';

/**
 * The meditation room: ten minutes, music and text, no guided voice (decided 15-09).
 *
 * THE ROOM IS UNITY NOW (21-09). It shipped as a breathing ring over concept art — the note here
 * used to explain why that was enough, and ended "nothing here assumes it can never move". The art
 * for a real room arrived, so it moved: `UnityHost` sits behind everything and Unity loads
 * MeditationRoom, while the ring, the clock, the copy and the music all stay exactly where they
 * were. The concept art is still the fallback, and is what renders in Expo/Jest and on any build
 * without the embedded player.
 *
 * UNITY IS SCENERY HERE, NOT A SECOND AUDIO OWNER. It is opened with MEDITATION_INIT rather than
 * SESSION_INIT — no counselor, no ticket, no thread, and pointedly no history row — and the scene
 * itself carries no AudioSource. The music is still this screen's, started on Begin, paused with
 * the breath and dropped on the way out.
 *
 * THE ONE THING ON SCREEN IS THE RING. Everything else gets out of its way: the title and the line
 * under it fade out the moment breathing starts, the clock drops to metadata weight, and the room
 * itself sinks a little further behind the wash. A player who came here to calm down should not be
 * reading. That is also why there is no streak, no score and no "session 3 of 7" — the copy is
 * "ten minutes, all you have to do is breathe", and the interface has to mean it.
 *
 * THE MUSIC IS THE SESSION, so it follows the session and not the route. Entering the tab only
 * silences the app's bed (App.tsx); the loop itself starts on Begin, pauses with the breath, and is
 * dropped on the way out. Coming up with the screen would play a meditation loop at someone who is
 * still deciding whether they have ten minutes — and would keep playing through a pause, which is
 * the bit that gives away that nobody is really listening to the player.
 */
/** The breath, as the ring's scale round her: a halo that swells and settles, never closing in on
 *  her (the old free-floating ring went to 0.62; drawn round a person that cuts through her). */
const RING_MIN = 0.9;
const RING_MAX = 1.08;

/** The fixed band along the bottom that holds the words and the one button, in either orientation.
 *  FIXED, not measured per state: it is what Unity frames her above (VIEW_INSETS), and a band that
 *  grew for the end card and shrank while breathing would move the camera every time it changed. */
export const BOTTOM_BAND = { portrait: 210, landscape: 118 };

/** After the room answers, how long the camera's glide in from the doorway takes
 *  (MeditationDirector._arriveSeconds) — the title and Begin wait for it, so the player arrives
 *  first and is asked second. */
export const ARRIVE_MS = 3600;

/** What of the room the screen's UI hides, for VIEW_INSETS: the top row and the bottom band — the
 *  same in both orientations since 13-10, when the landscape side panel went and she moved to the
 *  middle of the screen. */
export function meditationCoveredPx(r: MeasuredRects, _landscape: boolean) {
  const { host, header, band } = r;
  if (!host) return null;
  const top = header ? header.y + header.height : 0;
  if (!band) return { top };
  return { top, bottom: host.height - band.y };
}

const PHASE_KEY: Record<Phase, 'med.in' | 'med.hold' | 'med.out'> = {
  in: 'med.in',
  hold: 'med.hold',
  out: 'med.out',
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

const ROOM_ART = require('../assets/room.jpg');

export const MeditationRoomScreen: React.FC = () => {
  const t = useT();
  const lang = useLang();
  // The guide waits for the bell to ring out on a fresh start; this is that wait, so a Pause or a
  // Leave pressed inside it cancels the guide instead of letting it start talking afterwards.
  const guideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearGuideTimer = () => {
    if (guideTimer.current) clearTimeout(guideTimer.current);
    guideTimer.current = null;
  };
  const navigation = useNavigation();
  // Landscape: the ring, the clock and the button move into a panel on the right, so the girl in the
  // room keeps the left of the screen. Same tree, other styles: rotating mid-breath keeps the session,
  // its animations and the UnityHost exactly as they were.
  const screen = useScreen();
  const landscape = screen.landscape;
  const insets = useViewInsets({
    send: isNativeUnity() ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: r => meditationCoveredPx(r, landscape),
  });
  const trackHost = insets.track('host');
  const trackHeader = insets.track('header');
  const session = useRef(new MeditationSession()).current;
  const [state, setState] = useState<SessionState>(() => session.read());

  // Driven by their own animations rather than by the tick below: a value re-set thirty times a
  // second from JS stutters, and the breath is the one thing here that must not.
  const breath = useRef(new Animated.Value(RING_MIN)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const chrome = useRef(new Animated.Value(1)).current;
  /** The concept art's opacity. 1 until Unity says the real room is on screen, then 0 — see the
   *  effect below, and the warning in the render for why it is the ART that moves. */
  const artOut = useRef(new Animated.Value(1)).current;
  const loops = useRef<Animated.CompositeAnimation[]>([]);
  /** The camera has finished gliding in: show the title and Begin. */
  const [arrived, setArrived] = useState(false);
  const arrive = useRef(new Animated.Value(0)).current;
  /** The threshold's lantern, breathing slowly while the room loads. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 2200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  const [view, setView] = useState({ width: screen.width, height: screen.height });

  /** Tell the girl in the room what the session is doing: eyes shut and breathing with the ring
   *  while it runs, eyes open when it pauses, a smile when it is done. */
  const tellRoom = useCallback(
    (roomState: 'idle' | 'breathing' | 'paused' | 'done') => {
      if (!isNativeUnity()) return;
      nativeUnityBridge.sendMeditationState({ state: roomState, ...breathSync(session.elapsed()) });
    },
    [session],
  );

  const startAnimation = useCallback(() => {
    loops.current.forEach(l => l.stop());
    const [inhale, hold, exhale] = BREATH;
    const lungs = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: RING_MAX,
          duration: inhale.seconds * 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.delay(hold.seconds * 1000),
        Animated.timing(breath, {
          toValue: RING_MIN,
          duration: exhale.seconds * 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );
    // The signature: one ember travelling the ring, once per breath. It is the candle in the room
    // the art was drawn from, and it is a pace you can follow with your eyes shut halfway — linear
    // on purpose, because an eased orbit would speed up and slow down against your own lungs.
    orbit.setValue(0);
    const ember = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: CYCLE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loops.current = [lungs, ember];
    lungs.start();
    ember.start();
    Animated.timing(chrome, { toValue: 0, duration: 420, useNativeDriver: true }).start();
  }, [breath, orbit, chrome]);

  const stopAnimation = useCallback(
    (restoreChrome: boolean) => {
      loops.current.forEach(l => l.stop());
      loops.current = [];
      // Stopping the driver is not the same as settling the value it drives — the lesson from the
      // consultation stage, where a native-driven value outlived its screen.
      breath.stopAnimation();
      orbit.stopAnimation();
      if (restoreChrome) {
        Animated.timing(chrome, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      }
    },
    [breath, orbit, chrome],
  );

  // Ask Unity for the room, once, on the way in.
  //
  // On the way out it is closed explicitly rather than left to UnityHost's unmount. The host's
  // teardown does send SESSION_END, which Unity treats identically — but relying on that would
  // make this screen's exit depend on a component written for the counseling room, and the two
  // are free to diverge. Both are idempotent, so the overlap costs nothing.
  //
  // ⚠️ THE FALLBACK STAYS UP UNTIL THE ROOM ANSWERS.
  // A mounted UnityView is opaque from its first frame, so left bare it covers the concept art
  // whether or not Unity has anything behind it — and a player whose room never loads then shows
  // a black rectangle with a breathing ring on it. So the art is held over the top and dropped on
  // MEDITATION_READY. An older player build, a bridge that never answered, an engine still waking
  // up: all of them land on the photo this screen always had. A fallback is only a fallback if
  // something can actually fall back to it.
  useEffect(() => {
    if (!isNativeUnity()) {
      setArrived(true);
      return undefined;
    }
    let arriveTimer: ReturnType<typeof setTimeout> | null = null;
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type !== 'MEDITATION_READY') return;
      // The camera glides in from the doorway first; the words and Begin come when it has arrived.
      if (!arriveTimer) arriveTimer = setTimeout(() => setArrived(true), ARRIVE_MS);
      Animated.timing(artOut, {
        toValue: 0,
        duration: 420,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    });
    nativeUnityBridge.openMeditationRoom();
    // A room that never answers must not leave the player with no Begin at all: the art fallback
    // is up, and the session runs without Unity.
    const fallback = setTimeout(() => setArrived(true), 8000);
    return () => {
      off();
      if (arriveTimer) clearTimeout(arriveTimer);
      clearTimeout(fallback);
      nativeUnityBridge.closeMeditationRoom();
    };
  }, [artOut]);

  // The words and the button rise in once the player has arrived.
  useEffect(() => {
    if (!arrived) return;
    Animated.timing(arrive, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [arrived, arrive]);

  useEffect(() => {
    if (state.status !== 'running') return undefined;
    const id = setInterval(() => setState(session.read()), 250);
    // Ten minutes of not touching the phone is exactly what iOS reads as "nobody is here". The hold
    // is tied to the RUNNING state and nothing else, so a paused session, the end card and leaving
    // the tab all release it without anyone having to remember to.
    const release = holdScreenAwake();
    return () => {
      clearInterval(id);
      release();
    };
  }, [state.status, session]);

  useEffect(() => {
    if (state.status !== 'done') return;
    stopAnimation(true);
    tellRoom('done');
    sfx.bellOut();
    guideVoice.stop();
    // The ten minutes are over; the room goes quiet with them rather than looping under an end
    // card. `stop` and not `pause`: the next session is a new sitting, not a continuation.
    backgroundMusic.stop();
  }, [state.status, stopAnimation, tellRoom]);

  // Leaving the tab pauses the breath. It is a tab now, so "leaving" is one tap and costs nothing —
  // but a session that kept counting down behind the counselor list would hand the player back four
  // minutes of silence they never sat through, and the music has already stopped by then anyway.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        session.pause();
        stopAnimation(true);
        setState(session.read());
        tellRoom('paused');
        clearGuideTimer();
        guideVoice.pause();
        // The route rule swaps the app's bed back in on the way out; this only makes sure the
        // meditation loop is not the thing still playing while it does.
        backgroundMusic.stop();
      }),
    [navigation, session, stopAnimation, tellRoom],
  );

  useEffect(
    () => () => {
      stopAnimation(false);
      clearGuideTimer();
      guideVoice.stop();
      backgroundMusic.stop();
    },
    [stopAnimation],
  );

  const begin = () => {
    // The bell, not the UI tick: this press is the last thing the player looks at before their eyes
    // close, and a 55 ms mallet is an interface answering a tap rather than a room opening.
    sfx.bellIn();
    const fresh = session.read().status === 'idle';
    session.start();
    setState(session.read());
    startAnimation();
    tellRoom('breathing');
    backgroundMusic.start('meditation');
    // The spoken guide (English only, for now — see guideVoice.ts). A fresh start lets the bell ring
    // out first; Carry on picks the voice up at once, where it stopped.
    clearGuideTimer();
    if (fresh) guideTimer.current = setTimeout(() => guideVoice.play(lang), 1500);
    else guideVoice.play(lang);
  };

  const pause = () => {
    sfx.tap();
    session.pause();
    stopAnimation(true);
    setState(session.read());
    tellRoom('paused');
    clearGuideTimer();
    guideVoice.pause();
    // Held, not dropped: Carry on picks the track up where it stopped, the way the breath does.
    backgroundMusic.pause();
  };

  const leave = () => {
    sfx.back();
    navigation.goBack();
  };

  const again = () => {
    guideVoice.stop();
    session.reset();
    setState(session.read());
    begin();
  };

  const running = state.status === 'running';
  const done = state.status === 'done';
  const remaining = state.status === 'idle' ? SESSION_MS : state.remainingSeconds * 1000;

  // The room's edges sink further while breathing — never her, she is in the clear middle.
  const vignette = useMemo(
    () => chrome.interpolate({ inputRange: [0, 1], outputRange: [1, 0.7] }),
    [chrome],
  );

  return (
    <View
      style={styles.bg}
      onLayout={e => {
        trackHost(e);
        const { width, height } = e.nativeEvent.layout;
        setView({ width, height });
      }}>
      {/* ⚠️ THE UNITY VIEW IS NEVER HIDDEN. It sits at the back at full opacity for the whole life
          of the screen, and the concept art FADES OUT on top of it once the room answers.
          The obvious shape — mount Unity at opacity 0 and fade it in — was written first and is
          wrong: an embedded UnityView inside a transparent parent is not composited, the player
          stops being drawn, and its frame loop stops with it. Measured on device: BRIDGE_READY
          (frame 1) still arrived, then the scene-load coroutine never advanced and
          MEDITATION_READY never came. The same screen with the art on top loads the room fine. */}
      {isNativeUnity() && <UnityHost style={styles.unity} />}
      {isNativeUnity() ? (
        // While the room loads: a threshold — dusk, one lantern breathing, the room's name — not the
        // 2D concept art, whose girl is not the one in the room and whose crop was a strip in
        // landscape (13-10). It lifts the moment the room answers, as the camera starts gliding in.
        <Animated.View style={[styles.art, { opacity: artOut }]} pointerEvents="none">
          <Threshold title={t('med.title')} pulse={pulse} />
        </Animated.View>
      ) : (
        // Without the embedded player (Expo, Jest, a build without Unity) the art IS the room.
        <Animated.Image source={ROOM_ART} style={[styles.art, { opacity: artOut }]} resizeMode="cover" />
      )}
      <Vignette width={view.width} height={view.height} strength={vignette} />
      <BottomFade width={view.width} height={(landscape ? BOTTOM_BAND.landscape : BOTTOM_BAND.portrait) + 60} />

      {/* The breath's light is IN the room now (Unity's MeditationBreathLight, behind her and on the
          rug): an overlay here can only sit on top of the 3D view, and it washed over her (13-10). */}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        {/* Top row: the way out (it does NOT fade — everything else may recede, the door cannot), the
            clock in the middle once the session is under way, and Pause on the right while breathing. */}
        <View style={styles.header} onLayout={trackHeader}>
          <View style={styles.back}>
            <RingButton testID="med-back" icon="back" size={RING_COMPACT} label={t('hud.back')} onPress={leave} />
          </View>
          <View style={styles.headerMid} pointerEvents="none">
            {/* The clock lives in the bottom band now: up here it sat on the bright window. */}
          </View>
          <View style={styles.headerEnd}>
            {running && <RingButton testID="med-pause" icon="pause" size={RING_COMPACT} label={t('med.pause')} onPress={pause} muted />}
          </View>
        </View>

        <View style={styles.fill} />

        {/* The bottom band, fixed in height (BOTTOM_BAND): the words of whatever state this is, and its
            one button. On a soft plate so the words read over a bright window. */}
        <View
          style={[styles.band, { height: landscape ? BOTTOM_BAND.landscape : BOTTOM_BAND.portrait }]}
          onLayout={insets.track('band')}>
          {done ? (
            <Animated.View style={styles.plate}>
              <Text style={styles.plateTitle}>{t('med.doneTitle')}</Text>
              <Text style={styles.plateLine}>{t('med.doneBody').replace('{0}', String(state.breaths))}</Text>
              <Action label={t('med.again')} onPress={again} />
            </Animated.View>
          ) : running ? (
            <View style={styles.breathing}>
              <Text style={styles.phase} testID="med-phase">{t(PHASE_KEY[state.phase])}</Text>
              <PaceLine width={landscape ? 220 : 240} cycle={orbit} />
              <Text style={styles.clock}>{clock(remaining)}</Text>
            </View>
          ) : state.status === 'paused' ? (
            <View style={styles.plate}>
              <Text style={styles.plateLine}>{t('med.paused')}</Text>
              <Text style={styles.clock}>{clock(remaining)}</Text>
              <Action label={t('med.resume')} onPress={begin} />
            </View>
          ) : (
            <Animated.View
              pointerEvents={arrived ? 'auto' : 'none'}
              style={[
                styles.plate,
                { opacity: arrive, transform: [{ translateY: arrive.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }] },
              ]}>
              <Text style={styles.plateTitle}>{t('med.title')}</Text>
              <Text style={styles.plateLine}>{t('med.meta')}</Text>
              <Action label={t('med.start')} onPress={begin} />
            </Animated.View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

/** The only control on the screen. `quiet` is the running state: still reachable, no longer asking
 *  to be looked at. */
const Action: React.FC<{ label: string; onPress: () => void; quiet?: boolean }> = ({
  label,
  onPress,
  quiet,
}) => (
  <Pressable
    onPress={onPress}
    style={({ pressed }) => [
      styles.action,
      quiet && styles.actionQuiet,
      pressed && styles.actionPressed,
    ]}>
    <Text style={[styles.actionText, quiet && styles.actionTextQuiet]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: colors.bg },
  // absoluteFill, not flex: the Unity view is scenery layered under the chrome, and giving it a
  // place in the flex flow would push the ring and the clock off the bottom of the screen.
  unity: { ...absoluteFill },
  // ⚠️ The art needs an explicit SIZE, not just four zero insets. Given only absoluteFill, this
  // Animated.Image laid out at the bitmap's own size — 1242 × 2688 pt on a 402 pt screen — and
  // pinned to the top-left, so the first second of the room was a 3× close-up of the wall scroll
  // and a curtain (reported from the simulator 23-09, "sao đang ở góc này?"). The Unity view
  // under it sizes correctly with the same style; only the image needed telling.
  art: { ...absoluteFill, width: '100%', height: '100%' },
  artSide: { position: 'absolute', top: 0, bottom: 0, left: 0 },
  artFill: { width: '100%', height: '100%' },
  artCentre: { position: 'absolute', top: 0, bottom: 0, left: '25%', right: '25%' },
  safe: { ...absoluteFill, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm, minHeight: RING_COMPACT + spacing.sm },
  // The HUD's compact ring, where My Room's top row puts its first control: md from the safe edge
  // (the screen's own gutter is xl, so it steps out of it).
  back: { marginLeft: spacing.md - spacing.xl, width: RING_COMPACT },
  headerMid: { flex: 1, alignItems: 'center' },
  headerEnd: { width: RING_COMPACT, alignItems: 'flex-end', marginRight: spacing.md - spacing.xl },
  fill: { flex: 1 },
  band: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: spacing.md },
  // The words of the state, over the floor's fade (BottomFade) — no box: the room is the surface.
  plate: { alignItems: 'center', gap: spacing.sm, maxWidth: 440 },
  plateTitle: { fontFamily: SERIF, fontSize: 24, color: MED.paper, letterSpacing: 0.4, textAlign: 'center' },
  plateLine: { fontFamily: SERIF, fontSize: 14, color: MED.ash, letterSpacing: 1.2, textAlign: 'center', marginBottom: spacing.xs },
  // While breathing: one word, quiet, and the rhythm under it.
  breathing: { alignItems: 'center', gap: spacing.md },
  phase: {
    fontFamily: SERIF,
    fontSize: 26,
    color: MED.paper,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(27,18,34,0.6)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 1 },
  },
  clock: {
    fontFamily: SERIF,
    fontSize: 14,
    letterSpacing: 1.5,
    color: MED.ash,
    fontVariant: ['tabular-nums'],
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowRadius: 6,
    textShadowOffset: { width: 0, height: 1 },
  },
  // The in-world gold call to action (the diary's and the world sheets'), and while breathing the
  // HUD's navy plate with its gold hairline: still reachable, no longer asking to be looked at.
  action: {
    alignSelf: 'center',
    minWidth: 200,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.gold,
    alignItems: 'center',
    shadowColor: colors.gold,
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  actionQuiet: {
    backgroundColor: PLATE,
    borderWidth: 1,
    borderColor: HAIRLINE,
    shadowOpacity: 0,
  },
  actionPressed: { transform: [{ scale: 0.97 }] },
  actionText: { ...typography.h3, color: '#1A1330' },
  actionTextQuiet: { color: IVORY },
});
