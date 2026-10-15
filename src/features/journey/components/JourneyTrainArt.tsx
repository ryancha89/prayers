import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

/** The key art (Tools/journey_art/raw_hero — codex, 28-09): the night train on the viaduct. The
 *  whole painting, train included — for still uses such as the mini player's thumbnail. */
export const JOURNEY_HERO_ART = require('../assets/hero_2027.jpg');

/** The same painting split in two (Tools/journey_art/make_hero_train.py): the viaduct with no train,
 *  and the train + its golden smoke + its reflection as sprites that run along the track. */
const PLATE = require('../assets/hero_2027_plate.jpg');
const TRAIN = require('../assets/hero_train.png');
const TRAIN_REFLECTION = require('../assets/hero_train_reflect.png');
// Fractions of the square painting, printed by make_hero_train.py. Re-run it and paste on re-cut.
const TRAIN_BOX = [0.1731, 0.1352, 0.8611, 0.363];
const REFLECT_BOX = [0.1907, 0.6454, 0.8583, 0.8019];
/** Where the viaduct vanishes. Scaling a sprite about this point slides it along the track in
 *  perspective — the cars shrink toward the far end exactly as the painting draws them. */
const VP = { x: 0.0459, y: 0.3822 };
const VP_REFLECTED_Y = 0.7474;

// One pass: out of the distance, through its painted place, off the right edge. Scale grows
// exponentially (a steady approach in depth), so it reaches 1 — the painting — at ~63% of the run.
const PASS_MS = 6000;
const GAP_MS = 1000;
const SCALE_FAR = 0.12;
const SCALE_GONE = 3.4;
const PASS_STEPS = Array.from({ length: 24 }, (_, i) => i / 23);
const PASS_SCALES = PASS_STEPS.map(p => SCALE_FAR * Math.pow(SCALE_GONE / SCALE_FAR, p));

/** Where the stars glint, as a share of the painting — all in the sky. */
const GLINTS = [
  { x: 0.12, y: 0.1, d: 0 }, { x: 0.34, y: 0.05, d: 900 }, { x: 0.58, y: 0.14, d: 1700 },
  { x: 0.9, y: 0.3, d: 500 }, { x: 0.22, y: 0.26, d: 2300 },
];

/**
 * The journey's painting, alive: a slow Ken Burns drift, a few stars glinting, and the train
 * running along the viaduct on a loop. Fills its parent (lay it out as the parent's first child);
 * the painting is square, so it is drawn as a square that COVERS the parent and the sprites'
 * fractions land on the same pixels as the plate's.
 *
 * `still` shows the painting as painted — the train in its place, nothing moving (the destination
 * screen: the train has arrived). `fadeTo` melts the bottom of the art into a screen colour.
 */
export const JourneyTrainArt: React.FC<{ still?: boolean; fadeTo?: string }> = ({ still, fadeTo }) => {
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drift = useRef(new Animated.Value(0)).current;
  const pass = useRef(new Animated.Value(0)).current;
  const glint = useRef(GLINTS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (still) return undefined;
    const pan = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    const run = Animated.loop(
      Animated.sequence([
        Animated.timing(pass, { toValue: 1, duration: PASS_MS, easing: Easing.linear, useNativeDriver: true }),
        Animated.delay(GAP_MS),
        Animated.timing(pass, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    const twinkles = glint.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(GLINTS[i].d),
          Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 1100, useNativeDriver: true }),
          Animated.delay(2600),
        ]),
      ),
    );
    pan.start();
    run.start();
    twinkles.forEach(a => a.start());
    return () => {
      pan.stop();
      run.stop();
      twinkles.forEach(a => a.stop());
    };
  }, [still, drift, pass, glint]);

  const side = Math.max(box.w, box.h);
  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.06, 1.13] });
  const translateX = drift.interpolate({ inputRange: [0, 1], outputRange: [-8, 8] });
  const trainScale = pass.interpolate({ inputRange: PASS_STEPS, outputRange: PASS_SCALES });
  // Fades out over the last stretch: on a wide header the tail was still in frame when the pass
  // ended, and it stood frozen through the gap before snapping back (28-09).
  const trainOpacity = pass.interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 1, 1, 0] });
  const spriteStyle = (b: number[], vy: number) => {
    const left = b[0] * side, top = b[1] * side;
    return {
      position: 'absolute' as const, left, top,
      width: (b[2] - b[0]) * side, height: (b[3] - b[1]) * side,
      // The vanishing point, in the sprite's own coordinates (it lies left of the sprite).
      transformOrigin: [VP.x * side - left, vy * side - top, 0],
      opacity: trainOpacity,
      transform: [{ scale: trainScale }],
    };
  };

  return (
    <View
      // Clipped: the square that covers a short, wide header overflows it top and bottom, and the
      // overflow sat BELOW the fade as a hard-edged strip of lake (counselor picker, 28-09).
      style={[StyleSheet.absoluteFill, { overflow: 'hidden' }]}
      pointerEvents="none"
      onLayout={(e: LayoutChangeEvent) => setBox({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {side > 0 && (
        <Animated.View
          style={{
            position: 'absolute', width: side, height: side,
            left: (box.w - side) / 2, top: (box.h - side) / 2,
            transform: still ? [{ scale: 1.06 }] : [{ scale }, { translateX }],
          }}>
          {still ? (
            <Image source={JOURNEY_HERO_ART} style={{ width: side, height: side }} />
          ) : (
            <>
              <Image source={PLATE} style={{ width: side, height: side }} />
              <Animated.Image source={TRAIN_REFLECTION} style={spriteStyle(REFLECT_BOX, VP_REFLECTED_Y)} />
              <Animated.Image source={TRAIN} style={spriteStyle(TRAIN_BOX, VP.y)} />
              {GLINTS.map((g, i) => (
                <Animated.View
                  key={i}
                  style={[styles.glint, { left: g.x * side, top: g.y * side, opacity: glint[i] }]}
                />
              ))}
            </>
          )}
        </Animated.View>
      )}
      {fadeTo ? (
        <Svg style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id="artFade" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={fadeTo} stopOpacity={0.25} />
              <Stop offset="0.2" stopColor={fadeTo} stopOpacity={0} />
              <Stop offset="0.5" stopColor={fadeTo} stopOpacity={0.1} />
              <Stop offset="0.85" stopColor={fadeTo} stopOpacity={0.85} />
              <Stop offset="1" stopColor={fadeTo} stopOpacity={1} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#artFade)" />
        </Svg>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  glint: {
    position: 'absolute', width: 4, height: 4, borderRadius: 2, backgroundColor: '#FFF4D6',
    shadowColor: '#FFE7A3', shadowOpacity: 1, shadowRadius: 5, shadowOffset: { width: 0, height: 0 },
  },
});
