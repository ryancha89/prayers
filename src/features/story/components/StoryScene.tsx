import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import { PLATES, PLATE_SIZE, type Expression } from '../data/plates';
import type { PlateId } from '../types';

/**
 * The room as the player sees it: one rendered plate (3d-modeling/cheese — the set and Cheese
 * modelled in Blender, rendered from the player's eyes), filling the screen, with the cat's face
 * swapped in place for blinks, speech and the smug look.
 *
 * The face variants are crops of the SAME render at the same camera (build_cheese_home.py), so
 * laid over the plate at their rect they match it pixel for pixel. All of a plate's variants stay
 * mounted and only their opacity changes — swapping an Image's source would flash on first decode.
 *
 * A slow push-in (Ken Burns) keeps the still frame alive; the plate and its faces move together.
 * A new plate cross-fades over the old one.
 */
export const StoryScene: React.FC<{ plate: PlateId | null; expression: Expression }> = ({ plate, expression }) => {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [layers, setLayers] = useState<{ id: PlateId; key: number }[]>(plate ? [{ id: plate, key: 0 }] : []);
  const fade = useRef(new Animated.Value(1)).current;
  const drift = useRef(new Animated.Value(0)).current;
  const keyRef = useRef(0);

  useEffect(() => {
    if (!plate) return;
    setLayers(ls => {
      if (ls.length && ls[ls.length - 1].id === plate) return ls;
      keyRef.current += 1;
      return [...ls.slice(-1), { id: plate, key: keyRef.current }];
    });
  }, [plate]);

  useEffect(() => {
    if (layers.length < 2) return;
    fade.setValue(0);
    Animated.timing(fade, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true })
      .start(({ finished }) => {
        if (finished) setLayers(ls => ls.slice(-1));
      });
  }, [layers, fade]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 16000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [drift]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize({ w: width, h: height });
  };

  const scale = drift.interpolate({ inputRange: [0, 1], outputRange: [1.0, 1.035] });

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none">
      {size && layers.map((l, i) => {
        const top = i === layers.length - 1 && layers.length > 1;
        return (
          <Animated.View
            key={l.key}
            style={[StyleSheet.absoluteFill, top && { opacity: fade }, { transform: [{ scale }] }]}>
            <Plate id={l.id} w={size.w} h={size.h} expression={i === layers.length - 1 ? expression : 'idle'} />
          </Animated.View>
        );
      })}
    </View>
  );
};

/** One plate, cover-fitted, with its face variants at their rect. */
const Plate: React.FC<{ id: PlateId; w: number; h: number; expression: Expression }> = ({ id, w, h, expression }) => {
  const p = PLATES[id];
  const s = Math.max(w / PLATE_SIZE.w, h / PLATE_SIZE.h);
  const dw = PLATE_SIZE.w * s;
  const dh = PLATE_SIZE.h * s;
  const ox = (w - dw) / 2;
  const oy = (h - dh) / 2;
  const face = p.face;
  const shown: Expression = face && face.variants[expression] ? expression : 'idle';
  return (
    <View style={StyleSheet.absoluteFill}>
      <Image source={p.image} style={{ position: 'absolute', left: ox, top: oy, width: dw, height: dh }} />
      {face && (Object.keys(face.variants) as Expression[]).map(k => {
        const [x0, y0, x1, y1] = face.rect;
        return (
          <Image
            key={k}
            source={face.variants[k]!}
            fadeDuration={0}
            style={{
              position: 'absolute',
              left: ox + x0 * dw,
              top: oy + y0 * dh,
              width: (x1 - x0) * dw,
              height: (y1 - y0) * dh,
              opacity: k === shown ? 1 : 0,
            }}
          />
        );
      })}
    </View>
  );
};
