import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../../../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { RING_COMPACT, RingButton, SERIF } from '../../../shared/components/hud/Hud';
import { useLang, useT, type TranslationKey } from '../../../shared/i18n';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { backgroundMusic } from '../../../shared/audio/backgroundMusic';
import { useScreenAudio } from '../../../shared/audio/useScreenAudio';
import { holdScreenAwake } from '../../../shared/device/keepAwake';
import { useScreen } from '../../../shared/device/screen';
import { UnityHost } from '../../counseling/components/UnityHost';
import { getMeditationsBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import { clock, nextNoteKey, resultNoteKey } from '../../garden/gardenFlow';
import { DEFAULT_BREATH, phaseAt, type BreathConfig, type BreathPhase } from '../breathEngine';
import { fetchMeditations, type MeditationsMenu } from '../api/meditationsApi';
import { useMeditationSession } from '../useMeditationSession';

/**
 * The Snow Mountain (spec 010 US2): a snowy Himalayan slope, 4-4-6 guided breathing for
 * 3 / 5 / 10 / 20 minutes. The rewards on the duration sheet are the SERVER'S (FR-001) — this
 * screen renders them and computes none. The breath config is the server's too, driven here by
 * the parameterised breath engine; Unity breathes its snow and wind from the same config, sent
 * once at MEDI_INIT, never streamed.
 *
 * ZERO TOUCHES STILL PAYS IN FULL (US2-4): nothing on this screen is an input while breathing —
 * the ring, the phase word and the clock just run, and when the minutes are up the finish goes
 * out by itself. The screen is held awake for the whole sitting (US2-5) — the garden's own
 * `holdScreenAwake` treatment, verified in GardenScreen (its sitting/breathing/finishing effect).
 */

/** What the slope's UI hides of the view, for VIEW_INSETS: the top row and the bottom band. */
export function snowCoveredPx(r: MeasuredRects) {
  const { host, header, band } = r;
  if (!host) return null;
  const top = header ? header.y + header.height : 0;
  if (!band) return { top };
  return { top, bottom: host.height - band.y };
}

/** No MEDI_READY after this: stay on the drawn slope, as every room does. */
export const READY_FALLBACK_MS = 8000;

const PHASE_KEY: Record<BreathPhase, TranslationKey> = { in: 'med.in', hold: 'med.hold', out: 'med.out' };

export const SnowMountainScreen: React.FC = () => {
  const t = useT();
  const lang = useLang();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const screen = useScreen();
  const unity = isNativeUnity();
  const bridge = getMeditationsBridge();
  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape: screen.landscape,
    compute: snowCoveredPx,
  });
  const trackHost = insets.track('host');

  const [menu, setMenu] = useState<MeditationsMenu | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [minutes, setMinutes] = useState(5);
  const [tick, setTick] = useState<{ phase: BreathPhase; remainingSeconds: number } | null>(null);
  const [view, setView] = useState({ width: screen.width, height: screen.height });
  const breath = useRef<BreathConfig>(DEFAULT_BREATH);

  const session = useMeditationSession({
    kind: 'snow_mountain',
    settleFallbackMs: unity ? undefined : 0,
    onRunning: () => {
      bridge.sendMediState({ state: 'running' });
      sfx.bellIn();
      backgroundMusic.start('snowWind');
      startRing();
    },
  });

  /** The cover over the view until the slope answers (the drawn ring without Unity). */
  const veil = useRef(new Animated.Value(1)).current;
  /** The drawn breath ring's fullness, when there is no Unity slope. */
  const ring = useRef(new Animated.Value(0)).current;
  const ringLoop = useRef<Animated.CompositeAnimation | null>(null);

  const startRing = () => {
    const c = breath.current;
    ringLoop.current?.stop();
    ring.setValue(0);
    ringLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(ring, { toValue: 1, duration: c.inMs, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.delay(c.holdMs),
        Animated.timing(ring, { toValue: 0, duration: c.outMs, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    ringLoop.current.start();
  };

  // ── Arrive: the menu (durations + breath + cap notice), then the scene ──────────────────────
  const load = useCallback(async () => {
    setLoadError(false);
    const res = await fetchMeditations();
    if (!res || !res.snow) {
      setLoadError(true);
      return;
    }
    setMenu(res);
    breath.current = res.snow.breath;
    bridge.openMeditation({ experience: 'snow_mountain', lang, breath: res.snow.breath });
    bridge.sendMediState({ state: 'intro' });
  }, [bridge, lang]);

  useEffect(() => {
    load();
    const off = bridge.onEvent(e => {
      if (e.type === 'MEDI_READY') {
        Animated.timing(veil, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      } else if (e.type === 'MEDI_EVENT' && e.payload?.name === 'settled') {
        session.settle();
      }
    });
    const fallback = setTimeout(() => {
      if (!unity) veil.setValue(0);
    }, unity ? READY_FALLBACK_MS : 0);
    return () => {
      off();
      clearTimeout(fallback);
      ringLoop.current?.stop();
      backgroundMusic.stop();
      bridge.closeMeditation();
    };
    // Mount only: the slope is opened once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The clock, while breathing: when the minutes are up, finish by itself — zero touches.
  useEffect(() => {
    if (session.step !== 'running') return undefined;
    const length = session.minutes * 60 * 1000;
    const id = setInterval(() => {
      const elapsed = session.elapsed();
      const { phase } = phaseAt(breath.current, elapsed);
      setTick({ phase, remainingSeconds: Math.ceil(Math.max(0, length - elapsed) / 1000) });
      if (elapsed >= length) {
        clearInterval(id);
        ringLoop.current?.stop();
        backgroundMusic.stop();
        sfx.bellOut();
        bridge.sendMediState({ state: 'finishing' });
        session.finish();
      }
    }, 250);
    return () => clearInterval(id);
    // session's identity is stable per sitting; the step is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.step]);

  // A 20-minute sitting with hands in lap is exactly what the OS reads as "nobody is here" —
  // the garden's keep-awake treatment, held while running and finishing.
  useEffect(() => {
    if (session.step !== 'starting' && session.step !== 'running' && session.step !== 'finishing') return undefined;
    return holdScreenAwake();
  }, [session.step]);

  useEffect(() => {
    if (session.step === 'result') bridge.sendMediState({ state: 'done' });
  }, [session.step, bridge]);

  const begin = (m: number) => {
    sfx.select();
    setMinutes(m);
    setTick(null);
    session.begin(m);
  };

  const stop = () => {
    sfx.tap();
    ringLoop.current?.stop();
    backgroundMusic.stop();
    session.leave();
    bridge.sendMediState({ state: 'intro' });
  };

  // Leaving the screen mid-sitting is just leaving: nothing asked of the server.
  const { silence } = useScreenAudio(() => {
    session.leave();
    backgroundMusic.stop();
  });

  const leave = () => {
    silence();
    sfx.back();
    navigation.goBack();
  };

  // ── Render ──────────────────────────────────────────────────────────────────────────────────
  const bandHeight = screen.landscape ? screen.vh(0.36, 128, 170) : screen.vh(0.32, 220, 300);
  const capKey: TranslationKey | null = menu ? nextNoteKey(menu.today.nextPercent) : null;
  const running = session.step === 'starting' || session.step === 'running';
  const ringSize = Math.min(view.width, view.height) * 0.4;

  return (
    <View
      style={styles.bg}
      onLayout={e => {
        trackHost(e);
        const { width, height } = e.nativeEvent.layout;
        setView({ width, height });
      }}>
      {/* The Unity view is never hidden; the drawn slope fades OFF it once the scene answers. */}
      {unity && <UnityHost style={styles.fill} />}
      <Animated.View style={[styles.fill, styles.drawn, unity && { opacity: veil }]} pointerEvents="none">
        {/* The drawn breath ring — the whole guide without the 3D slope. */}
        <Animated.View
          style={[
            styles.ring,
            {
              width: ringSize,
              height: ringSize,
              borderRadius: ringSize / 2,
              transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.08] }) }],
              opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0.95] }),
            },
          ]}
        />
      </Animated.View>

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.header} onLayout={insets.track('header')} pointerEvents="box-none">
          <View style={styles.side}>
            <RingButton testID="snow-back" icon="back" size={RING_COMPACT} label={t('hud.back')} onPress={leave} />
          </View>
          <View style={styles.headerMid} pointerEvents="none" />
          <View style={[styles.side, styles.sideEnd]}>
            {running && (
              <RingButton testID="snow-stop" icon="stop" size={RING_COMPACT} label={t('meditations.snow.stop')} onPress={stop} muted />
            )}
          </View>
        </View>

        <View style={styles.grow} pointerEvents="box-none" />

        <View style={[styles.band, { height: bandHeight }]} onLayout={insets.track('band')} pointerEvents="box-none">
          {loadError ? (
            <View style={styles.plate}>
              <Text style={styles.line}>{t('meditations.error.load')}</Text>
              <ActionButton testID="snow-retry" label={t('meditations.retry')} onPress={() => { sfx.tap(); load(); }} />
            </View>
          ) : !menu ? (
            <Text style={styles.word}>{t('meditations.loading')}</Text>
          ) : session.step === 'idle' ? (
            <View style={styles.plate}>
              {session.error ? <Text style={styles.error} testID="snow-error">{t(session.error)}</Text> : null}
              {capKey ? <Text style={styles.line} testID="snow-cap">{t(capKey)}</Text> : null}
              <View style={styles.durations}>
                {menu.snow!.durations.map(d => (
                  <Pressable
                    key={d.minutes}
                    testID={`snow-duration-${d.minutes}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: d.minutes === minutes }}
                    accessibilityLabel={t('meditations.snow.minutes', { n: d.minutes })}
                    onPress={() => { sfx.tap(); setMinutes(d.minutes); }}
                    style={[styles.chip, d.minutes === minutes && styles.chipOn]}>
                    <Text style={[styles.chipMin, d.minutes === minutes && styles.chipMinOn]}>
                      {t('meditations.snow.minutes', { n: d.minutes })}
                    </Text>
                    <Text style={styles.chipReward} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {t('meditations.snow.reward', { xp: d.xp, gold: d.gold })}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <ActionButton testID="snow-begin" label={t('meditations.snow.begin')} onPress={() => begin(minutes)} />
            </View>
          ) : session.step === 'starting' ? (
            <Text style={styles.word}>{t('meditations.snow.settling')}</Text>
          ) : session.step === 'running' && tick ? (
            <View style={styles.breathing} pointerEvents="none">
              <Text style={styles.phase} testID="snow-phase">{t(PHASE_KEY[tick.phase])}</Text>
              <Text style={styles.clock}>{clock(tick.remainingSeconds)}</Text>
            </View>
          ) : session.step === 'finishing' ? (
            <View style={styles.plate}>
              {session.error ? (
                <>
                  <Text style={styles.error}>{t(session.error)}</Text>
                  <ActionButton testID="snow-retry-finish" label={t('meditations.retry')} onPress={() => { sfx.tap(); session.retryFinish(); }} />
                </>
              ) : (
                <Text style={styles.word}>{t('meditations.snow.finishing')}</Text>
              )}
            </View>
          ) : session.step === 'result' && session.result ? (
            <View style={styles.plate} testID="snow-result">
              <Text style={styles.title}>{t('meditations.result.title')}</Text>
              <View style={styles.rewards}>
                <Reward text={t('garden.result.xp', { n: session.result.reward.xp })} />
                <Reward text={t('garden.result.gold', { n: session.result.reward.gold })} gold />
                <Reward text={t('garden.result.energy', { n: session.result.reward.energy })} />
              </View>
              {resultNoteKey(session.result.reward.percent) ? (
                <Text style={styles.line}>{t(resultNoteKey(session.result.reward.percent)!)}</Text>
              ) : null}
              {session.result.levelUp ? (
                <ActionButton testID="snow-see-tree" label={t('garden.result.grow')}
                  onPress={() => { sfx.select(); silence(); navigation.replace('Garden'); }} />
              ) : null}
              <ActionButton testID="snow-done" label={t('meditations.result.done')} onPress={leave} quiet={session.result.levelUp} />
            </View>
          ) : null}
        </View>
      </SafeAreaView>
    </View>
  );
};

const ActionButton: React.FC<{ label: string; onPress: () => void; quiet?: boolean; testID?: string }> = ({ label, onPress, quiet, testID }) => (
  <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={label} onPress={onPress}
    style={({ pressed }) => [styles.action, quiet && styles.actionQuiet, pressed && styles.pressed]}>
    <Text style={[styles.actionText, quiet && styles.actionTextQuiet]}>{label}</Text>
  </Pressable>
);

const Reward: React.FC<{ text: string; gold?: boolean }> = ({ text, gold }) => (
  <View style={[styles.reward, gold && styles.rewardGold]}>
    <Text style={[styles.rewardText, gold && styles.rewardTextGold]} numberOfLines={1}>{text}</Text>
  </View>
);

/** The slope's palette: blue night snow, moon white. */
const SNOW = {
  night: '#0F1826',
  drift: '#2A3C55',
  moon: '#EAF2FB',
  mist: '#AFC3DC',
  glow: '#9CC7F2',
};

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: SNOW.night },
  fill: { ...absoluteFill },
  drawn: { alignItems: 'center', justifyContent: 'center', backgroundColor: SNOW.night },
  ring: {
    borderWidth: 3,
    borderColor: SNOW.glow,
    backgroundColor: 'rgba(156,199,242,0.12)',
    shadowColor: SNOW.glow,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  safe: { ...absoluteFill, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm, minHeight: RING_COMPACT + spacing.sm },
  side: { minWidth: RING_COMPACT, marginLeft: spacing.md - spacing.xl },
  sideEnd: { alignItems: 'flex-end', marginLeft: 0, marginRight: spacing.md - spacing.xl },
  headerMid: { flex: 1 },
  grow: { flex: 1 },
  band: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: spacing.md },
  plate: { alignItems: 'center', gap: spacing.sm, width: '100%', maxWidth: 440 },
  title: { fontFamily: SERIF, fontSize: 24, color: SNOW.moon, letterSpacing: 0.4, textAlign: 'center' },
  word: { fontFamily: SERIF, fontSize: 18, color: SNOW.moon, letterSpacing: 1, textAlign: 'center' },
  line: { fontFamily: SERIF, fontSize: 13, color: SNOW.mist, letterSpacing: 0.6, textAlign: 'center' },
  error: { ...typography.caption, color: colors.trending, textAlign: 'center' },
  durations: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(15,24,38,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(234,242,251,0.16)',
  },
  chipOn: { borderColor: SNOW.glow, backgroundColor: 'rgba(156,199,242,0.16)' },
  chipMin: { ...typography.bodyStrong, color: SNOW.mist },
  chipMinOn: { color: SNOW.moon },
  chipReward: { ...typography.tiny, color: SNOW.mist, marginTop: 2 },
  breathing: { alignItems: 'center', gap: spacing.sm },
  phase: {
    fontFamily: SERIF,
    fontSize: 26,
    color: SNOW.moon,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 1 },
  },
  clock: { fontFamily: SERIF, fontSize: 14, letterSpacing: 1.5, color: SNOW.mist, fontVariant: ['tabular-nums'] },
  rewards: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  reward: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(156,199,242,0.14)' },
  rewardGold: { backgroundColor: 'rgba(242,207,122,0.2)' },
  rewardText: { ...typography.bodyStrong, color: SNOW.moon },
  rewardTextGold: { color: '#F2CF7A' },
  action: {
    alignSelf: 'center',
    minWidth: 200,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: SNOW.glow,
    alignItems: 'center',
  },
  actionQuiet: { backgroundColor: 'rgba(15,24,38,0.78)', borderWidth: 1, borderColor: 'rgba(156,199,242,0.4)' },
  actionText: { ...typography.h3, color: SNOW.night },
  actionTextQuiet: { color: SNOW.moon },
  pressed: { transform: [{ scale: 0.97 }] },
});
