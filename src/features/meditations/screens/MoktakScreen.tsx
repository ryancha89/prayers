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
import { tick, useHapticsStore } from '../../../shared/haptics';
import { holdScreenAwake } from '../../../shared/device/keepAwake';
import { useScreen } from '../../../shared/device/screen';
import { UnityHost } from '../../counseling/components/UnityHost';
import { getMeditationsBridge, isNativeUnity, nativeUnityBridge } from '../../counseling/bridge';
import { useViewInsets, type MeasuredRects } from '../../counseling/bridge/viewInsets';
import { nextNoteKey, resultNoteKey } from '../../garden/gardenFlow';
import { fetchMeditations, type MeditationsMenu } from '../api/meditationsApi';
import { MOKTAK_TAPS, MoktakCount } from '../moktak';
import { useMeditationSession } from '../useMeditationSession';

/**
 * The Wooden Fish (spec 010 US1): a candle-lit temple at night, a moktak in front of the player,
 * 108 taps at their own pace, then the garden's reward.
 *
 * THE COUNT, THE SOUND AND THE HAPTIC LIVE HERE (FR-007/FR-008): every tap plays a bundled hit
 * from RN and ticks the phone, so a dead Unity view changes nothing about the loop — the drawn
 * moktak disc under the finger IS the experience without the 3D temple. Unity only animates the
 * strike (MEDI_TAP). The tap floor is RN's (moktak.ts); the server never sees individual taps and
 * floor-guards elapsed time instead, which is why the reward is keyed by kind, never by drumming.
 */

/** What the temple's UI hides of the view, for VIEW_INSETS: the top row and the bottom band. */
export function moktakCoveredPx(r: MeasuredRects) {
  const { host, header, band } = r;
  if (!host) return null;
  const top = header ? header.y + header.height : 0;
  if (!band) return { top };
  return { top, bottom: host.height - band.y };
}

/** No MEDI_READY after this: stay on the drawn stage, as every room does. */
export const READY_FALLBACK_MS = 8000;

export const MoktakScreen: React.FC = () => {
  const t = useT();
  const lang = useLang();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const screen = useScreen();
  const unity = isNativeUnity();
  const bridge = getMeditationsBridge();
  const haptics = useHapticsStore(s => s.enabled);
  const toggleHaptics = useHapticsStore(s => s.toggle);
  const insets = useViewInsets({
    send: unity ? i => nativeUnityBridge.sendViewInsets(i) : undefined,
    landscape: screen.landscape,
    compute: moktakCoveredPx,
  });
  const trackHost = insets.track('host');

  const [menu, setMenu] = useState<MeditationsMenu | null>(null);
  const [loadError, setLoadError] = useState(false);
  const moktak = useRef(new MoktakCount()).current;
  const [count, setCount] = useState(0);
  const [view, setView] = useState({ width: screen.width, height: screen.height });

  const session = useMeditationSession({
    kind: 'moktak',
    // Without Unity there is nobody to settle: the clock waits on the server alone.
    settleFallbackMs: unity ? undefined : 0,
    onRunning: () => {
      bridge.sendMediState({ state: 'running' });
      // The temple's room tone starts with the sitting, the garden's way; this is a Unity screen,
      // so the app's own bed is already off (App.tsx).
      backgroundMusic.start('templeAmbience');
    },
  });

  /** The cover over the view until the temple answers (the drawn moktak without Unity). */
  const veil = useRef(new Animated.Value(1)).current;
  /** The drawn moktak's flinch on a counted strike. */
  const punch = useRef(new Animated.Value(0)).current;

  // ── Arrive: the menu (cap notice), the scene, the session ────────────────────────────────────
  const load = useCallback(async () => {
    setLoadError(false);
    const res = await fetchMeditations();
    if (!res || !res.moktak) {
      setLoadError(true);
      return;
    }
    setMenu(res);
    bridge.openMeditation({ experience: 'moktak', lang, haptics: useHapticsStore.getState().enabled });
    bridge.sendMediState({ state: 'intro' });
    // The sitting opens with the room (acceptance #1: the server has an open session on arrival).
    session.begin();
    // session.begin is stable for one sitting; re-running on its identity would restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      backgroundMusic.stop();
      bridge.closeMeditation();
    };
    // Mount only: the temple is opened once per visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 108 slow taps is still a player who IS here — but the gaps between them can pass a minute.
  useEffect(() => {
    if (session.step !== 'running' && session.step !== 'finishing') return undefined;
    return holdScreenAwake();
  }, [session.step]);

  useEffect(() => {
    if (session.step === 'result') bridge.sendMediState({ state: 'done' });
  }, [session.step, bridge]);

  // Leaving mid-sitting is just leaving: nothing asked of the server (abandon-on-leave).
  const { silence } = useScreenAudio(() => {
    session.leave();
    backgroundMusic.stop();
  });

  const leave = () => {
    silence();
    sfx.back();
    navigation.goBack();
  };

  // ── The strike ──────────────────────────────────────────────────────────────────────────────
  const onTap = () => {
    if (session.step !== 'running') return;
    const r = moktak.tap(Date.now());
    // A refused tap still sounds (acceptance #3): the instrument answers every touch, the count
    // only the honest ones.
    sfx.moktakHit();
    bridge.sendMediTap(r.count, r.counted);
    if (!r.counted) return;
    tick();
    setCount(r.count);
    if (!unity) {
      punch.setValue(1);
      Animated.timing(punch, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    }
    if (r.done) {
      sfx.moktakBell();
      bridge.sendMediState({ state: 'finishing' });
      session.finish({ taps: MOKTAK_TAPS });
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────────────────────
  const bandHeight = screen.landscape ? screen.vh(0.34, 120, 160) : screen.vh(0.3, 200, 280);
  const capKey: TranslationKey | null = menu ? nextNoteKey(menu.today.nextPercent) : null;
  const discSize = Math.min(view.width, view.height) * 0.42;

  return (
    <View
      style={styles.bg}
      onLayout={e => {
        trackHost(e);
        const { width, height } = e.nativeEvent.layout;
        setView({ width, height });
      }}>
      {/* The Unity view is never hidden (the meditation room's lesson); the drawn temple fades OFF
          it once the scene answers MEDI_READY. */}
      {unity && <UnityHost style={styles.fill} />}
      <Animated.View style={[styles.fill, styles.drawn, unity && { opacity: veil }]} pointerEvents="none">
        {/* The drawn moktak: a warm disc in the dark — the fallback instrument, not an icon. */}
        <Animated.View
          style={[
            styles.disc,
            {
              width: discSize,
              height: discSize,
              borderRadius: discSize / 2,
              transform: [{ scale: punch.interpolate({ inputRange: [0, 1], outputRange: [1, 0.94] }) }],
            },
          ]}>
          <View style={[styles.discSlit, { width: discSize * 0.5 }]} />
        </Animated.View>
      </Animated.View>

      {/* The whole screen is the instrument while the sitting runs. */}
      {session.step === 'running' && (
        <Pressable testID="moktak-tap" style={styles.fill} onPress={onTap} accessibilityLabel={t('meditations.moktak.hint')} />
      )}

      <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']} pointerEvents="box-none">
        <View style={styles.header} onLayout={insets.track('header')} pointerEvents="box-none">
          <View style={styles.side}>
            <RingButton testID="moktak-back" icon="back" size={RING_COMPACT} label={t('hud.back')} onPress={leave} />
          </View>
          <View style={styles.headerMid} pointerEvents="none">
            {(session.step === 'running' || session.step === 'finishing') && (
              <Text style={styles.counter} testID="moktak-count">
                {t('meditations.moktak.count', { n: count, total: MOKTAK_TAPS })}
              </Text>
            )}
          </View>
          <View style={[styles.side, styles.sideEnd]}>
            <Pressable
              testID="moktak-haptics"
              accessibilityRole="switch"
              accessibilityState={{ checked: haptics }}
              accessibilityLabel={t('meditations.moktak.haptics')}
              onPress={() => { sfx.tap(); toggleHaptics(); }}
              style={[styles.hapticsPill, haptics && styles.hapticsPillOn]}>
              <Text style={[styles.hapticsText, haptics && styles.hapticsTextOn]} numberOfLines={1}>
                {t('meditations.moktak.haptics')}
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.grow} pointerEvents="box-none" />

        <View style={[styles.band, { height: bandHeight }]} onLayout={insets.track('band')} pointerEvents="box-none">
          {loadError ? (
            <View style={styles.plate}>
              <Text style={styles.line}>{t('meditations.error.load')}</Text>
              <ActionButton testID="moktak-retry" label={t('meditations.retry')} onPress={() => { sfx.tap(); load(); }} />
            </View>
          ) : session.step === 'idle' && session.error ? (
            <View style={styles.plate}>
              <Text style={styles.error} testID="moktak-error">{t(session.error)}</Text>
              <ActionButton testID="moktak-retry-start" label={t('meditations.retry')} onPress={() => { sfx.tap(); session.begin(); }} />
            </View>
          ) : session.step === 'starting' || !menu ? (
            <Text style={styles.word}>{t('meditations.loading')}</Text>
          ) : session.step === 'running' ? (
            <View style={styles.plate} pointerEvents="none">
              {capKey ? <Text style={styles.line} testID="moktak-cap">{t(capKey)}</Text> : null}
              {count < 3 ? <Text style={styles.line}>{t('meditations.moktak.hint')}</Text> : null}
            </View>
          ) : session.step === 'finishing' ? (
            <View style={styles.plate}>
              {session.error ? (
                <>
                  <Text style={styles.error}>{t(session.error)}</Text>
                  <ActionButton testID="moktak-retry-finish" label={t('meditations.retry')} onPress={() => { sfx.tap(); session.retryFinish(); }} />
                </>
              ) : (
                <Text style={styles.word}>{t('meditations.moktak.finishing')}</Text>
              )}
            </View>
          ) : session.step === 'result' && session.result ? (
            <View style={styles.plate} testID="moktak-result">
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
                <ActionButton testID="moktak-see-tree" label={t('garden.result.grow')}
                  onPress={() => { sfx.select(); silence(); navigation.replace('Garden'); }} />
              ) : null}
              <ActionButton testID="moktak-done" label={t('meditations.result.done')} onPress={leave} quiet={session.result.levelUp} />
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

/** The temple's palette: lacquer dark, candle gold. */
const TEMPLE = {
  night: '#17110C',
  wood: '#5C3A21',
  woodEdge: '#8A5A33',
  candle: '#F2CF7A',
  paper: '#F4EADB',
  ash: '#B9A98F',
};

const styles = StyleSheet.create({
  bg: { flex: 1, backgroundColor: TEMPLE.night },
  fill: { ...absoluteFill },
  drawn: { alignItems: 'center', justifyContent: 'center', backgroundColor: TEMPLE.night },
  disc: {
    backgroundColor: TEMPLE.wood,
    borderWidth: 3,
    borderColor: TEMPLE.woodEdge,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: '12%',
    shadowColor: TEMPLE.candle,
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
  },
  discSlit: { height: 6, borderRadius: 3, backgroundColor: TEMPLE.night, opacity: 0.8 },
  safe: { ...absoluteFill, paddingHorizontal: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.sm, minHeight: RING_COMPACT + spacing.sm },
  side: { minWidth: RING_COMPACT, marginLeft: spacing.md - spacing.xl },
  sideEnd: { alignItems: 'flex-end', marginLeft: 0, marginRight: spacing.md - spacing.xl },
  headerMid: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.sm },
  counter: { fontFamily: SERIF, fontSize: 22, color: TEMPLE.paper, letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
  hapticsPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(23,17,12,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(242,207,122,0.4)',
  },
  hapticsPillOn: { backgroundColor: TEMPLE.candle },
  hapticsText: { ...typography.tiny, color: TEMPLE.paper },
  hapticsTextOn: { color: TEMPLE.night },
  grow: { flex: 1 },
  band: { justifyContent: 'flex-end', alignItems: 'center', paddingBottom: spacing.md },
  plate: { alignItems: 'center', gap: spacing.sm, width: '100%', maxWidth: 440 },
  title: { fontFamily: SERIF, fontSize: 24, color: TEMPLE.paper, letterSpacing: 0.4, textAlign: 'center' },
  word: { fontFamily: SERIF, fontSize: 18, color: TEMPLE.paper, letterSpacing: 1, textAlign: 'center' },
  line: { fontFamily: SERIF, fontSize: 13, color: TEMPLE.ash, letterSpacing: 0.6, textAlign: 'center' },
  error: { ...typography.caption, color: colors.trending, textAlign: 'center' },
  rewards: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', justifyContent: 'center' },
  reward: { paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: 'rgba(242,207,122,0.14)' },
  rewardGold: { backgroundColor: 'rgba(242,207,122,0.26)' },
  rewardText: { ...typography.bodyStrong, color: TEMPLE.paper },
  rewardTextGold: { color: TEMPLE.candle },
  action: {
    alignSelf: 'center',
    minWidth: 200,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    backgroundColor: TEMPLE.candle,
    alignItems: 'center',
  },
  actionQuiet: { backgroundColor: 'rgba(23,17,12,0.78)', borderWidth: 1, borderColor: 'rgba(242,207,122,0.4)' },
  actionText: { ...typography.h3, color: TEMPLE.night },
  actionTextQuiet: { color: TEMPLE.paper },
  pressed: { transform: [{ scale: 0.97 }] },
});
