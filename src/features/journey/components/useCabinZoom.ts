import { useMemo, useRef } from 'react';
import { GestureResponderEvent, PanResponder, PanResponderInstance } from 'react-native';
import { nativeUnityBridge } from '../../counseling/bridge';

/** Where every journey starts; matches TrainJourneyDirector.DefaultZoom. */
export const CABIN_DEFAULT_ZOOM = 0.5;

/**
 * The player's zoom on the train cabin (Jeongmin 28-09: "user can scale up and scale down the
 * size"). Three stops, eased by Unity (TrainJourneyDirector): 0 = the wide corner view, 0.5 = the
 * framing every journey starts on (counsellor and window), 1 = the close-up.
 *
 * Two ways in, both on the window area:
 *  · pinch with two fingers — the responder is claimed ONLY once a second finger is down, so a
 *    single tap still reaches the fortune card's buttons;
 *  · double-tap — toggles between the starting framing and the close-up. Read from raw touch-end
 *    events, which fire whether or not anything claimed the responder, for the same reason.
 *
 * No gesture library: react-native-gesture-handler is not in this app, and a native dependency for
 * one pinch would mean a pod install and a rebuild for every developer.
 */
export function useCabinZoom(enabled: boolean): {
  panHandlers: PanResponderInstance['panHandlers'];
  onTouchEnd: (e: GestureResponderEvent) => void;
} {
  const zoom = useRef(CABIN_DEFAULT_ZOOM);
  const start = useRef<{ dist: number; zoom: number } | null>(null);
  const lastTap = useRef(0);

  const send = (z: number) => {
    zoom.current = Math.max(0, Math.min(1, z));
    nativeUnityBridge.sendJourneyZoom(zoom.current);
  };

  const pan = useMemo(() => {
    const twoFingers = (e: GestureResponderEvent) => enabled && e.nativeEvent.touches.length >= 2;
    const distance = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches;
      return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: twoFingers,
      onMoveShouldSetPanResponder: twoFingers,
      onPanResponderGrant: e => {
        if (e.nativeEvent.touches.length >= 2) start.current = { dist: distance(e), zoom: zoom.current };
      },
      onPanResponderMove: e => {
        if (e.nativeEvent.touches.length < 2) return;
        if (!start.current) {
          start.current = { dist: distance(e), zoom: zoom.current };
          return;
        }
        // Spreading the fingers to twice their distance is the whole range.
        const ratio = distance(e) / Math.max(1, start.current.dist);
        send(start.current.zoom + (ratio - 1));
      },
      onPanResponderRelease: () => { start.current = null; },
      onPanResponderTerminate: () => { start.current = null; },
      onPanResponderTerminationRequest: () => true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (!enabled || e.nativeEvent.touches.length > 0 || start.current) return;
    const now = Date.now();
    if (now - lastTap.current < 300) {
      send(zoom.current > 0.75 ? CABIN_DEFAULT_ZOOM : 1);
      lastTap.current = 0;
    } else {
      lastTap.current = now;
    }
  };

  return { panHandlers: pan.panHandlers, onTouchEnd };
}
