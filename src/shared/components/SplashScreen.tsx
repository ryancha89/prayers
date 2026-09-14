import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { bundledSoundPath, bundledSoundBase } from '../audio/bundledSound';

/**
 * Animated splash (4s), after the "Prayers Splash Screen" storyboard:
 *   0.0-0.5s  dark screen → tiny golden light appears
 *   0.5-1.3s  light expands
 *   1.3-2.8s  lotus logo blooms in (fade + scale)
 *   2.8-3.7s  glow peak + floating particles
 *   3.7-4.0s  fades out, revealing the main screen underneath
 * Sound: one pre-mixed cue (chime → rising shimmer → gentle bell), synced to
 * the same timeline (src/shared/assets/splash-sound.m4a).
 */

// Optional native dep — keep the splash working even in builds without RNSound.
let SoundModule: any = null;
try {
  const mod = require('react-native-sound');
  SoundModule = mod?.default ?? mod;
} catch {
  SoundModule = null;
}

const { width: W, height: H } = Dimensions.get('window');
// Transparent-background variant (luminance→alpha), so no square edge shows.
const LOGO = require('../assets/lotus-logo-alpha.png');
// Bundled natively via react-native.config.js `assets` + react-native-asset.
const CHIME_FILE = 'splash_sound.m4a';

const PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  x: 0.15 + ((i * 0.61803) % 0.7), // golden-ratio spread, deterministic
  size: 2 + (i % 3) * 1.5,
  delay: 2600 + (i % 5) * 160,
  rise: 60 + (i % 4) * 30,
}));

export const SplashScreen: React.FC<{ onDone: () => void }> = ({ onDone }) => {
  const spark = useRef(new Animated.Value(0)).current; // tiny light 0→1
  const glow = useRef(new Animated.Value(0)).current; // expanding light 0→1
  const logo = useRef(new Animated.Value(0)).current; // logo reveal 0→1
  const peak = useRef(new Animated.Value(0)).current; // bloom pulse 0→1→0
  const fade = useRef(new Animated.Value(1)).current; // whole overlay 1→0
  const particles = useRef(PARTICLES.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const timing = (v: Animated.Value, toValue: number, duration: number, delay = 0) =>
      Animated.timing(v, {
        toValue,
        duration,
        delay,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      });

    const reveal = Animated.parallel([
      timing(spark, 1, 500),
      timing(glow, 1, 800, 500),
      timing(logo, 1, 1500, 1300),
      Animated.sequence([
        timing(peak, 1, 500, 2800),
        timing(peak, 0.35, 400),
      ]),
      timing(fade, 0, 300, 3700),
      ...particles.map((p, i) => timing(p, 1, 1400, PARTICLES[i].delay)),
    ]);
    reveal.start(({ finished }) => finished && onDone());

    // ⚠️ The splash is the one component in the app that exists to UNMOUNT ITSELF, and it was doing
    // it with seventeen native-driven values still attached. `useNativeDriver` hands each value to
    // the native side; dropping the component without stopping them leaves native nodes pushing
    // updates at JS listeners that have been torn down — "Sending `onAnimatedValueUpdate` with no
    // listeners registered", once per node that loses the race, at every launch.
    //
    // Nothing breaks, which is why it survived: the splash has already finished by then. But it is
    // the only warning the app prints on a clean start, and a log with a permanent warning in it is
    // a log nobody reads.
    return () => reveal.stop();
  }, [spark, glow, logo, peak, fade, particles, onDone]);

  const sound = useMemo(() => {
    if (!SoundModule) return null;
    try {
      SoundModule.setCategory?.('Ambient');
      // Plays as soon as loading finishes — within the 0-0.5s chime window.
      const s: any = new SoundModule(
        bundledSoundPath(CHIME_FILE),
        bundledSoundBase(SoundModule),
        (error: unknown) => {
        if (!error) s.play();
      });
      return s;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!sound) return;
    return () => sound.release();
  }, [sound]);

  const logoScale = logo.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const glowScale = glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] });

  return (
    <Animated.View style={[styles.overlay, { opacity: fade }]} pointerEvents="none">
      {/* Expanding golden light */}
      <Animated.View
        style={[styles.center, { opacity: glow, transform: [{ scale: glowScale }] }]}>
        <Svg width={W} height={W} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="g" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor="#FFE9B8" stopOpacity="0.55" />
              <Stop offset="45%" stopColor="#C9A86A" stopOpacity="0.18" />
              <Stop offset="100%" stopColor="#0A0A14" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#g)" />
        </Svg>
      </Animated.View>

      {/* Tiny spark that starts it all */}
      <Animated.View style={[styles.spark, { opacity: spark }]} />

      {/* Lotus logo bloom */}
      <Animated.View
        style={[styles.center, { opacity: logo, transform: [{ scale: logoScale }] }]}>
        <Image source={LOGO} style={styles.logo} resizeMode="contain" />
      </Animated.View>

      {/* Glow peak bloom */}
      <Animated.View style={[styles.center, { opacity: peak }]}>
        <Svg width={W * 0.9} height={W * 0.9} viewBox="0 0 100 100">
          <Defs>
            <RadialGradient id="p" cx="50%" cy="55%" r="50%">
              <Stop offset="0%" stopColor="#FFF6DC" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#FFF6DC" stopOpacity="0" />
            </RadialGradient>
          </Defs>
          <Circle cx="50" cy="50" r="50" fill="url(#p)" />
        </Svg>
      </Animated.View>

      {/* Floating magical particles */}
      {PARTICLES.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              left: p.x * W,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              opacity: particles[i].interpolate({
                inputRange: [0, 0.2, 0.7, 1],
                outputRange: [0, 0.9, 0.6, 0],
              }),
              transform: [
                {
                  translateY: particles[i].interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, -p.rise],
                  }),
                },
              ],
            },
          ]}
        />
      ))}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.flatten({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }),
    backgroundColor: '#010112',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    top: H / 2 - 3,
    left: W / 2 - 3,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFE9B8',
    shadowColor: '#FFD87A',
    shadowOpacity: 0.9,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  logo: { width: W * 0.72, height: W * 0.72 },
  particle: {
    position: 'absolute',
    top: H * 0.62,
    backgroundColor: '#FFE9B8',
  },
});
