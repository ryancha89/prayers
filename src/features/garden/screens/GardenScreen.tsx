import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from '../../../shared/components/Text';
import { Icon } from '../../../shared/components/Icon';
import { RING_COMPACT, RingButton, SERIF } from '../../../shared/components/hud/Hud';
import { useLang, useT, type TranslationKey } from '../../../shared/i18n';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { sfx } from '../../../shared/audio/sfx';
import { backgroundMusic, meditationBed } from '../../../shared/audio/backgroundMusic';
import { useScreenAudio } from '../../../shared/audio/useScreenAudio';
import { holdScreenAwake } from '../../../shared/device/keepAwake';
import { useScreen } from '../../../shared/device/screen';
import { UnityHost } from '../../counseling/components/UnityHost';
import { getGardenBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import type { GardenStageState } from '../../counseling/types';
import {
  fetchGarden,
  finishSession,
  levelProgress,
  newRequestId,
  startSession,
  type Garden,
  type GardenDuration,
  type GardenFinish,
} from '../api/gardenApi';
import { EXHALE_MS, INHALE_MS, breathSync } from '../breath';
import { GardenSession, type GardenSessionState } from '../gardenSession';
import {
  GROWN_FALLBACK_MS,
  READY_FALLBACK_MS,
  SEATED_FALLBACK_MS,
  clock,
  elementKey,
  energyGlow,
  gardenInit,
  nextNoteKey,
  resultNoteKey,
  stageKey,
  xpToNext,
  type GardenStep,
} from '../gardenFlow';
import { DrawnGarden, DrawnOrb, EnergyRing, GARDEN, GardenButton } from '../components/GardenChrome';

/**
 * Tree of Mind — phase 1 (spec 008, Saju/Docs/TreeOfMind-Design-Proposal.html §2 and §6).
 *
 * The loop: enter the garden → pick 3 / 5 / 10 minutes → sit under the tree → breathe with the orb →
 * finish → XP · Gold · tree energy → the tree grows (or levels up). The split is Cafe's and Journey's:
 * this screen owns every word, the clock and the touches; the SERVER owns the reward (it pays only a
 * session that has really lasted its minutes on its own clock); Unity is the stage — the garden, the
 * tree, the figure sitting under it, the orb and the growth.
 *
 * THE CLOCK STARTS LATE ON PURPOSE. It starts when the server has answered `start` AND the figure has
 * sat down (GARDEN_SEATED, or a fallback), never at the tap. So the session the player sees is always
 * a little shorter than the one the server measured, and an honest finish can never be refused as
 * early.
 *
 * TOUCH NEVER COSTS ANYTHING (§2). Holding the screen is the in-breath and letting go the out-breath —
 * Unity's orb swells and sends its light up the tree — but a player who never touches still sits a
 * full session. Breaths taken with the guide only make the light brighter; they are reported for
 * tuning and no reward reads them.
 *
 * MUSIC ONLY, NO GUIDE VOICE (assumption, §8 Q6): the meditation bed starts with the breathing and
 * stops with it. The app's own bed is off here (App.tsx lists Garden as a Unity screen).
 */

/** What the garden's UI hides of the view, for VIEW_INSETS: the top row and the bottom band. */
export function gardenCoveredPx(r: MeasuredRects) {
  const { host, header, band } = r;
  if (!host) return null;
  const top = header ? header.y + header.height : 0;
  if (!band) return { top };
  return { top, bottom: host.height - band.y };
}

/** The duration picked when the garden opens: the middle one, the proposal's balanced choice. */
const DEFAULT_MINUTES = 5;
/** The hint about holding the screen shows for the first breaths only, then the words get out of
 *  the way. */
const HINT_BREATHS = 2;
/** TOO_EARLY is answered by waiting out the seconds the server names and asking again, this often. */
const TOO_EARLY_TRIES = 3;

export const GardenScreen: React.FC = () => {
  const t = useT();
  const lang = useLang();
  const navigation = useNavigation();
  const screen = useScreen();
  const landscape = screen.landscape;
  const unity = isNativeUnity();
  const bridge = getGardenBridge();
  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape,
    compute: gardenCoveredPx,
  });
  const trackHost = insets.track('host');

  const [step, setStepState] = useState<GardenStep>('loading');
  const stepRef = useRef<GardenStep>('loading');
  const setStep = useCallback((s: GardenStep) => {
    stepRef.current = s;
    setStepState(s);
  }, []);
  const [garden, setGarden] = useState<Garden | null>(null);
  const [durations, setDurations] = useState<GardenDuration[]>([]);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [finished, setFinished] = useState<GardenFinish | null>(null);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [tick, setTick] = useState<GardenSessionState | null>(null);
  const [view, setView] = useState({ width: screen.width, height: screen.height });

  const session = useRef(new GardenSession()).current;
  const sessionId = useRef<number | null>(null);
  /** One start intent's request_id: kept across a failed start so its retry is the same session. */
  const requestId = useRef<string | null>(null);
  const started = useRef(false);
  const seated = useRef(false);
  /** The length of the sitting under way (the picker may show another by the time it begins). */
  const sittingMinutes = useRef(DEFAULT_MINUTES);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timers.current.push(id);
  };
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };

  /** The cover over the view until the garden answers (the drawn garden without Unity). */
  const veil = useRef(new Animated.Value(1)).current;
  /** The drawn orb's fullness, when there is no Unity orb. */
  const orb = useRef(new Animated.Value(0)).current;
  const orbLoop = useRef<Animated.CompositeAnimation | null>(null);

  const tellStage = useCallback(
    (state: GardenStageState) => {
      const sync = breathSync(state === 'breathing' ? session.elapsed() : 0);
      bridge.sendGardenState({ state, inMs: sync.inMs, outMs: sync.outMs, intoMs: sync.intoMs });
    },
    [bridge, session],
  );

  // ── Arrive: load the garden, then open it in Unity at its real size ──────────────────────────
  const load = useCallback(async () => {
    setStep('loading');
    setError(null);
    const res = await fetchGarden();
    if (!res) {
      setStep('error');
      return;
    }
    setGarden(res.garden);
    setDurations(res.durations);
    bridge.openGarden(gardenInit(lang, res.garden));
    setStep('garden');
  }, [bridge, lang, setStep]);

  useEffect(() => {
    load();
    const off = bridge.onEvent(e => {
      if (e.type === 'GARDEN_READY') {
        Animated.timing(veil, { toValue: 0, duration: 420, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
      } else if (e.type === 'GARDEN_SEATED') {
        seated.current = true;
        beginRef.current();
      } else if (e.type === 'GARDEN_GROWN') {
        if (stepRef.current === 'growing') setStep('levelUp');
      }
    });
    // A garden that never answers leaves the drawn one up, not a black view.
    const fallback = setTimeout(() => {
      if (!unity) veil.setValue(0);
    }, unity ? READY_FALLBACK_MS : 0);
    return () => {
      off();
      clearTimeout(fallback);
      clearTimers();
      orbLoop.current?.stop();
      session.stop();
      backgroundMusic.stop();
      bridge.closeGarden();
    };
    // Mount only: the garden is opened once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── The sitting ─────────────────────────────────────────────────────────────────────────────
  const startOrb = () => {
    if (unity) return;
    orbLoop.current?.stop();
    orb.setValue(0);
    orbLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(orb, { toValue: 1, duration: INHALE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(orb, { toValue: 0, duration: EXHALE_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    orbLoop.current.start();
  };

  /** Both halves are in (the server's start, the figure seated): the clock starts now. */
  const begin = () => {
    if (!started.current || !seated.current || stepRef.current !== 'sitting') return;
    session.start(sittingMinutes.current);
    setTick(session.read());
    setStep('breathing');
    tellStage('breathing');
    sfx.bellIn();
    backgroundMusic.start(meditationBed(lang));
    startOrb();
  };
  // The mount-time listener (GARDEN_SEATED) and the timers call the latest `begin`, not the first one.
  const beginRef = useRef(begin);
  beginRef.current = begin;

  const sit = async (m: number) => {
    sfx.select();
    setMinutes(m);
    sittingMinutes.current = m;
    setError(null);
    setFinished(null);
    started.current = false;
    seated.current = false;
    sessionId.current = null;
    setStep('sitting');
    tellStage('sitting');
    // Unity sits the figure down and moves the camera in, then says GARDEN_SEATED; without it, go on.
    later(() => {
      seated.current = true;
      beginRef.current();
    }, unity ? SEATED_FALLBACK_MS : 0);
    requestId.current ??= newRequestId();
    const res = await startSession({ requestId: requestId.current, minutes: m });
    if (stepRef.current !== 'sitting') return; // stopped meanwhile
    if (!res.ok) {
      clearTimers();
      setError('garden.error.start');
      setStep('garden');
      tellStage('garden');
      return;
    }
    requestId.current = null;
    sessionId.current = res.session.id;
    started.current = true;
    beginRef.current();
  };

  const finish = useCallback(
    async (tries = TOO_EARLY_TRIES) => {
      const id = sessionId.current;
      if (id == null) return;
      const st = session.read();
      const res = await finishSession({ id, breaths: st.breaths, inRhythm: st.inRhythm });
      if (stepRef.current !== 'finishing') return;
      if (res.ok) {
        session.stop();
        setFinished(res);
        setGarden(res.garden);
        setStep('result');
        // No level crossed: the tree takes its new size and glow at once. A level-up waits for the
        // player to ask to see it (the five beats are the moment, not a side effect of the card).
        if (!res.levelUp) {
          bridge.sendGardenGrow({ level: res.garden.level, progress: levelProgress(res.garden), energy: energyGlow(res.garden.today.energy), levelUp: false });
        }
        return;
      }
      if (res.kind === 'tooEarly' && tries > 1) {
        later(() => finish(tries - 1), res.secondsLeft * 1000);
        return;
      }
      if (res.kind === 'closed') {
        session.stop();
        setError('garden.error.closed');
        setStep('garden');
        tellStage('garden');
        return;
      }
      setError('garden.error.finish');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bridge, session],
  );

  // The clock, while breathing: 4 Hz is plenty for a word and a minute counter.
  useEffect(() => {
    if (step !== 'breathing') return undefined;
    const id = setInterval(() => {
      const st = session.read();
      setTick(st);
      if (st.status === 'done') {
        clearInterval(id);
        orbLoop.current?.stop();
        backgroundMusic.stop();
        sfx.bellOut();
        setStep('finishing');
        tellStage('done');
        finish();
      }
    }, 250);
    return () => clearInterval(id);
  }, [step, session, tellStage, finish, setStep]);

  // Nobody touches the phone for ten minutes: exactly what the OS reads as "nobody is here".
  useEffect(() => {
    if (step !== 'sitting' && step !== 'breathing' && step !== 'finishing') return undefined;
    return holdScreenAwake();
  }, [step]);

  const stop = useCallback(() => {
    clearTimers();
    session.stop();
    orbLoop.current?.stop();
    backgroundMusic.stop();
    started.current = false;
    seated.current = false;
    // The server's open session stays open: it pays nothing unless finished, and the next start
    // abandons it.
    setStep('garden');
    tellStage('garden');
  }, [session, tellStage, setStep]);

  // Leaving the screen mid-sitting ends it: a clock left running behind another screen would pay for
  // minutes nobody sat through.
  const { silence } = useScreenAudio(() => {
    if (stepRef.current === 'sitting' || stepRef.current === 'breathing') stop();
    backgroundMusic.stop();
  });

  const leave = () => {
    silence();
    sfx.back();
    navigation.goBack();
  };

  const backToGarden = () => {
    sfx.tap();
    setFinished(null);
    setStep('garden');
    tellStage('garden');
  };

  const seeGrowth = () => {
    if (!finished) return;
    sfx.select();
    setStep('growing');
    bridge.sendGardenGrow({
      level: finished.garden.level,
      progress: levelProgress(finished.garden),
      energy: energyGlow(finished.garden.today.energy),
      levelUp: true,
    });
    later(() => {
      if (stepRef.current === 'growing') setStep('levelUp');
    }, unity ? GROWN_FALLBACK_MS : 0);
  };

  // ── Touch: the breath under the player's finger ───────────────────────────────────────────────
  const pressIn = () => {
    session.press();
    bridge.sendGardenTouch(true);
  };
  const pressOut = () => {
    const inRhythm = session.release();
    bridge.sendGardenTouch(false, inRhythm);
  };

  // ── Render ──────────────────────────────────────────────────────────────────────────────────
  const bandHeight = landscape ? screen.vh(0.36, 128, 170) : screen.vh(0.32, 220, 300);
  const running = step === 'sitting' || step === 'breathing';
  const g = garden;
  const levelLine = g ? t('garden.levelLine', { level: g.level, stem: g.stem, element: t(elementKey(g.element)) }) : '';
  const toNext = g ? xpToNext(g) : null;
  const showHint = step === 'breathing' && (tick?.breaths ?? 0) < HINT_BREATHS;

  return (
    <View
      style={styles.bg}
      onLayout={e => {
        trackHost(e);
        const { width, height } = e.nativeEvent.layout;
        setView({ width, height });
      }}>
      {/* The Unity view is never hidden (an embedded view under a transparent parent stops drawing —
          the meditation room's lesson); the drawn garden fades OFF it once the garden answers. */}
      {unity && <UnityHost style={styles.fill} />}
      <Animated.View style={[styles.fill, unity && { opacity: veil }]} pointerEvents="none">
        <DrawnGarden width={view.width} height={view.height} level={g?.level ?? 1} glow={g ? energyGlow(g.today.energy) : 0} />
      </Animated.View>

      {/* The breath under the finger: the whole middle of the screen, only while breathing. */}
      {step === 'breathing' && (
        <Pressable testID="garden-touch" style={styles.fill} onPressIn={pressIn} onPressOut={pressOut} accessibilityLabel={t('garden.hint')}>
          {!unity && (
            <View style={styles.orbBox} pointerEvents="none">
              <DrawnOrb fullness={orb} size={Math.min(view.width, view.height) * 0.42} />
            </View>
          )}
        </Pressable>
      )}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.header} onLayout={insets.track('header')} pointerEvents="box-none">
          <View style={styles.side}>
            <RingButton testID="garden-back" icon="back" size={RING_COMPACT} label={t('hud.back')} onPress={leave} />
          </View>
          <View style={styles.headerMid} pointerEvents="none">
            {g && !running && step !== 'growing' && (
              <View style={styles.titleRow}>
                <EnergyRing size={46} progress={levelProgress(g)} level={g.level} testID="garden-ring" />
                <View style={styles.titleText}>
                  <Text style={styles.level} numberOfLines={1} testID="garden-level">{levelLine}</Text>
                  <Text style={styles.stage} numberOfLines={1}>{t(stageKey(g.level))}</Text>
                  <Text style={styles.small} numberOfLines={1}>
                    {toNext == null ? t('garden.top') : t('garden.toNext', { xp: toNext })}
                  </Text>
                </View>
              </View>
            )}
          </View>
          <View style={[styles.side, styles.sideEnd]}>
            {running ? (
              <RingButton testID="garden-stop" icon="stop" size={RING_COMPACT} label={t('garden.stop')} onPress={() => { sfx.tap(); stop(); }} muted />
            ) : g ? (
              <View style={styles.gold} testID="garden-gold">
                <Icon name="coin" size={14} color={GARDEN.sap} />
                <Text style={styles.goldText} numberOfLines={1}>{t('garden.gold', { count: g.gold })}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.grow} pointerEvents="box-none" />

        <View style={[styles.band, { height: bandHeight }]} onLayout={insets.track('band')} pointerEvents="box-none">
          {step === 'loading' && <Text style={styles.word}>{t('garden.loading')}</Text>}

          {step === 'error' && (
            <View style={styles.plate}>
              <Text style={styles.line}>{t('garden.error.load')}</Text>
              <GardenButton testID="garden-retry" label={t('garden.retry')} onPress={() => { sfx.tap(); load(); }} />
            </View>
          )}

          {step === 'garden' && g && (
            <View style={styles.plate}>
              {error ? <Text style={styles.error} testID="garden-error">{t(error)}</Text> : null}
              {nextNoteKey(g.today.nextPercent) ? <Text style={styles.line}>{t(nextNoteKey(g.today.nextPercent)!)}</Text> : null}
              <View style={styles.durations}>
                {durations.map(d => (
                  <Pressable
                    key={d.minutes}
                    testID={`garden-duration-${d.minutes}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: d.minutes === minutes }}
                    accessibilityLabel={t('garden.minutes', { n: d.minutes })}
                    onPress={() => { sfx.tap(); setMinutes(d.minutes); }}
                    style={[styles.chip, d.minutes === minutes && styles.chipOn]}>
                    <Text style={[styles.chipMin, d.minutes === minutes && styles.chipMinOn]}>{t('garden.minutes', { n: d.minutes })}</Text>
                    <Text style={styles.chipReward} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                      {t('garden.durationReward', { xp: d.xp, gold: d.gold })}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <GardenButton testID="garden-sit" label={t('garden.sit')} onPress={() => sit(minutes)} />
            </View>
          )}

          {step === 'sitting' && <Text style={styles.word}>{t('garden.settling')}</Text>}

          {step === 'breathing' && tick && (
            <View style={styles.breathing} pointerEvents="none">
              <Text style={styles.phase} testID="garden-phase">{t(tick.phase === 'in' ? 'garden.in' : 'garden.out')}</Text>
              {showHint ? <Text style={styles.line}>{t('garden.hint')}</Text> : null}
              <Text style={styles.clock}>{clock(tick.remainingSeconds)}</Text>
            </View>
          )}

          {step === 'finishing' && (
            <View style={styles.plate}>
              {error ? (
                <>
                  <Text style={styles.error}>{t(error)}</Text>
                  <GardenButton testID="garden-retry-finish" label={t('garden.retry')} onPress={() => { sfx.tap(); setError(null); finish(); }} />
                </>
              ) : (
                <Text style={styles.word}>{t('garden.finishing')}</Text>
              )}
            </View>
          )}

          {step === 'result' && finished && (
            <View style={styles.plate} testID="garden-result">
              <Text style={styles.title}>{t('garden.result.title')}</Text>
              <View style={styles.rewards}>
                <Reward text={t('garden.result.xp', { n: finished.reward.xp })} />
                <Reward text={t('garden.result.gold', { n: finished.reward.gold })} gold />
                <Reward text={t('garden.result.energy', { n: finished.reward.energy })} />
              </View>
              {tick ? <Text style={styles.small}>{t('garden.result.breaths', { n: tick.breaths, sync: tick.inRhythm })}</Text> : null}
              {resultNoteKey(finished.reward.percent) ? <Text style={styles.line}>{t(resultNoteKey(finished.reward.percent)!)}</Text> : null}
              {finished.levelUp ? (
                <GardenButton testID="garden-grow" label={t('garden.result.grow')} onPress={seeGrowth} />
              ) : (
                <GardenButton testID="garden-home" label={t('garden.back')} onPress={backToGarden} quiet />
              )}
            </View>
          )}

          {step === 'levelUp' && g && (
            <View style={styles.plate} testID="garden-levelup">
              <Text style={styles.title}>{t('garden.levelUp.title')}</Text>
              <Text style={styles.level}>{levelLine}</Text>
              <Text style={styles.stage}>{t(stageKey(g.level))}</Text>
              <GardenButton testID="garden-home" label={t('garden.back')} onPress={backToGarden} quiet />
            </View>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

const Reward: React.FC<{ text: string; gold?: boolean }> = ({ text, gold }) => (
  <View style={[styles.reward, gold && styles.rewardGold]}>
    <Text style={[styles.rewardText, gold && styles.rewardTextGold]} numberOfLines={1}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: GARDEN.moss },
  fill: { ...absoluteFill },
  safe: { ...absoluteFill, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm, minHeight: RING_COMPACT + spacing.sm },
  side: { minWidth: RING_COMPACT, marginLeft: spacing.md - spacing.xl },
  sideEnd: { alignItems: 'flex-end', marginLeft: 0, marginRight: spacing.md - spacing.xl },
  headerMid: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, maxWidth: 320 },
  titleText: { flexShrink: 1 },
  level: { fontFamily: SERIF, fontSize: 16, color: GARDEN.mist, letterSpacing: 0.4 },
  stage: { fontFamily: SERIF, fontSize: 13, color: GARDEN.leaf, letterSpacing: 0.6 },
  small: { ...typography.tiny, color: GARDEN.dew, textAlign: 'center' },
  gold: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,31,26,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(242,207,122,0.45)',
  },
  goldText: { ...typography.tiny, color: GARDEN.sap },
  grow: { flex: 1 },
  band: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: spacing.md },
  plate: { alignItems: 'center', gap: spacing.sm, width: '100%', maxWidth: 440 },
  title: { fontFamily: SERIF, fontSize: 24, color: GARDEN.mist, letterSpacing: 0.4, textAlign: 'center' },
  word: { fontFamily: SERIF, fontSize: 18, color: GARDEN.mist, letterSpacing: 1, textAlign: 'center' },
  line: { fontFamily: SERIF, fontSize: 13, color: GARDEN.dew, letterSpacing: 0.6, textAlign: 'center' },
  error: { ...typography.caption, color: colors.trending, textAlign: 'center' },
  durations: { flexDirection: 'row', gap: spacing.sm, alignSelf: 'stretch' },
  chip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,31,26,0.72)',
    borderWidth: 1,
    borderColor: 'rgba(232,241,234,0.16)',
  },
  chipOn: { borderColor: GARDEN.leaf, backgroundColor: 'rgba(127,211,168,0.16)' },
  chipMin: { ...typography.bodyStrong, color: GARDEN.dew },
  chipMinOn: { color: GARDEN.mist },
  chipReward: { ...typography.tiny, color: GARDEN.dew, marginTop: 2 },
  breathing: { alignItems: 'center', gap: spacing.sm },
  phase: {
    fontFamily: SERIF,
    fontSize: 26,
    color: GARDEN.mist,
    letterSpacing: 1.5,
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowRadius: 12,
    textShadowOffset: { width: 0, height: 1 },
  },
  clock: { fontFamily: SERIF, fontSize: 14, letterSpacing: 1.5, color: GARDEN.dew, fontVariant: ['tabular-nums'] },
  orbBox: { ...absoluteFill, alignItems: 'center', justifyContent: 'center' },
  rewards: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  reward: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(127,211,168,0.16)' },
  rewardGold: { backgroundColor: 'rgba(242,207,122,0.18)' },
  rewardText: { ...typography.bodyStrong, color: GARDEN.leaf },
  rewardTextGold: { color: GARDEN.sap },
});
