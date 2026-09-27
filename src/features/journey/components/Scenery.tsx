import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, LayoutChangeEvent, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import type { SceneKey } from '../types';

/**
 * The view from the train window, drawn — until the AI footage arrives (JourneyBackdrop swaps in an
 * image or a video for any chapter that has one).
 *
 * Parallax is what makes it a train and not a picture: every layer is a tile twice the width of the
 * window, slid left on its own period — far mountains over a minute, the poles by the track in a
 * few seconds. `speed` scales all of them together; the station transition runs it up and brings
 * the train to a stop by turning it down.
 */

type Layer =
  | { kind: 'mountains' | 'hills'; color: string; base: number; amp: number; seed: number; period: number }
  | { kind: 'skyline'; color: string; base: number; min: number; max: number; seed: number; period: number; lit?: string; litShare?: number }
  | { kind: 'pines'; color: string; base: number; size: number; seed: number; period: number }
  | { kind: 'blossoms'; trunk: string; bloom: string; base: number; size: number; seed: number; period: number }
  | { kind: 'poles'; color: string; period: number; lamp?: string }
  | { kind: 'lake'; color: string; shine: string; base: number; period: number }
  | { kind: 'clouds'; color: string; y: number; seed: number; period: number };

interface Scene {
  sky: [string, string, string];
  stars: number;
  body?: { kind: 'moon' | 'sun'; x: number; y: number; r: number; color: string; glow: string; rise?: boolean };
  layers: Layer[];
  ground: string;
}

/** base / y / amp are fractions of the window's height; the window is always the unit. */
export const SCENES: Record<SceneKey, Scene> = {
  station: {
    sky: ['#070620', '#161240', '#2A1F55'],
    stars: 70,
    body: { kind: 'moon', x: 0.78, y: 0.2, r: 0.06, color: '#F4ECD0', glow: 'rgba(244,236,208,0.25)' },
    layers: [
      { kind: 'skyline', color: '#1B1738', base: 0.72, min: 0.08, max: 0.22, seed: 3, period: 70000, lit: '#E9C46A', litShare: 0.06 },
      { kind: 'hills', color: '#120F2C', base: 0.8, amp: 0.05, seed: 5, period: 32000 },
      { kind: 'poles', color: '#090818', period: 5200, lamp: '#FFD98A' },
    ],
    ground: '#0A0918',
  },
  dawnCity: {
    sky: ['#26275E', '#9A6A9E', '#F7B38A'],
    stars: 8,
    body: { kind: 'sun', x: 0.3, y: 0.5, r: 0.08, color: '#FFE2B8', glow: 'rgba(255,200,160,0.55)' },
    layers: [
      { kind: 'skyline', color: '#2E2A5C', base: 0.78, min: 0.12, max: 0.34, seed: 11, period: 60000 },
      { kind: 'skyline', color: '#1A1740', base: 0.84, min: 0.16, max: 0.44, seed: 12, period: 26000, lit: '#FFE6B0', litShare: 0.08 },
      { kind: 'poles', color: '#0C0B1E', period: 4800 },
    ],
    ground: '#0E0C22',
  },
  nightCity: {
    sky: ['#05041A', '#1A0F3A', '#3D1F63'],
    stars: 20,
    layers: [
      { kind: 'skyline', color: '#2A1B50', base: 0.76, min: 0.14, max: 0.36, seed: 21, period: 64000, lit: '#B79BFF', litShare: 0.12 },
      { kind: 'skyline', color: '#150D30', base: 0.86, min: 0.2, max: 0.5, seed: 22, period: 24000, lit: '#E9C46A', litShare: 0.3 },
      { kind: 'poles', color: '#07061A', period: 4400, lamp: '#E9C46A' },
    ],
    ground: '#07061A',
  },
  springSunset: {
    sky: ['#2B1B4F', '#B0507A', '#F4A860'],
    stars: 0,
    body: { kind: 'sun', x: 0.62, y: 0.66, r: 0.11, color: '#FFD88F', glow: 'rgba(255,200,140,0.45)' },
    layers: [
      { kind: 'clouds', color: 'rgba(255,200,210,0.35)', y: 0.28, seed: 31, period: 90000 },
      { kind: 'hills', color: '#5A2E5E', base: 0.74, amp: 0.07, seed: 32, period: 52000 },
      { kind: 'hills', color: '#3D1F48', base: 0.82, amp: 0.05, seed: 33, period: 26000 },
      { kind: 'blossoms', trunk: '#241230', bloom: '#F5A3C7', base: 0.94, size: 0.2, seed: 34, period: 7000 },
    ],
    ground: '#2A1536',
  },
  forestLake: {
    sky: ['#0B1726', '#1F3B4D', '#4E7A7A'],
    stars: 30,
    body: { kind: 'moon', x: 0.22, y: 0.22, r: 0.04, color: '#EAF4F0', glow: 'rgba(220,240,235,0.2)' },
    layers: [
      { kind: 'mountains', color: '#1E3440', base: 0.62, amp: 0.2, seed: 41, period: 80000 },
      { kind: 'lake', color: '#24495A', shine: 'rgba(200,235,235,0.35)', base: 0.7, period: 40000 },
      { kind: 'pines', color: '#10242B', base: 0.84, size: 0.16, seed: 42, period: 22000 },
      { kind: 'pines', color: '#07141A', base: 0.98, size: 0.3, seed: 43, period: 6500 },
    ],
    ground: '#07141A',
  },
  sunrise: {
    sky: ['#1D1B45', '#8A4F7D', '#F6C177'],
    stars: 6,
    body: { kind: 'sun', x: 0.5, y: 0.72, r: 0.14, color: '#FFE3A3', glow: 'rgba(255,215,150,0.5)', rise: true },
    layers: [
      { kind: 'clouds', color: 'rgba(255,225,200,0.3)', y: 0.35, seed: 51, period: 80000 },
      { kind: 'hills', color: '#3B2B55', base: 0.76, amp: 0.06, seed: 52, period: 48000 },
      { kind: 'hills', color: '#2A2040', base: 0.86, amp: 0.04, seed: 53, period: 20000 },
      { kind: 'poles', color: '#120E24', period: 5600 },
    ],
    ground: '#1A1430',
  },
  arrival: {
    sky: ['#15123A', '#6B4A8A', '#F0C98A'],
    stars: 10,
    body: { kind: 'sun', x: 0.7, y: 0.7, r: 0.1, color: '#FFE0A6', glow: 'rgba(255,215,160,0.4)' },
    layers: [
      { kind: 'skyline', color: '#3A2B60', base: 0.74, min: 0.1, max: 0.26, seed: 61, period: 90000, lit: '#FFE0A6', litShare: 0.1 },
      { kind: 'poles', color: '#140F2A', period: 16000, lamp: '#FFE0A6' },
    ],
    ground: '#120E26',
  },
};

// ── Deterministic shapes ─────────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed * 9301 + 49297;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

/** A tile is drawn at [0, w) and again at [w, 2w), so sliding it by w loops without a seam. */
function tileTwice(draw: (dx: number) => React.ReactNode, w: number) {
  return (
    <>
      <G>{draw(0)}</G>
      <G>{draw(w)}</G>
    </>
  );
}

function ridge(w: number, h: number, base: number, amp: number, seed: number, smooth: boolean, dx: number) {
  const r = rng(seed);
  const n = smooth ? 6 : 10;
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) pts.push([dx + (w * i) / n, h * (base - amp * (0.3 + 0.7 * r()))]);
  // Ends meet at the same height so the two copies join.
  pts[n][1] = pts[0][1];
  let d = `M${dx} ${h}L${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i <= n; i++) {
    if (smooth) {
      const [px, py] = pts[i - 1];
      const [x, y] = pts[i];
      d += `Q${(px + x) / 2} ${py} ${x} ${y}`;
    } else {
      d += `L${pts[i][0]} ${pts[i][1]}`;
    }
  }
  return `${d}L${dx + w} ${h}Z`;
}

function LayerTile({ layer, w, h }: { layer: Layer; w: number; h: number }) {
  switch (layer.kind) {
    case 'mountains':
    case 'hills':
      return tileTwice(dx => <Path d={ridge(w, h, layer.base, layer.amp, layer.seed, layer.kind === 'hills', dx)} fill={layer.color} />, w);
    case 'skyline': {
      const r = rng(layer.seed);
      const blocks: { x: number; bw: number; bh: number }[] = [];
      for (let x = 0; x < w; ) {
        const bw = w * (0.05 + 0.07 * r());
        blocks.push({ x, bw: Math.min(bw, w - x), bh: h * (layer.min + (layer.max - layer.min) * r()) });
        x += bw;
      }
      const windows: { x: number; y: number }[] = [];
      if (layer.lit) {
        blocks.forEach(b => {
          for (let y = h * layer.base - b.bh + 6; y < h * layer.base - 6; y += 9) {
            for (let x = b.x + 4; x < b.x + b.bw - 5; x += 7) if (r() < (layer.litShare ?? 0.1)) windows.push({ x, y });
          }
        });
      }
      return tileTwice(
        dx => (
          <>
            {blocks.map((b, i) => (
              <Rect key={i} x={dx + b.x} y={h * layer.base - b.bh} width={b.bw + 0.5} height={b.bh + h * (1 - layer.base)} fill={layer.color} />
            ))}
            {windows.map((p, i) => (
              <Rect key={`w${i}`} x={dx + p.x} y={p.y} width={2.5} height={3.5} fill={layer.lit} opacity={0.85} />
            ))}
          </>
        ),
        w,
      );
    }
    case 'pines': {
      const r = rng(layer.seed);
      const trees: { x: number; s: number }[] = [];
      for (let x = 0; x < w; x += w * (0.035 + 0.05 * r())) trees.push({ x, s: h * layer.size * (0.6 + 0.4 * r()) });
      return tileTwice(
        dx => (
          <>
            {trees.map((t, i) => {
              const bx = dx + t.x;
              const by = h * layer.base;
              return <Path key={i} d={`M${bx} ${by - t.s}L${bx + t.s * 0.28} ${by}L${bx - t.s * 0.28} ${by}Z`} fill={layer.color} />;
            })}
            <Rect x={dx} y={h * layer.base - 1} width={w + 1} height={h * (1 - layer.base) + 1} fill={layer.color} />
          </>
        ),
        w,
      );
    }
    case 'blossoms': {
      const r = rng(layer.seed);
      const trees: { x: number; s: number }[] = [];
      for (let x = w * 0.1; x < w; x += w * (0.28 + 0.2 * r())) trees.push({ x, s: h * layer.size * (0.7 + 0.3 * r()) });
      return tileTwice(
        dx => (
          <>
            {trees.map((t, i) => {
              const bx = dx + t.x;
              const by = h * layer.base;
              return (
                <G key={i}>
                  <Rect x={bx - 2} y={by - t.s * 0.8} width={4} height={t.s * 0.8} fill={layer.trunk} />
                  {[[-0.3, -0.85, 0.32], [0.25, -0.9, 0.3], [0, -1.05, 0.34], [-0.1, -0.75, 0.28], [0.35, -0.72, 0.24]].map(([ox, oy, rr], k) => (
                    <Circle key={k} cx={bx + t.s * ox} cy={by + t.s * oy} r={t.s * rr} fill={layer.bloom} opacity={0.85} />
                  ))}
                </G>
              );
            })}
          </>
        ),
        w,
      );
    }
    case 'poles': {
      const gap = w / 2;
      return tileTwice(
        dx => (
          <>
            {[0, gap].map((x, i) => (
              <G key={i}>
                <Rect x={dx + x} y={h * 0.18} width={5} height={h * 0.82} fill={layer.color} />
                {layer.lamp && (
                  <>
                    <Circle cx={dx + x + 2.5} cy={h * 0.18} r={16} fill={layer.lamp} opacity={0.12} />
                    <Circle cx={dx + x + 2.5} cy={h * 0.18} r={3.5} fill={layer.lamp} />
                  </>
                )}
              </G>
            ))}
            <Line x1={dx} y1={h * 0.22} x2={dx + w} y2={h * 0.22} stroke={layer.color} strokeWidth={1.5} />
          </>
        ),
        w,
      );
    }
    case 'lake':
      return tileTwice(
        dx => (
          <>
            <Rect x={dx} y={h * layer.base} width={w + 1} height={h * (1 - layer.base)} fill={layer.color} />
            {[0.1, 0.35, 0.6, 0.82].map((f, i) => (
              <Rect key={i} x={dx + w * f} y={h * (layer.base + 0.03 + 0.02 * i)} width={w * 0.12} height={1.5} fill={layer.shine} />
            ))}
          </>
        ),
        w,
      );
    case 'clouds': {
      const r = rng(layer.seed);
      const puffs = [0.1, 0.45, 0.75].map(f => ({ x: w * f, y: h * (layer.y + 0.06 * (r() - 0.5)), s: w * (0.08 + 0.05 * r()) }));
      return tileTwice(
        dx => (
          <>
            {puffs.map((p, i) => (
              <G key={i}>
                <Circle cx={dx + p.x} cy={p.y} r={p.s * 0.5} fill={layer.color} />
                <Circle cx={dx + p.x + p.s * 0.5} cy={p.y + 4} r={p.s * 0.42} fill={layer.color} />
                <Circle cx={dx + p.x - p.s * 0.5} cy={p.y + 5} r={p.s * 0.36} fill={layer.color} />
              </G>
            ))}
          </>
        ),
        w,
      );
    }
  }
}

function SlidingLayer({ layer, w, h, speed }: { layer: Layer; w: number; h: number; speed: number }) {
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (speed <= 0) return;
    x.setValue(0);
    const loop = Animated.loop(
      Animated.timing(x, { toValue: 1, duration: layer.period / speed, easing: Easing.linear, useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [speed, layer.period, x]);
  const translateX = x.interpolate({ inputRange: [0, 1], outputRange: [0, -w] });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { width: w * 2, transform: [{ translateX }] }]}>
      <Svg width={w * 2} height={h}>
        <LayerTile layer={layer} w={w} h={h} />
      </Svg>
    </Animated.View>
  );
}

export const Scenery: React.FC<{ scene: SceneKey; speed?: number }> = ({ scene, speed = 1 }) => {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const def = SCENES[scene];
  const twinkle = useRef(new Animated.Value(0.6)).current;
  const rise = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(twinkle, { toValue: 1, duration: 1800, useNativeDriver: true }),
        Animated.timing(twinkle, { toValue: 0.5, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [twinkle]);

  useEffect(() => {
    rise.setValue(0);
    if (!def.body?.rise) return;
    const a = Animated.timing(rise, { toValue: 1, duration: 40000, easing: Easing.out(Easing.quad), useNativeDriver: true });
    a.start();
    return () => a.stop();
  }, [scene, def.body?.rise, rise]);

  const stars = useMemo(() => {
    const r = rng(7 + def.stars);
    return Array.from({ length: def.stars }, () => ({ x: r(), y: r() * 0.6, s: 0.6 + r() * 1.2 }));
  }, [def.stars]);

  const onLayout = (e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height });
  const { w, h } = size;

  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: def.sky[0] }]} onLayout={onLayout}>
      {w > 0 && (
        <>
          <Svg width={w} height={h} style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={def.sky[0]} />
                <Stop offset="0.55" stopColor={def.sky[1]} />
                <Stop offset="1" stopColor={def.sky[2]} />
              </LinearGradient>
            </Defs>
            <Rect x={0} y={0} width={w} height={h} fill="url(#sky)" />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: twinkle }]}>
            <Svg width={w} height={h}>
              {stars.map((s, i) => (
                <Circle key={i} cx={s.x * w} cy={s.y * h} r={s.s} fill="#FFFFFF" opacity={0.8} />
              ))}
            </Svg>
          </Animated.View>
          {def.body && (
            <Animated.View
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [0, -h * 0.25] }) }] },
              ]}>
              <Svg width={w} height={h}>
                {/* Its own Defs: a gradient id only resolves inside the Svg that defines it. */}
                <Defs>
                  <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
                    <Stop offset="0" stopColor={def.body.glow} />
                    <Stop offset="1" stopColor={def.body.glow} stopOpacity={0} />
                  </RadialGradient>
                </Defs>
                <Circle cx={def.body.x * w} cy={def.body.y * h} r={def.body.r * h * 3} fill="url(#glow)" />
                <Circle cx={def.body.x * w} cy={def.body.y * h} r={def.body.r * h} fill={def.body.color} />
              </Svg>
            </Animated.View>
          )}
          {def.layers.map((layer, i) => (
            <SlidingLayer key={`${scene}-${i}`} layer={layer} w={w} h={h} speed={speed} />
          ))}
          <View style={[styles.ground, { backgroundColor: def.ground, height: h * 0.04 }]} />
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  ground: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});
