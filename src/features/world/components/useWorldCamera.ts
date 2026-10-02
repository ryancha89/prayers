import { useMemo, useRef } from 'react';
import { Dimensions, GestureResponderEvent, PanResponder, PanResponderGestureState, PanResponderInstance } from 'react-native';
import { getWorldBridge } from '../../counseling/bridge';

/** Where the camera is assumed to start: Unity's own framing sits mid-zoom and straight behind the
 *  player. Only used as the base of the first pinch — nothing is sent until the player touches. */
export const WORLD_START_ZOOM = 0.5;

type Touch = { pageX: number; pageY: number };

/**
 * Two fingers → the world camera, pure so it can be pinned without a renderer.
 *
 *  · Spread / pinch: spreading the fingers to twice their distance is the whole zoom range, as on
 *    the cabin (useCabinCamera) — same thumbs, same feel.
 *  · Turn: the angle the line between the fingers swept, half a turn of the fingers = the whole yaw
 *    range. Unwrapped, so crossing ±180° between two frames does not flip the camera round.
 */
export function cameraFromTwoFingers(
  start: { zoom: number; yaw: number; dist: number; angle: number },
  a: Touch,
  b: Touch,
): { zoom: number; yaw: number } {
  const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
  const angle = Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX);
  let turn = angle - start.angle;
  if (turn > Math.PI) turn -= 2 * Math.PI;
  if (turn < -Math.PI) turn += 2 * Math.PI;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  return {
    zoom: clamp(start.zoom + (dist / Math.max(1, start.dist) - 1), 0, 1),
    yaw: wrapYaw(start.yaw + turn / Math.PI),
  };
}

/** Wraps a yaw into −1..1 (one unit = 180°), so dragging round and round never hits a stop. */
export function wrapYaw(y: number): number {
  return ((((y + 1) % 2) + 2) % 2) - 1;
}

/**
 * One finger → look around (02-10, "chỉnh được góc", ZZZ-style), pure for tests.
 *  · Horizontal: a drag across the whole screen width turns the camera half way round. Dragging the
 *    finger right swings the view right (the camera orbits left round the player) — the ZZZ feel.
 *  · Vertical: half the screen height is the whole pitch range; dragging DOWN raises the camera to
 *    look down on the player, dragging up lowers it toward eye level.
 */
export function cameraFromDrag(
  start: { yaw: number; pitch: number },
  dx: number,
  dy: number,
  screen: { width: number; height: number },
): { yaw: number; pitch: number } {
  return {
    yaw: wrapYaw(start.yaw - dx / Math.max(1, screen.width)),
    pitch: Math.max(-1, Math.min(1, start.pitch + dy / Math.max(1, screen.height * 0.5))),
  };
}

/** Movement before a one-finger touch counts as a look-around drag rather than a tap. */
const DRAG_SLOP = 10;
/** A touch that lifts within this long and never passed the slop is a tap (handed to Unity). */
const TAP_MS = 400;
/** Two taps this close together are a double-tap (back to `home`, where the hook offers it). */
const DOUBLE_TAP_MS = 300;

/** A follow camera's input, as WORLD_CAMERA and MYROOM_CAMERA carry it: zoom 0..1 (0 = close),
 *  yaw −1..1 (= ±180° round the player, wrapped), pitch −1..1 (+ = higher). */
export interface FollowCameraInput {
  zoom: number;
  yaw: number;
  pitch: number;
}

export interface FollowCameraOptions {
  enabled: boolean;
  /** Where Unity's camera starts; the base of the first pinch, and what a double-tap returns to. */
  home: FollowCameraInput;
  /** Every change, absolute (Unity eases toward the latest). */
  send: (camera: FollowCameraInput) => void;
  /** A tap (short, never past the slop), as 0..1 of the window from its top-left. The world hands
   *  it to Unity to raycast its signs (WORLD_TAP); My Room has nothing to tap. */
  onTap?: (x: number, y: number) => void;
  /** A double-tap sends `home` (My Room). */
  doubleTapHome?: boolean;
}

/**
 * The third-person camera's fingers, shared by the world hub and My Room (both are a WorldCamera
 * behind a walker on Unity's side): drag one finger to look around (yaw + pitch), pinch to zoom,
 * two-finger twist also turns. Unity eases toward the latest message.
 *
 * ⚠️ THESE HANDLERS GO ON A TRANSPARENT LAYER OVER THE UNITY VIEW, not on a parent of it. A touch
 * that lands on the UnityView itself is the engine's and never reaches RN's responder system — the
 * first build (02-10) put them on the stage and not one WORLD_CAMERA was ever sent (devlog). The
 * journey cabin does the same (its window View sits over the host). The cost: Unity no longer sees
 * a tap, so a tap here (short, never past the slop) is handed on through `onTap`. The joystick and
 * the buttons sit above the layer and own their touches. No gesture library, for the reason
 * useCabinCamera gives.
 */
export function useFollowCamera(options: FollowCameraOptions): PanResponderInstance['panHandlers'] {
  const { enabled } = options;
  const opts = useRef(options);
  opts.current = options;
  const camera = useRef<FollowCameraInput>({ ...options.home });
  const gesture = useRef<{ zoom: number; yaw: number; dist: number; angle: number } | null>(null);
  const drag = useRef<{ yaw: number; pitch: number; x: number; y: number } | null>(null);
  /** The touch that might still be a tap: where and when it went down, and whether it moved. */
  const press = useRef<{ x: number; y: number; at: number; moved: boolean; two: boolean } | null>(null);
  const lastTap = useRef(0);

  const pan = useMemo(() => {
    const two = (e: GestureResponderEvent) => e.nativeEvent.touches.length >= 2;
    const begin = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches;
      drag.current = null;
      gesture.current = {
        ...camera.current,
        dist: Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY),
        angle: Math.atan2(b.pageY - a.pageY, b.pageX - a.pageX),
      };
    };
    const beginDrag = (g: PanResponderGestureState) => {
      gesture.current = null;
      drag.current = { yaw: camera.current.yaw, pitch: camera.current.pitch, x: g.dx, y: g.dy };
    };
    const send = () => opts.current.send({ ...camera.current });
    const end = () => { gesture.current = null; drag.current = null; press.current = null; };
    const release = () => {
      const p = press.current;
      end();
      if (!p || p.moved || p.two || Date.now() - p.at > TAP_MS) { lastTap.current = 0; return; }
      const now = Date.now();
      if (opts.current.doubleTapHome && now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0;
        camera.current = { ...opts.current.home };
        send();
        return;
      }
      lastTap.current = now;
      const { width, height } = Dimensions.get('window');
      opts.current.onTap?.(p.x / Math.max(1, width), p.y / Math.max(1, height));
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => enabled,
      onMoveShouldSetPanResponder: () => enabled,
      onPanResponderGrant: e => {
        const t = e.nativeEvent;
        press.current = { x: t.pageX, y: t.pageY, at: Date.now(), moved: false, two: two(e) };
        if (two(e)) begin(e);
      },
      onPanResponderMove: (e, g) => {
        const p = press.current;
        if (p && two(e)) p.two = true;
        if (p && !p.moved && !two(e)) {
          // Still inside the slop: maybe a tap, not a look yet.
          if (Math.hypot(g.dx, g.dy) <= DRAG_SLOP) return;
          p.moved = true;
          beginDrag(g);
        }
        if (two(e)) {
          // A second finger landing mid-drag starts the pinch from where the camera is.
          if (!gesture.current) return begin(e);
          const [a, b] = e.nativeEvent.touches;
          const r = cameraFromTwoFingers(gesture.current, a, b);
          camera.current = { ...camera.current, zoom: r.zoom, yaw: r.yaw };
          return send();
        }
        // Back to one finger after a pinch: carry on as a drag from here.
        if (!drag.current) beginDrag(g);
        const d = drag.current!;
        const r = cameraFromDrag(d, g.dx - d.x, g.dy - d.y, Dimensions.get('window'));
        camera.current = { ...camera.current, yaw: r.yaw, pitch: r.pitch };
        send();
      },
      onPanResponderRelease: release,
      onPanResponderTerminate: end,
      onPanResponderTerminationRequest: () => true,
    });
  }, [enabled]);

  return pan.panHandlers;
}

/** The world hub's camera (spec 004): WORLD_CAMERA, and a tap handed on as WORLD_TAP. */
export function useWorldCamera(enabled: boolean): PanResponderInstance['panHandlers'] {
  return useFollowCamera({
    enabled,
    home: { zoom: WORLD_START_ZOOM, yaw: 0, pitch: 0 },
    send: c => getWorldBridge().sendWorldCamera(c.zoom, c.yaw, c.pitch),
    onTap: (x, y) => getWorldBridge().sendWorldTap(x, y),
  });
}
