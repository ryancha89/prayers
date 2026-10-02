import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { getUnityBridge } from '../../counseling/bridge';

/**
 * The world's analogue stick, in the Zenless Zone Zero manner (user 02-10, two ZZZ screenshots):
 *  - AT REST a small dark knob sits bottom-left — nothing else, so the world stays clear.
 *  - TOUCH ANYWHERE in the stick's zone (the bottom-left area, not only on the knob) and the stick
 *    opens under the thumb: a large dark ring with four small direction ticks, the knob following
 *    the thumb, and an ORANGE ARC on the rim pointing where the player is steering.
 *  - Lifting the thumb springs the knob back and the ring folds away to the resting knob.
 * The same stick walks My Room and, since 02-10, the consultation room's walk-in (WalkControls
 * records why it replaced the d-pad there).
 *
 * Sends WALK_INPUT {x, y} (x = right, y = forward, −1..1, magnitude = speed) — the message the world
 * mover reads; Unity keeps the last vector, so the RELEASE is load-bearing: {0,0} on release,
 * terminate, hide and unmount. Throttled to real changes (dead-zone + step).
 */
/** The touch zone (the parent places it bottom-left). */
export const STICK_ZONE = { width: 220, height: 220 };
const RING = 132;
const KNOB = 52;
const REST = 58;
const RADIUS = (RING - KNOB) / 2 + 4;
/** Below this share of the radius the stick is at rest — a resting thumb must not creep. */
const DEAD = 0.12;
/** Only a change of at least this much (either axis) is sent. */
const STEP = 0.05;
const ORANGE = '#F28A2E';
/** Where the resting knob sits in the zone (its centre). */
const REST_AT = { x: REST / 2 + 24, y: STICK_ZONE.height - REST / 2 - 24 };

/** The knob's offset (screen points, y down) → WALK_INPUT (x right, y forward, magnitude = speed;
 *  {0,0} inside the dead-zone) and the knob's clamped position. Pure, for tests. */
export function stickVector(dx: number, dy: number): { x: number; y: number; kx: number; ky: number } {
  const d = Math.hypot(dx, dy);
  if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
  const m = Math.min(1, d / RADIUS);
  if (m < DEAD) return { x: 0, y: 0, kx: dx, ky: dy };
  // Rescaled past the dead-zone, so the slowest walk starts at its edge; screen y is down.
  const k = (m - DEAD) / (1 - DEAD) / m;
  return { x: +((dx / RADIUS) * k).toFixed(2), y: +((-dy / RADIUS) * k).toFixed(2), kx: dx, ky: dy };
}

/** SVG arc on a circle of radius r centred at (c, c), from angle a0 to a1 (radians, 0 = right, y down). */
function arc(c: number, r: number, a0: number, a1: number) {
  const p = (a: number) => `${(c + r * Math.cos(a)).toFixed(2)} ${(c + r * Math.sin(a)).toFixed(2)}`;
  return `M ${p(a0)} A ${r} ${r} 0 0 1 ${p(a1)}`;
}

export const WorldJoystick: React.FC<{ visible: boolean }> = ({ visible }) => {
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const open = useRef(new Animated.Value(0)).current; // 0 resting knob → 1 the full ring
  const sent = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  /** Where the ring opened (zone-local centre). */
  const [origin, setOrigin] = useState(REST_AT);
  /** Steering angle for the orange arc (radians, screen space), null at rest. */
  const [heading, setHeading] = useState<number | null>(null);

  const send = (x: number, y: number) => {
    const s = sent.current;
    const stop = x === 0 && y === 0;
    if (!stop && Math.abs(x - s.x) < STEP && Math.abs(y - s.y) < STEP) return;
    if (stop && s.x === 0 && s.y === 0) return;
    sent.current = { x, y };
    getUnityBridge().sendEvent({ type: 'WALK_INPUT', payload: { x, y } });
  };

  const release = (animate = true) => {
    setActive(false);
    setHeading(null);
    // Springs back under a lifting finger; snaps when the stick is being hidden (its view goes away
    // in the same render, and a native-driven animation on an unmounted view throws).
    if (animate) {
      Animated.spring(knob, { toValue: { x: 0, y: 0 }, friction: 6, tension: 120, useNativeDriver: true }).start();
      Animated.timing(open, { toValue: 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    } else {
      knob.setValue({ x: 0, y: 0 });
      open.setValue(0);
    }
    setOrigin(REST_AT);
    send(0, 0);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: e => {
          // The ring opens under the thumb, kept fully inside the zone.
          const r = RING / 2;
          const x = Math.max(r, Math.min(STICK_ZONE.width - r, e.nativeEvent.locationX ?? REST_AT.x));
          const y = Math.max(r, Math.min(STICK_ZONE.height - r, e.nativeEvent.locationY ?? REST_AT.y));
          setOrigin({ x, y });
          setActive(true);
          Animated.timing(open, { toValue: 1, duration: 140, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
        },
        onPanResponderMove: (_e, g) => {
          const v = stickVector(g.dx, g.dy);
          knob.setValue({ x: v.kx, y: v.ky });
          setHeading(v.x === 0 && v.y === 0 ? null : Math.atan2(v.ky, v.kx));
          send(v.x, v.y);
        },
        onPanResponderRelease: () => release(),
        onPanResponderTerminate: () => release(),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Hidden (an overlay opened) or gone: the player must stop.
  useEffect(() => { if (!visible) release(false); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (sent.current.x || sent.current.y) getUnityBridge().sendEvent({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } }); }, []);

  if (!visible) return null;
  const c = RING / 2;
  const at = active ? origin : REST_AT;
  const size = active ? KNOB : REST;
  return (
    <View style={styles.zone} {...responder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="joystick" testID="world-joystick">
      {/* The open ring: dark disc, thin rim, four ticks, and the orange steering arc. */}
      <Animated.View pointerEvents="none" style={[styles.ring, {
        left: origin.x - c, top: origin.y - c,
        opacity: open,
        transform: [{ scale: open.interpolate({ inputRange: [0, 1], outputRange: [REST / RING, 1] }) }],
      }]}>
        <Svg width={RING} height={RING}>
          <Circle cx={c} cy={c} r={c - 2} fill="rgba(10,10,14,0.55)" stroke="rgba(255,255,255,0.35)" strokeWidth={1.5} />
          <Circle cx={c} cy={c} r={c - 14} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
          {[-Math.PI / 2, 0, Math.PI / 2, Math.PI].map(a => {
            // A small chevron on the rim pointing outward.
            const x = c + (c - 7) * Math.cos(a);
            const y = c + (c - 7) * Math.sin(a);
            const lx = x - 4 * Math.cos(a) + 4 * Math.sin(a);
            const ly = y - 4 * Math.sin(a) - 4 * Math.cos(a);
            const rx = x - 4 * Math.cos(a) - 4 * Math.sin(a);
            const ry = y - 4 * Math.sin(a) + 4 * Math.cos(a);
            return <Path key={a} d={`M ${lx} ${ly} L ${x} ${y} L ${rx} ${ry}`} stroke="rgba(255,255,255,0.6)" strokeWidth={1.5} fill="none" />;
          })}
          {heading != null && (
            <Path d={arc(c, c - 4, heading - 0.55, heading + 0.55)} stroke={ORANGE} strokeWidth={6} strokeLinecap="round" fill="none" />
          )}
        </Svg>
      </Animated.View>
      {/* The knob: the small resting puck, or following the thumb inside the open ring. */}
      <Animated.View pointerEvents="none" style={[styles.knob, active ? styles.knobActive : styles.knobRest, {
        left: at.x - size / 2, top: at.y - size / 2, width: size, height: size, borderRadius: size / 2,
        transform: knob.getTranslateTransform(),
      }]} />
    </View>
  );
};

const styles = StyleSheet.create({
  zone: { width: STICK_ZONE.width, height: STICK_ZONE.height },
  ring: { position: 'absolute', width: RING, height: RING },
  knob: { position: 'absolute', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
  // At rest: the small dark puck of the ZZZ screenshot, a faint rim so it reads on any scene.
  knobRest: { backgroundColor: 'rgba(20,20,26,0.82)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.18)' },
  // In use: a darker glossy knob with a light rim.
  knobActive: { backgroundColor: 'rgba(28,28,34,0.95)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)' },
});
