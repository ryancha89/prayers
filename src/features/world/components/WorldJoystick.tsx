import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path, Polygon } from 'react-native-svg';
import { getUnityBridge } from '../../counseling/bridge';
import { colors } from '../../../shared/theme';
import { GoldKnob, starPoints } from '../../../shared/components/Ornaments';

/**
 * The world's analogue stick, in the Zenless Zone Zero manner (user 02-10, two ZZZ screenshots):
 * TOUCH ANYWHERE in the stick's zone (the bottom-left area, not only on the knob) and the ring moves
 * under the thumb, the knob following it, a gold arc on the rim pointing where the player steers.
 * Lifting the thumb springs the knob back and the ring returns to its corner.
 *
 * Sends WALK_INPUT {x, y} (x = right, y = forward, −1..1, magnitude = speed) — the message the world
 * mover reads; Unity keeps the last vector, so the RELEASE is load-bearing: {0,0} on release,
 * terminate, hide and unmount. Throttled to real changes (dead-zone + step).
 *
 * ONE LOOK (07-10): My Room's mockup — the ring always drawn, a thin gold rim with diamond marks at
 * N/E/S/W and a small star under it, a dark disk, a cream and gold knob with a star — so every HUD
 * reads as one set of gold hairlines. The world wore it next, and the consultation room's walk-in
 * last ("UI đồng nhất"): the plain ZZZ puck it kept was the only stick left in another style, so it
 * is gone rather than kept as an option nobody should pick.
 */
/** The touch zone (the parent places it bottom-left). */
export const STICK_ZONE = { width: 220, height: 220 };
const RING = 106; // 132 × 0.8 (10-22, "조이스틱 20% 축소")
const KNOB = 42; // 52 × 0.8
const RADIUS = (RING - KNOB) / 2 + 4;
/** Below this share of the radius the stick is at rest — a resting thumb must not creep. */
const DEAD = 0.12;
/** Only a change of at least this much (either axis) is sent. */
const STEP = 0.05;
/** The ring rests whole inside the zone's corner, its star clear of the zone's bottom. */
const REST_AT = { x: RING / 2 + 6, y: STICK_ZONE.height - RING / 2 - 14 };
/** Room under the ring for the star that hangs off its bottom. */
const TAIL = 12;

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

/**
 * TWO FINGERS (10-23, "이동중에 달리기 누르면 달려야해"): the stick keeps its touch (it refuses to hand
 * it over), so RN routes every later finger to it too — a run tap while steering never reached the
 * button, and PanResponder's dx/dy average all fingers, so the second one also yanked the knob. The
 * stick now follows only its own finger (by identifier) and hands any other finger's touch-down to
 * `onOtherTouch` (window coordinates), for the screen to hit-test its buttons.
 */
export const WorldJoystick: React.FC<{ visible: boolean; onOtherTouch?: (pageX: number, pageY: number) => void }> = ({ visible, onOtherTouch }) => {
  const knob = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const sent = useRef({ x: 0, y: 0 });
  /** Where the ring sits (zone-local centre). Fixed in the corner (10-22, "움직이면 안되는데 아래
   *  고정되어야함"): it used to jump under the thumb, which put it mid-screen in landscape. */
  const origin = REST_AT;
  /** Where the touch began, relative to the ring's centre — the drag is added to it, so the knob
   *  goes where the finger is even when the touch did not start dead centre. */
  const start = useRef({ x: 0, y: 0 });
  /** The steering finger, and where it went down (window coordinates). */
  const finger = useRef<{ id: string; x: number; y: number } | null>(null);
  const other = useRef(onOtherTouch);
  other.current = onOtherTouch;
  /** Steering angle for the gold arc (radians, screen space), null at rest. */
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
    setHeading(null);
    // Springs back under a lifting finger; snaps when the stick is being hidden (its view goes away
    // in the same render, and a native-driven animation on an unmounted view throws).
    if (animate) {
      Animated.spring(knob, { toValue: { x: 0, y: 0 }, friction: 6, tension: 120, useNativeDriver: true }).start();
    } else {
      knob.setValue({ x: 0, y: 0 });
    }
    send(0, 0);
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: e => {
          const n = e.nativeEvent;
          finger.current = { id: String(n.identifier), x: n.pageX, y: n.pageY };
          start.current = {
            x: (e.nativeEvent.locationX ?? REST_AT.x) - REST_AT.x,
            y: (e.nativeEvent.locationY ?? REST_AT.y) - REST_AT.y,
          };
        },
        // Every touch-down while the stick is held, its own first one included.
        onPanResponderStart: e => {
          for (const t of e.nativeEvent.changedTouches) {
            if (String(t.identifier) !== finger.current?.id) other.current?.(t.pageX, t.pageY);
          }
        },
        onPanResponderMove: e => {
          const f = finger.current;
          const t = f && e.nativeEvent.touches.find(x => String(x.identifier) === f.id);
          if (!f || !t) return;
          const v = stickVector(start.current.x + t.pageX - f.x, start.current.y + t.pageY - f.y);
          knob.setValue({ x: v.kx, y: v.ky });
          setHeading(v.x === 0 && v.y === 0 ? null : Math.atan2(v.ky, v.kx));
          send(v.x, v.y);
        },
        // The steering finger lifting stops the walk even while another finger is still down.
        onPanResponderEnd: e => {
          if (e.nativeEvent.changedTouches.some(t => String(t.identifier) === finger.current?.id)) {
            finger.current = null;
            release();
          }
        },
        onPanResponderRelease: () => { finger.current = null; release(); },
        onPanResponderTerminate: () => { finger.current = null; release(); },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // Hidden (an overlay opened) or gone: the player must stop.
  useEffect(() => { if (!visible) release(false); }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { if (sent.current.x || sent.current.y) getUnityBridge().sendEvent({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } }); }, []);

  if (!visible) return null;
  const c = RING / 2;
  return (
    <View style={styles.zone} {...responder.panHandlers} accessibilityRole="adjustable" accessibilityLabel="joystick" testID="world-joystick">
      <View pointerEvents="none" style={[styles.ring, { left: origin.x - c, top: origin.y - c, height: RING + TAIL }]}>
        <OrnateRing heading={heading} />
      </View>
      <Animated.View pointerEvents="none" style={[styles.knob, {
        left: origin.x - KNOB / 2, top: origin.y - KNOB / 2, width: KNOB, height: KNOB, borderRadius: KNOB / 2,
        transform: knob.getTranslateTransform(),
      }]}>
        <GoldKnob size={KNOB} />
      </Animated.View>
    </View>
  );
};

/** The ring: gold rim, diamond marks, a star below, the steering arc in gold. */
const OrnateRing: React.FC<{ heading: number | null }> = ({ heading }) => {
  const c = RING / 2;
  const rim = c - 6;
  const diamond = (a: number) => {
    const x = c + rim * Math.cos(a);
    const y = c + rim * Math.sin(a);
    const d = 4.5;
    return `${x},${y - d} ${x + d},${y} ${x},${y + d} ${x - d},${y}`;
  };
  return (
    <Svg width={RING} height={RING + TAIL}>
      <Circle cx={c} cy={c} r={rim} fill="rgba(12,10,34,0.55)" stroke={colors.gold} strokeWidth={1.2} />
      <Circle cx={c} cy={c} r={rim - 7} fill="none" stroke="rgba(233,196,106,0.35)" strokeWidth={0.7} />
      {[-Math.PI / 2, 0, Math.PI / 2, Math.PI].map(a => (
        <Polygon key={a} points={diamond(a)} fill="rgba(12,10,34,0.9)" stroke={colors.gold} strokeWidth={1} />
      ))}
      <Polygon points={starPoints(c, c + rim + 11, [4.5], 1.1, 4)} fill={colors.gold} />
      {heading != null && (
        <Path d={arc(c, rim - 3, heading - 0.5, heading + 0.5)} stroke={colors.gold} strokeWidth={4} strokeLinecap="round" fill="none" opacity={0.9} />
      )}
    </Svg>
  );
};

const styles = StyleSheet.create({
  zone: { width: STICK_ZONE.width, height: STICK_ZONE.height },
  ring: { position: 'absolute', width: RING, height: RING },
  knob: { position: 'absolute', shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
});
