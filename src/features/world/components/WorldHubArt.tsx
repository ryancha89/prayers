import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Text } from '../../../shared/components/Text';
import { absoluteFill, colors, radius, spacing, typography } from '../../../shared/theme';
import { useT } from '../../../shared/i18n';
import { sfx } from '../../../shared/audio/sfx';
import type { WorldZone } from '../../counseling/types';
import { WORLD_ZONES } from '../data/zones';

/** The Sanctuary's arrival arch with the crystal beyond it — the Blender world build's own render
 *  (prayers_world_build/renders/premium/Cam_SanctuaryArrival, 1280×800, JPEG). */
const ARRIVAL = require('../assets/world_arrival.jpg');

/** Where each door's label floats over the picture, as a share of the box (no-player mode only). */
const LABEL_AT: Record<WorldZone, { x: number; y: number }> = {
  journey: { x: 0.5, y: 0.2 },
  counseling: { x: 0.22, y: 0.34 },
  meditation: { x: 0.78, y: 0.34 },
  myroom: { x: 0.2, y: 0.56 },
  shop: { x: 0.8, y: 0.56 },
};

/**
 * The world hub as a picture — what the World screen shows where there is no 3D behind it.
 *
 * Two jobs. With the player in the build it is the LOADING screen until WORLD_READY (a mounted
 * UnityView is opaque from its first frame, so without something over it the player would watch a
 * black rectangle load): the arrival arch, drifting slowly closer, with a quiet loader at the foot.
 * No door labels then — they would promise taps that do nothing (02-10: the old vector drawing
 * with five labels and a flat crystal read as broken, "làm lại phần này cho đẹp").
 * Without the player — jest, a simulator build with no Unity framework — it IS the world: the
 * doors' labels can be tapped, and a tap opens the same entrance overlay WORLD_ARRIVED does.
 *
 * Sized by its parent; never a parent of the UnityView (a transparent parent stops it drawing).
 */
export const WorldHubArt: React.FC<{ onZone?: (zone: WorldZone) => void; caption?: string }> = ({ onZone, caption }) => {
  const t = useT();
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // A slow push-in (Ken Burns) and a breathing loader; transform/opacity only, native driver.
    const a = Animated.loop(Animated.sequence([
      Animated.timing(drift, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(drift, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    const b = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]));
    const c = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }));
    a.start(); b.start(); c.start();
    return () => { a.stop(); b.stop(); c.stop(); };
  }, [drift, pulse, sweep]);

  const loading = !onZone && !!caption;
  return (
    <View style={styles.fill} pointerEvents="box-none">
      <Animated.Image
        source={ARRIVAL}
        resizeMode="cover"
        style={[styles.photo, { transform: [{ scale: drift.interpolate({ inputRange: [0, 1], outputRange: [1.04, 1.12] }) }] }]}
      />
      {/* Dusk over the picture: a violet wash at the top for the header, deeper at the foot for the
          loader — the app's indigo, so the hand-off to the 3D world reads as one place. */}
      <Svg style={StyleSheet.absoluteFill} preserveAspectRatio="none" viewBox="0 0 1 1">
        <Defs>
          <LinearGradient id="dusk" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#120E2A" stopOpacity="0.75" />
            <Stop offset="0.28" stopColor="#120E2A" stopOpacity="0.1" />
            <Stop offset="0.62" stopColor="#120E2A" stopOpacity="0.15" />
            <Stop offset="1" stopColor="#0B0A26" stopOpacity="0.92" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="1" height="1" fill="url(#dusk)" />
      </Svg>

      {loading && (
        <View style={styles.loader} pointerEvents="none" testID="world-loading">
          <Animated.View style={[styles.gem, {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }),
            transform: [{ rotate: '45deg' }, { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] }) }],
          }]} />
          <Text style={styles.caption}>{caption}</Text>
          <View style={styles.track}>
            <Animated.View style={[styles.bar, {
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-TRACK_W * 0.4, TRACK_W] }) }],
            }]} />
          </View>
        </View>
      )}

      {onZone && WORLD_ZONES.map(z => {
        const at = LABEL_AT[z.id];
        return (
          <Pressable
            key={z.id}
            accessibilityRole="button"
            accessibilityLabel={t(z.label)}
            onPress={() => { sfx.tap(); onZone(z.id); }}
            style={[styles.label, { left: `${at.x * 100}%`, top: `${at.y * 100}%` }]}>
            <Text style={styles.labelText}>{t(z.label)}</Text>
          </Pressable>
        );
      })}
      {!loading && caption ? <Text style={[styles.caption, styles.captionFree]}>{caption}</Text> : null}
    </View>
  );
};

const LABEL_W = 116;
const TRACK_W = 140;

const styles = StyleSheet.create({
  fill: { ...absoluteFill, width: '100%', height: '100%', backgroundColor: '#0B0A26', overflow: 'hidden' },
  // An explicit size: an Image given only zero insets lays out at the bitmap's own size.
  photo: { ...absoluteFill, width: '100%', height: '100%' },
  loader: { position: 'absolute', left: 0, right: 0, bottom: '12%', alignItems: 'center', gap: spacing.sm },
  gem: {
    width: 16, height: 16, borderRadius: 3, backgroundColor: '#CFC2FF',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.9)',
    shadowColor: '#A78BFA', shadowOpacity: 1, shadowRadius: 10, shadowOffset: { width: 0, height: 0 },
  },
  caption: { ...typography.caption, color: 'rgba(255,255,255,0.88)', textAlign: 'center', letterSpacing: 0.6 },
  captionFree: { position: 'absolute', left: 0, right: 0, top: '72%' },
  track: { width: TRACK_W, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  bar: { width: TRACK_W * 0.4, height: 2, borderRadius: 1, backgroundColor: colors.gold },
  label: {
    position: 'absolute',
    width: LABEL_W,
    marginLeft: -LABEL_W / 2,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(233,196,106,0.7)',
    backgroundColor: 'rgba(18,14,40,0.78)',
    alignItems: 'center',
  },
  labelText: { ...typography.caption, color: colors.textPrimary, fontWeight: '700' },
});
