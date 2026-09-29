import { useMemo, useRef } from 'react';
import { Dimensions, GestureResponderEvent, PanResponder, PanResponderInstance } from 'react-native';
import { nativeUnityBridge } from '../../counseling/bridge';

/** Where every journey starts; matches TrainJourneyDirector.StartZoom — the wide view with the
 *  whole window (user on the simulator 28-09: "zoom out, the outside bigger, the whole window"). */
export const CABIN_START_ZOOM = 0;

/** A finger has to travel this far (px) before a touch becomes a look-around drag, so a tap still
 *  reaches the fortune card's buttons. */
const DRAG_SLOP = 8;

/**
 * The player's camera on the train cabin. Unity eases every change (TrainJourneyDirector).
 *
 *  · Pinch with two fingers — zoom through three stops: 0 = the wide view with the whole window
 *    (the start), 0.5 = counsellor and window, 1 = the close-up (Jeongmin 28-09: "user can scale
 *    up and scale down the size").
 *  · Drag with one finger — turn the camera (user 28-09: "the user could rotate the camera angle
 *    themselves"). Grab-the-world, like a 360° photo: drag left to look right. Half the screen's
 *    width is the whole yaw range; the angle stays where the player leaves it.
 *  · Double-tap — toggles the start and the close-up, and looks straight ahead again.
 *
 * The responder is claimed only on a second finger or once one finger has MOVED, so a single tap
 * still reaches the card's buttons. Double-tap is read from raw touch-end events, which fire
 * whether or not anything claimed the responder, for the same reason.
 *
 * No gesture library: react-native-gesture-handler is not in this app, and a native dependency for
 * one pinch would mean a pod install and a rebuild for every developer.
 */
export function useCabinCamera(enabled: boolean): {
  panHandlers: PanResponderInstance['panHandlers'];
  onTouchEnd: (e: GestureResponderEvent) => void;
} {
  const zoom = useRef(CABIN_START_ZOOM);
  const look = useRef({ yaw: 0, pitch: 0 });
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const drag = useRef<{ yaw: number; pitch: number } | null>(null);
  const dragged = useRef(false);
  const lastTap = useRef(0);

  const sendZoom = (z: number) => {
    zoom.current = Math.max(0, Math.min(1, z));
    nativeUnityBridge.sendJourneyZoom(zoom.current);
  };
  const sendLook = (yaw: number, pitch: number) => {
    look.current = { yaw: Math.max(-1, Math.min(1, yaw)), pitch: Math.max(-1, Math.min(1, pitch)) };
    nativeUnityBridge.sendJourneyLook(look.current.yaw, look.current.pitch);
  };

  const pan = useMemo(() => {
    const fingers = (e: GestureResponderEvent) => e.nativeEvent.touches.length;
    const distance = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches;
      return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
    };
    const startPinch = (e: GestureResponderEvent) => {
      pinch.current = { dist: distance(e), zoom: zoom.current };
      drag.current = null;
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: e => enabled && fingers(e) >= 2,
      onMoveShouldSetPanResponder: (e, g) =>
        enabled && (fingers(e) >= 2 || Math.abs(g.dx) > DRAG_SLOP || Math.abs(g.dy) > DRAG_SLOP),
      onPanResponderGrant: e => {
        if (fingers(e) >= 2) startPinch(e);
        else {
          drag.current = { ...look.current };
          dragged.current = true;
        }
      },
      onPanResponderMove: (e, g) => {
        if (fingers(e) >= 2) {
          // A second finger landing mid-drag turns the gesture into a pinch.
          if (!pinch.current) return startPinch(e);
          // Spreading the fingers to twice their distance is the whole range.
          const ratio = distance(e) / Math.max(1, pinch.current.dist);
          sendZoom(pinch.current.zoom + (ratio - 1));
          return;
        }
        if (!drag.current) return;
        const { width, height } = Dimensions.get('window');
        sendLook(drag.current.yaw - g.dx / (width * 0.5), drag.current.pitch + g.dy / (height * 0.3));
      },
      onPanResponderRelease: () => { pinch.current = null; drag.current = null; },
      onPanResponderTerminate: () => { pinch.current = null; drag.current = null; },
      onPanResponderTerminationRequest: () => true,
    });
  }, [enabled]);

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!enabled || e.nativeEvent.touches.length > 0 || pinch.current) return;
    // The end of a drag is not a tap.
    if (dragged.current) {
      dragged.current = false;
      lastTap.current = 0;
      return;
    }
    const now = Date.now();
    if (now - lastTap.current < 300) {
      sendZoom(zoom.current > 0.75 ? CABIN_START_ZOOM : 1);
      sendLook(0, 0);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  return { panHandlers: pan.panHandlers, onTouchEnd };
}
