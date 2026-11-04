import { MutableRefObject, useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance } from 'react-native';
import type { CharacterViewPayload } from '../counseling/types';

/** Degrees the body turns per point dragged: a full swipe across a phone (~390 pt) is ~175°. */
export const DEG_PER_PT = 0.45;
/** How much zoom a pinch gives: fingers twice as far apart = +1 (whole body → face). */
export const PINCH_GAIN = 1;

export const VIEW_START: CharacterViewPayload = { yaw: 0, zoom: 0 };

/**
 * Grab-the-body: dragging right brings the body's front round to the right. Unity's turntable turns
 * +yaw toward the camera's left, so the sign flips here. The angle is a running total (never
 * wrapped here — Unity wraps it), so a long spin never jumps.
 */
export function yawFromDrag(startYaw: number, dx: number): number {
  return startYaw - dx * DEG_PER_PT;
}

/** Spread the fingers to come in on the face, pinch to step back to the whole body. */
export function zoomFromPinch(startZoom: number, startDist: number, dist: number): number {
  if (!(startDist > 0)) return startZoom;
  return Math.min(1, Math.max(0, startZoom + (dist / startDist - 1) * PINCH_GAIN));
}

function spread(e: GestureResponderEvent): number {
  const [a, b] = e.nativeEvent.touches;
  if (!a || !b) return 0;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

/**
 * The creator's 3D view (27-10): one finger turns the body, two fingers zoom between the whole body
 * and the face. Mounted on a full-screen layer UNDER the screen's controls, so the cards and buttons
 * keep their taps; this layer owns every touch that reaches it. `send` gets the absolute view
 * (CHARACTER_VIEW); `current` lets a button (whole body / face) move the view without the next drag
 * jumping back.
 */
export function useCharacterView(send: (view: CharacterViewPayload) => void, onTouched?: () => void): {
  handlers: PanResponderInstance['panHandlers'];
  current: MutableRefObject<CharacterViewPayload>;
  set: (view: CharacterViewPayload) => void;
} {
  const current = useRef<CharacterViewPayload>({ ...VIEW_START });
  const start = useRef<{ yaw: number; zoom: number; dx0: number; dist: number } | null>(null);
  const sendRef = useRef(send);
  sendRef.current = send;
  const touchedRef = useRef(onTouched);
  touchedRef.current = onTouched;

  const set = (view: CharacterViewPayload) => {
    current.current = view;
    sendRef.current(view);
  };

  const pan = useMemo(() => {
    const begin = (e: GestureResponderEvent, dx: number) => {
      start.current = { ...current.current, dx0: dx, dist: spread(e) };
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e, g) => begin(e, g.dx),
      onPanResponderMove: (e, g) => {
        touchedRef.current?.();
        if (!start.current) begin(e, g.dx);
        const s = start.current!;
        const pinching = e.nativeEvent.touches.length >= 2;
        // A second finger landing (or lifting) restarts the gesture from where the view is, so
        // switching between turn and zoom never jumps.
        if (pinching !== s.dist > 0) { begin(e, g.dx); return; }
        if (pinching) set({ yaw: current.current.yaw, zoom: zoomFromPinch(s.zoom, s.dist, spread(e)) });
        else set({ yaw: yawFromDrag(s.yaw, g.dx - s.dx0), zoom: current.current.zoom });
      },
      onPanResponderRelease: () => { start.current = null; },
      onPanResponderTerminate: () => { start.current = null; },
    });
  }, []);

  return { handlers: pan.panHandlers, current, set };
}
