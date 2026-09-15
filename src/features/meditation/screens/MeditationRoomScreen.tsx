import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../../../shared/components/Icon';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useT } from '../../../shared/i18n';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { backgroundMusic } from '../../../shared/audio/backgroundMusic';
import { holdScreenAwake } from '../../../shared/device/keepAwake';
import { BREATH, CYCLE_MS, MeditationSession, SESSION_MS, type Phase, type SessionState } from '../session';

/**
 * The meditation room: ten minutes, music and text, no guided voice (decided 15-09).
 *
 * WHY THERE IS NO UNITY HERE. Every other room in this app is a 3D scene behind a texture, and this
 * one deliberately is not: a breathing ring over the concept art does the same work with no export
 * cycle, no rig and no second audio owner. Nothing here assumes it can never move.
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
const RING = 244;
const RING_MIN = 0.62;
const RING_MAX = 1;
/** The ember's own orbit, a hair outside the stroke so it reads as travelling ON the ring. */
const EMBER = 9;

const PHASE_KEY: Record<Phase, 'med.in' | 'med.hold' | 'med.out'> = {
  in: 'med.in',
  hold: 'med.hold',
  out: 'med.out',
};

const clock = (ms: number) => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

export const MeditationRoomScreen: React.FC = () => {
  const t = useT();
  const navigation = useNavigation();
  const session = useRef(new MeditationSession()).current;
  const [state, setState] = useState<SessionState>(() => session.read());

  // Driven by their own animations rather than by the tick below: a value re-set thirty times a
  // second from JS stutters, and the breath is the one thing here that must not.
  const breath = useRef(new Animated.Value(RING_MIN)).current;
  const orbit = useRef(new Animated.Value(0)).current;
  const chrome = useRef(new Animated.Value(1)).current;
  const loops = useRef<Animated.CompositeAnimation[]>([]);

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
    sfx.bellOut();
    // The ten minutes are over; the room goes quiet with them rather than looping under an end
    // card. `stop` and not `pause`: the next session is a new sitting, not a continuation.
    backgroundMusic.stop();
  }, [state.status, stopAnimation]);

  // Leaving the tab pauses the breath. It is a tab now, so "leaving" is one tap and costs nothing —
  // but a session that kept counting down behind the counselor list would hand the player back four
  // minutes of silence they never sat through, and the music has already stopped by then anyway.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        session.pause();
        stopAnimation(true);
        setState(session.read());
        // The route rule swaps the app's bed back in on the way out; this only makes sure the
        // meditation loop is not the thing still playing while it does.
        backgroundMusic.stop();
      }),
    [navigation, session, stopAnimation],
  );

  useEffect(
    () => () => {
      stopAnimation(false);
      backgroundMusic.stop();
    },
    [stopAnimation],
  );

  const begin = () => {
    // The bell, not the UI tick: this press is the last thing the player looks at before their eyes
    // close, and a 55 ms mallet is an interface answering a tap rather than a room opening.
    sfx.bellIn();
    session.start();
    setState(session.read());
    startAnimation();
    backgroundMusic.start('meditation');
  };

  const pause = () => {
    sfx.tap();
    session.pause();
    stopAnimation(true);
    setState(session.read());
    // Held, not dropped: Carry on picks the track up where it stopped, the way the breath does.
    backgroundMusic.pause();
  };

  const leave = () => {
    sfx.back();
    navigation.goBack();
  };

  const again = () => {
    session.reset();
    setState(session.read());
    begin();
  };

  const running = state.status === 'running';
  const done = state.status === 'done';
  const remaining = state.status === 'idle' ? SESSION_MS : state.remainingSeconds * 1000;

  const spin = useMemo(
    () => orbit.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }),
    [orbit],
  );
  // The room sinks a little further back while breathing, so one word can carry the screen.
  const wash = useMemo(
    () => chrome.interpolate({ inputRange: [0, 1], outputRange: [0.44, 0.26] }),
    [chrome],
  );

  return (
    <ImageBackground source={require('../assets/room.jpg')} style={styles.bg} resizeMode="cover">
      <Animated.View style={[styles.wash, { opacity: wash }]} />
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          {/* The way out. It does NOT fade with the rest of the chrome: everything else on this
              screen may recede while the player breathes, but the door cannot. Quiet, not gone. */}
          <Pressable style={styles.back} onPress={leave} hitSlop={12}>
            <Icon name="back" size={22} color="#FFFFFF" />
          </Pressable>
          <Animated.View style={{ opacity: chrome }} pointerEvents="none">
            <Text style={styles.title}>{t('med.title')}</Text>
            <Text style={styles.subtitle}>{t('med.subtitle')}</Text>
          </Animated.View>
        </View>

        <View style={styles.middle}>
          {done ? (
            <View style={styles.done}>
              <Text style={styles.doneTitle}>{t('med.doneTitle')}</Text>
              <Text style={styles.doneBody}>
                {t('med.doneBody').replace('{0}', String(state.breaths))}
              </Text>
            </View>
          ) : (
            <>
              <Animated.View style={[styles.ringWrap, { transform: [{ scale: breath }] }]}>
                <View style={styles.ring}>
                  <Text style={styles.phase}>{running ? t(PHASE_KEY[state.phase]) : ''}</Text>
                </View>
                {running && (
                  <Animated.View
                    style={[styles.orbit, { transform: [{ rotate: spin }] }]}
                    pointerEvents="none">
                    <View style={styles.ember} />
                  </Animated.View>
                )}
              </Animated.View>
              <Text style={styles.clock}>{clock(remaining)}</Text>
              {state.status === 'paused' && <Text style={styles.paused}>{t('med.paused')}</Text>}
            </>
          )}
        </View>

        <View style={styles.actions}>
          {done ? (
            <Action label={t('med.again')} onPress={again} />
          ) : running ? (
            <Action label={t('med.pause')} onPress={pause} quiet />
          ) : (
            <Action label={state.status === 'paused' ? t('med.resume') : t('med.start')} onPress={begin} />
          )}
        </View>
      </SafeAreaView>
    </ImageBackground>
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
  wash: { ...absoluteFill, backgroundColor: '#181220' },
  safe: { flex: 1, justifyContent: 'space-between', paddingHorizontal: spacing.xl },
  header: { paddingTop: spacing.md },
  back: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(24,18,32,0.34)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    opacity: 0.85,
  },
  title: { ...typography.h1, color: '#FFFFFF' },
  subtitle: { ...typography.body, color: 'rgba(255,255,255,0.84)', marginTop: spacing.xs },
  middle: { alignItems: 'center', justifyContent: 'center' },
  ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
  ring: {
    ...absoluteFill,
    borderRadius: RING / 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.7)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  phase: { ...typography.h1, color: '#FFFFFF', letterSpacing: -0.2 },
  // The ember rides a full-size layer that rotates; the dot itself sits at 12 o'clock.
  orbit: { ...absoluteFill, alignItems: 'center' },
  ember: {
    width: EMBER,
    height: EMBER,
    borderRadius: EMBER / 2,
    backgroundColor: colors.gold,
    marginTop: -(EMBER / 2),
    shadowColor: colors.gold,
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  clock: {
    ...typography.caption,
    color: 'rgba(255,255,255,0.72)',
    marginTop: spacing.xl,
    fontVariant: ['tabular-nums'],
  },
  paused: { ...typography.caption, color: 'rgba(255,255,255,0.9)', marginTop: spacing.md },
  done: { alignItems: 'center' },
  doneTitle: { ...typography.h1, color: '#FFFFFF', textAlign: 'center' },
  doneBody: { ...typography.body, color: 'rgba(255,255,255,0.88)', marginTop: spacing.sm },
  actions: { paddingBottom: spacing.xl },
  action: {
    alignSelf: 'center',
    minWidth: 200,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
  },
  actionQuiet: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
  },
  actionPressed: { transform: [{ scale: 0.97 }] },
  actionText: { ...typography.h3, color: '#1A1524' },
  actionTextQuiet: { color: '#FFFFFF' },
});
