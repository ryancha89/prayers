import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text } from '../components/Text';
import { SERIF } from '../components/hud/Hud';
import { colors, spacing, typography } from '../theme';
import { useT } from '../i18n';
import { nativeUnityBridge } from '../../features/counseling/bridge';
import { MAX_MS, MIN_MS, PLACES, useSceneTransition } from './sceneTransition';

/**
 * The scene transition (see sceneTransition.ts): the place's picture full screen, darkening toward
 * the bottom where its name, a line about it and a tip sit, with three breathing dots for "loading".
 * Mounted once at the App root, above the navigator, so it covers every screen's own wait.
 *
 * It fades IN quickly (the screen beneath is already mounting) and OUT slowly once the place's READY
 * has arrived and MIN_MS has passed, so the 3D scene appears under it rather than popping in.
 */
export const SceneTransitionOverlay: React.FC = () => {
  const t = useT();
  const active = useSceneTransition(s => s.active);
  const end = useSceneTransition(s => s.end);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const fade = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  // What is on screen: kept through the fade-out after `active` has cleared.
  const [shown, setShown] = useState(active);

  useEffect(() => {
    if (!active) {
      Animated.timing(fade, { toValue: 0, duration: 450, easing: Easing.out(Easing.quad), useNativeDriver: true })
        .start(({ finished }) => { if (finished) setShown(null); });
      return undefined;
    }
    setShown(active);
    fade.stopAnimation();
    Animated.timing(fade, { toValue: 1, duration: 180, useNativeDriver: true }).start();
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true }));
    loop.start();

    const place = PLACES[active.place];
    let readyAt = 0;
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    const close = () => end(active.seq);
    const closeWhenRead = () => {
      const wait = Math.max(0, active.startedAt + MIN_MS - Date.now());
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = setTimeout(close, wait);
    };
    const off = nativeUnityBridge.onEvent(e => {
      if (e.type !== place.ready || readyAt) return;
      readyAt = Date.now();
      closeWhenRead();
    });
    // A place that never answers must not hold the player behind a picture.
    const giveUp = setTimeout(close, MAX_MS);
    return () => {
      off();
      loop.stop();
      clearTimeout(giveUp);
      if (closeTimer) clearTimeout(closeTimer);
    };
  }, [active, end, fade, pulse]);

  if (!shown) return null;
  const place = PLACES[shown.place];
  const title = shown.name ?? t(place.title);
  const dot = (i: number) => ({
    opacity: pulse.interpolate({
      inputRange: [0, (i + 0.5) / 4, (i + 1.5) / 4, 1].map(v => Math.min(1, v)),
      outputRange: [0.25, 1, 0.25, 0.25],
      extrapolate: 'clamp',
    }),
  });

  return (
    <Animated.View
      testID="scene-transition"
      pointerEvents={active ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.root, { opacity: fade }]}>
      <Image source={shown.art ?? place.art} style={{ width, height }} resizeMode="cover" blurRadius={2} />
      {/* darker toward the words: two layers make a cheap gradient without a native module */}
      <View style={[StyleSheet.absoluteFill, styles.wash]} />
      <View style={[styles.lowerWash, { height: height * 0.55 }]} />
      <View style={[styles.copy, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.intro}>
          {shown.name ? t(place.intro).replace('{name}', shown.name) : t(place.intro).replace('{name}', title)}
        </Text>
        <View style={styles.rule} />
        <Text style={styles.tipLabel}>{t('transition.tipLabel')}</Text>
        <Text style={styles.tip}>{t(shown.tip)}</Text>
        <View style={styles.dots}>
          {[0, 1, 2].map(i => (
            <Animated.View key={i} style={[styles.dot, dot(i)]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  root: { backgroundColor: '#13101c', zIndex: 1000, elevation: 1000 },
  wash: { backgroundColor: 'rgba(19,16,28,0.28)' },
  lowerWash: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(12,10,20,0.72)' },
  copy: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.xl, gap: spacing.sm },
  title: { fontFamily: SERIF, fontSize: 30, color: '#F3E9D7', letterSpacing: 0.5 },
  intro: { ...typography.body, color: 'rgba(243,233,215,0.85)', lineHeight: 22 },
  rule: { height: 1, width: 48, backgroundColor: 'rgba(233,196,106,0.6)', marginVertical: spacing.sm },
  tipLabel: { ...typography.caption, color: colors.gold, letterSpacing: 1.5, textTransform: 'uppercase' },
  tip: { ...typography.body, color: 'rgba(243,233,215,0.92)', lineHeight: 22 },
  dots: { flexDirection: 'row', gap: 8, marginTop: spacing.lg, alignSelf: 'center' },
  dot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: '#F3E9D7' },
});
