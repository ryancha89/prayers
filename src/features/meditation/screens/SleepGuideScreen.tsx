import React, { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { RING_COMPACT, RingButton, SERIF } from '../../../shared/components/hud/Hud';
import { useLang, useT } from '../../../shared/i18n';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { ArtWait, BottomFade, MED, Vignette } from '../components/BreathStage';
import { SleepSession, type SleepState } from '../sleepSession';
import { useScreenAudio } from '../../../shared/audio/useScreenAudio';
import { UnityHost } from '../../counseling/components/UnityHost';
import { isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets } from '../../counseling/bridge/viewInsets';
import { useScreen } from '../../../shared/device/screen';
import { meditationCoveredPx } from './MeditationRoomScreen';
import { beginSceneTransition } from '../../../shared/transition/sceneTransition';

/**
 * The sleep guide: thirty minutes of a spoken guide over quiet music, for someone already in bed.
 *
 * Built from the meditation room's parts — its session shape (sleepSession.ts reuses the meditation
 * session's clock), its dusk palette and lantern (BreathStage), its HUD ring for the way out. No
 * breathing ring, no bells: a bell at bedtime is an alarm.
 *
 * THE YOGA GIRL IS HERE (22-10, PM: "please implement it with the yoga character"). The screen opens
 * the meditation room's Unity scene — the same room and the same girl (f_char_004) — as scenery,
 * exactly as MeditationRoomScreen does (MEDITATION_INIT, the threshold held over the player until
 * MEDITATION_READY, VIEW_INSETS so she is framed above the words). Nothing new on the Unity side:
 * MEDITATION_STATE already carries its own breath pattern, so she is sent SLEEP_BREATH — slower than
 * the room's 4-4-6, the out-breath longest — with her eyes shut while the guide runs. A night shade
 * over the room takes it down to bedtime.
 *
 * DIFFERENCES FROM THE MEDITATION ROOM, ON PURPOSE
 *  · It starts on arrival. Tapping the card IS the decision; asking again on a dark screen is one
 *    more thing to read with eyes that are closing.
 *  · The screen is NOT held awake. It is meant to lock; the audio carries on behind the lock
 *    (Playback category + UIBackgroundModes `audio`, see sleepAudio.ts).
 *  · Leaving STOPS rather than pauses. Nobody comes back to minute 17 of a sleep guide.
 *  · Nothing plays after 30:00. The end is a quiet card with Replay, which starts both tracks from 0.
 *
 * The music is the session's, as in the meditation room: App.tsx only silences the app's bed on this
 * route (`SELF_SCORED_SCREENS`); this screen starts and stops its own.
 */
/** Her breath while the guide plays: ~5 a minute, the out-breath the longest — the pace of someone
 *  falling asleep, not the room's 4-4-6 exercise. Nobody follows it; it only has to look restful. */
export const SLEEP_BREATH = { inMs: 5000, holdMs: 1000, outMs: 7000 };
const SLEEP_CYCLE_MS = SLEEP_BREATH.inMs + SLEEP_BREATH.holdMs + SLEEP_BREATH.outMs;

/** What the girl in the room is told for each state of the guide (MEDITATION_STATE). */
export const roomStateFor = (status: SleepState['status']): 'idle' | 'breathing' | 'paused' | 'done' =>
  status === 'running' ? 'breathing' : status === 'paused' ? 'paused' : status === 'done' ? 'done' : 'idle';

const clock = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const SleepGuideScreen: React.FC = () => {
  // The shared loading screen (picture, intro, tip) until this place's READY — sceneTransition.ts.
  useEffect(() => { beginSceneTransition('sleep'); }, []);
  const t = useT();
  const lang = useLang();
  const navigation = useNavigation();
  const session = useRef(new SleepSession()).current;
  const [state, setState] = useState<SleepState>(() => session.read());
  const screen = useScreen();
  const insets = useViewInsets({
    send: isNativeUnity() ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape: screen.landscape,
    compute: r => meditationCoveredPx(r, screen.landscape),
  });
  const trackHost = insets.track('host');
  const [view, setView] = useState({ width: screen.width, height: screen.height });
  /** The threshold over the player, 1 until the room answers (see MeditationRoomScreen for why it
   *  is the overlay that fades, never the Unity view). */
  const veil = useRef(new Animated.Value(1)).current;

  // The room, opened on the way in and closed on the way out; the threshold lifts when it answers.
  // No answer at all (an older player, a bridge that never woke) leaves the threshold — the screen
  // this always was — and the guide plays on regardless.
  useEffect(() => {
    if (!isNativeUnity()) return undefined;
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type !== 'MEDITATION_READY') return;
      Animated.timing(veil, { toValue: 0, duration: 600, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    });
    nativeUnityBridge.openMeditationRoom();
    return () => {
      off();
      nativeUnityBridge.closeMeditationRoom();
    };
  }, [veil]);

  // Her eyes and breath follow the guide: shut and breathing slowly while it plays. Sent on each
  // change of state (and on resume with where in the breath the guide now is); Unity clocks it.
  useEffect(() => {
    if (!isNativeUnity()) return;
    nativeUnityBridge.sendMeditationState({
      state: roomStateFor(state.status),
      ...SLEEP_BREATH,
      intoMs: Math.max(0, state.elapsedMs) % SLEEP_CYCLE_MS,
    });
    // Only on a change of status: the clock ticking must not re-sync her every second.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status]);

  /** The waiting picture's slow drift (in and out over ~11 s): a night light, not a spinner. */
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 5000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 6000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  // Start on arrival; stop on the way out, whichever way out it is. The language is read once, at
  // the start: a session does not switch voices halfway through (Replay picks it up again).
  useEffect(() => {
    const off = session.subscribe(setState);
    session.start(lang);
    setState(session.read());
    const offBlur = navigation.addListener('blur', () => {
      session.stop();
      setState(session.read());
    });
    return () => {
      off();
      offBlur();
      session.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, navigation]);

  // The clock, and the 30:00 guard. JS timers may sleep with the screen locked; the bed's own end
  // callback still ends the session, and coming back to the front re-checks the clock at once.
  useEffect(() => {
    if (state.status !== 'running') return undefined;
    const id = setInterval(() => setState(session.tick()), 1000);
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') setState(session.tick());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.status, session]);

  const pause = () => {
    sfx.tap();
    session.pause();
    setState(session.read());
  };
  const resume = () => {
    sfx.tap();
    session.resume();
    setState(session.read());
  };
  const replay = () => {
    sfx.tap();
    session.replay(lang);
    setState(session.read());
  };
  const leave = () => {
    session.stop();
    sfx.back();
    navigation.goBack();
  };

  useScreenAudio(() => { session.stop(); setState(session.read()); });
  const { status } = state;
  const remainingMs = state.remainingSeconds * 1000;

  return (
    <View
      style={styles.bg}
      testID="sleep-screen"
      onLayout={e => {
        trackHost(e);
        const { width, height } = e.nativeEvent.layout;
        setView({ width, height });
      }}>
      {isNativeUnity() ? (
        <>
          {/* The room at the back, never hidden (MeditationRoomScreen explains why); night over it;
              the threshold on top until the room answers. */}
          <UnityHost style={styles.unity} />
          <View style={styles.night} pointerEvents="none" />
          <Vignette width={view.width} height={view.height} strength={0.9} />
          <BottomFade width={view.width} height={260} />
          <Animated.View style={[styles.veil, { opacity: veil }]} pointerEvents="none" testID="sleep-veil">
            <ArtWait source={SLEEP_ART} blur={3} testID="sleep-art" title={t('home.sleep')} pulse={pulse} width={view.width} height={view.height} />
          </Animated.View>
        </>
      ) : (
        <View style={styles.veil} pointerEvents="none">
          <ArtWait source={SLEEP_ART} blur={3} testID="sleep-art" title={t('home.sleep')} pulse={pulse} width={view.width} height={view.height} />
        </View>
      )}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
        <View style={styles.header} onLayout={insets.track('header')}>
          <View style={styles.back}>
            <RingButton testID="sleep-back" icon="back" size={RING_COMPACT} label={t('sleep.stop')} onPress={leave} />
          </View>
          <View style={styles.fill} />
          <View style={styles.headerEnd}>
            {status === 'running' && (
              <RingButton testID="sleep-pause" icon="pause" size={RING_COMPACT} label={t('sleep.pause')} onPress={pause} muted />
            )}
          </View>
        </View>

        <View style={styles.fill} />

        <View style={styles.band} onLayout={insets.track('band')}>
          {status === 'done' ? (
            <View style={styles.plate}>
              <Text style={styles.plateTitle}>{t('sleep.doneTitle')}</Text>
              <Text style={styles.plateLine}>{t('sleep.doneBody')}</Text>
              <Action testID="sleep-replay" label={t('sleep.replay')} onPress={replay} />
            </View>
          ) : status === 'unavailable' ? (
            <View style={styles.plate}>
              <Text style={styles.plateLine}>{t('sleep.unavailable')}</Text>
            </View>
          ) : status === 'idle' || status === 'loading' ? (
            <View style={styles.plate}>
              <Text style={styles.plateLine}>{t('sleep.loading')}</Text>
            </View>
          ) : (
            <View style={styles.plate}>
              <Text style={styles.plateLine}>{status === 'paused' ? t('sleep.paused') : t('sleep.line')}</Text>
              <Text style={styles.elapsed} testID="sleep-elapsed">{clock(state.elapsedMs)}</Text>
              <Text style={styles.clock}>{t('sleep.left', { time: clock(remainingMs) })}</Text>
              {status === 'paused' && <Action testID="sleep-resume" label={t('sleep.resume')} onPress={resume} />}
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

/** The sleep card's own picture (the girl asleep in her room at night): what the screen shows while
 *  the room loads, and all it shows without the player (ArtWait; it replaced the lone lantern, 22-10). */
const SLEEP_ART = require('../assets/sleep_card.jpg');

/** The meditation room's call to action, dimmer: it is past bedtime. */
const Action: React.FC<{ label: string; onPress: () => void; testID?: string }> = ({ label, onPress, testID }) => (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    onPress={onPress}
    style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}>
    <Text style={styles.actionText}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: MED.dusk },
  unity: { ...absoluteFill },
  // The meditation room is lit for dusk; this is bedtime. Over the room, under the words.
  night: { ...absoluteFill, backgroundColor: 'rgba(10,6,22,0.38)' },
  veil: { ...absoluteFill, backgroundColor: MED.dusk },
  // The lantern sits a little above the middle, clear of the words in the band.
  safe: { ...absoluteFill, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm, minHeight: RING_COMPACT + spacing.sm },
  back: { marginLeft: spacing.md - spacing.xl, width: RING_COMPACT },
  headerEnd: { width: RING_COMPACT, alignItems: 'flex-end', marginRight: spacing.md - spacing.xl },
  fill: { flex: 1 },
  band: { alignItems: 'center', paddingBottom: spacing.xl, minHeight: 200, justifyContent: 'flex-end' },
  plate: { alignItems: 'center', gap: spacing.sm, maxWidth: 440 },
  plateTitle: { fontFamily: SERIF, fontSize: 24, color: MED.paper, letterSpacing: 0.4, textAlign: 'center' },
  plateLine: { fontFamily: SERIF, fontSize: 14, color: MED.ash, letterSpacing: 1.2, textAlign: 'center', marginBottom: spacing.xs },
  elapsed: { fontFamily: SERIF, fontSize: 32, color: MED.paper, letterSpacing: 2, fontVariant: ['tabular-nums'] },
  clock: { fontFamily: SERIF, fontSize: 13, letterSpacing: 1.5, color: MED.ash, fontVariant: ['tabular-nums'] },
  action: {
    alignSelf: 'center',
    minWidth: 200,
    marginTop: spacing.sm,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.gold,
    alignItems: 'center',
    opacity: 0.88,
  },
  actionPressed: { transform: [{ scale: 0.97 }] },
  actionText: { ...typography.h3, color: '#1A1330' },
});
