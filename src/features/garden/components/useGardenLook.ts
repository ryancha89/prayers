import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, GestureResponderEvent, PanResponder, PanResponderInstance } from 'react-native';
import type { GardenBridge } from '../../counseling/types';

/** A finger travels this far (px) before a touch becomes an orbit, so every tap still lands. */
const DRAG_SLOP = 8;

/** Degrees of orbit for a drag the full width of the screen. 240° means one and a half drags walks
 *  the camera the whole way round the island — far enough to feel direct, short enough that the far
 *  side is two flicks away. */
export const YAW_PER_SCREEN = 240;
/** A drag the full height of the screen covers the whole pitch band (-1..1). */
export const PITCH_PER_SCREEN = 2;

/** The orbit a drag of (dx, dy) reaches from where it started. Grab-the-world, like the cabin and the
 *  consultation rooms: drag left and the camera swings right. Yaw is unbounded on purpose — it is what
 *  lets the player turn all the way round — while pitch is held to the band Unity accepts. */
export function orbitFromDrag(
  from: { yaw: number; pitch: number },
  dx: number,
  dy: number,
  window: { width: number; height: number },
): { yaw: number; pitch: number } {
  const w = Math.max(1, window.width);
  const h = Math.max(1, window.height);
  return {
    yaw: from.yaw - (dx / w) * YAW_PER_SCREEN,
    pitch: Math.max(-1, Math.min(1, from.pitch - (dy / h) * PITCH_PER_SCREEN)),
  };
}

/**
 * Turning the camera round the Tree of Mind island (10-11, "tree of mind không xoay camera được á?").
 * Until now the garden was the only 3D place in the app with no way to move the camera at all — four
 * fixed shots and nothing else — and decor edit mode asked the player to furnish an island whose far
 * half no shot could see.
 *
 * Which fingers this takes depends on what the screen's other layers already use, so that NOTHING that
 * worked before changes:
 *   · the garden step  one finger is free (a tap picks a plot) → a one-finger drag orbits
 *   · breathing        one finger IS the breath → two fingers only
 *   · decor editing    one finger selects and moves a piece → two fingers only
 * Two fingers always orbit and pinch together, as on a map. Mounted with the capture-on-move handler
 * on the screen root, the same way useRoomLook rides over the room's own Pressables: a tap is never
 * stolen, because the responder only asks for the touch once it has become a drag.
 */
export function useGardenLook(opts: {
  /** The garden's half of the bridge — passed in, not fetched, so a test can drive it with the mock. */
  bridge: Pick<GardenBridge, 'sendGardenLook'>;
  enabled: boolean;
  /** True where a ONE-finger drag is free to orbit (the garden step); elsewhere it belongs to the
   *  breath or to the piece being moved, and only two fingers orbit. */
  oneFinger: boolean;
  /** Above this line the finger belongs to the header (the back button, the ring). */
  topBarBottom: number;
  /** Changes when the garden is left: Unity recentres (GardenStage.End), so this side must forget the
   *  angle too or the next drag would carry on from one the camera has already left. */
  resetKey?: string;
}): PanResponderInstance['panHandlers'] {
  const look = useRef({ yaw: 0, pitch: 0 });
  const zoom = useRef(0);
  const drag = useRef<{ yaw: number; pitch: number } | null>(null);
  const pinch = useRef<{ zoom: number; dist: number } | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    drag.current = null;
    pinch.current = null;
    look.current = { yaw: 0, pitch: 0 };
    zoom.current = 0;
  }, [opts.resetKey]);

  const pan = useMemo(() => {
    const send = () => latest.current.bridge.sendGardenLook(look.current.yaw, look.current.pitch, zoom.current);
    const spread = (e: GestureResponderEvent) => {
      const [a, b] = e.nativeEvent.touches;
      return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
    };
    const claims = (e: GestureResponderEvent, dx: number, dy: number) => {
      const { enabled, oneFinger, topBarBottom } = latest.current;
      if (!enabled) return false;
      const touches = e.nativeEvent.touches.length;
      if (touches === 2) return true;
      if (touches !== 1 || !oneFinger) return false;
      if (Math.abs(dx) <= DRAG_SLOP && Math.abs(dy) <= DRAG_SLOP) return false;
      // Where the finger STARTED: a drag that began on the header is not the island's.
      return e.nativeEvent.pageY - dy > topBarBottom;
    };
    const end = () => { drag.current = null; pinch.current = null; };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) => claims(e, g.dx, g.dy),
      onPanResponderGrant: () => { drag.current = { ...look.current }; },
      onPanResponderMove: (e, g) => {
        if (e.nativeEvent.touches.length >= 2) {
          // Carry on from the zoom the last pinch left, so a second pinch does not start over.
          if (!pinch.current) pinch.current = { zoom: zoom.current, dist: Math.max(1, spread(e)) };
          const z = Math.max(-1, Math.min(1, pinch.current.zoom + (spread(e) / pinch.current.dist - 1)));
          if (Math.abs(z - zoom.current) >= 0.02) { zoom.current = z; send(); }
          drag.current = null;   // the orbit does not jump when one finger lifts
          return;
        }
        if (pinch.current) { pinch.current = null; drag.current = { ...look.current }; return; }
        if (!drag.current) return;
        look.current = orbitFromDrag(drag.current, g.dx, g.dy, Dimensions.get('window'));
        send();
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
      onPanResponderTerminationRequest: () => true,
    });
  }, []);

  return pan.panHandlers;
}
