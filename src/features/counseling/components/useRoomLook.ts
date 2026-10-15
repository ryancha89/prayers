import { useEffect, useMemo, useRef } from 'react';
import { Dimensions, GestureResponderEvent, PanResponder, PanResponderInstance } from 'react-native';
import { getUnityBridge } from '../bridge';
import { lookFromDrag } from '../../journey/components/useCabinCamera';

/** A finger has to travel this far (px) before a touch becomes a look-around drag, so a tap still
 *  reaches "tap to continue" and the card. */
const DRAG_SLOP = 8;

/**
 * Where a drag may start: the room itself, between the bottom of the top bar and the top of the
 * panel. Below that line the finger belongs to the transcript (it scrolls), the input bar and the
 * choices; above it, to the back button. `panelTop` null = not measured yet → the room is the whole
 * screen below the top bar.
 */
export function startsOnRoom(pageY: number, topBarBottom: number, panelTop: number | null): boolean {
  return pageY > topBarBottom && (panelTop == null || pageY < panelTop);
}

/** While the player walks (before Talk) there is no panel, and the joystick owns the bottom-left
 *  corner: this wide and this tall (pt). Only the corner — a band across the whole bottom took most
 *  of a landscape screen (402 pt tall) and left almost nothing to drag on (sim, 13-10). The Talk
 *  prompt is a tap, which a drag never steals. */
export const WALK_STICK_CORNER = { width: 230, height: 240 };

/** True where a walking player's finger belongs to the joystick, not the room. */
export function onWalkStick(pageX: number, pageY: number, window: { height: number }): boolean {
  return pageX < WALK_STICK_CORNER.width && pageY > window.height - WALK_STICK_CORNER.height;
}

/**
 * The player turning their head in a consultation room (13-10, "let user change angle … cho xoay
 * đi"). One finger dragged over the room sends ROOM_LOOK {yaw, pitch} -1..1; Unity turns the camera
 * in place up to ±60° / ±15° and eases (ConsultationLook). Before Talk, while walking, the same
 * drag orbits the follow camera round the player instead, and the joystick walks the new way. Grab-the-world, like the cabin: drag left
 * to look right; the angle stays where the player leaves it.
 *
 * Mounted on the ROOM SCREEN's root with the *capture* move handler, not on a layer of its own: the
 * overlay's tap-to-continue is a full-screen Pressable above the Unity view, so a layer under it
 * would never see a finger. Capturing on MOVE only (past DRAG_SLOP) leaves every tap where it was —
 * the Pressable gets the touch, and is asked to let go only once the touch has become a drag.
 */
export function useRoomLook(opts: {
  enabled: boolean;
  /** On their feet before Talk: Unity orbits the follow camera instead of turning in place, and
   *  the joystick's corner is not the room's. */
  walking?: boolean;
  topBarBottom: number;
  panelTop: () => number | null;
  /** Changes when the room's director cuts to a new beat (the phase id). Unity eases the look back
   *  to centre on every new shot; this keeps the drag's starting point in step with it, or the next
   *  drag would jump from an angle the camera has already left. */
  resetKey?: string;
}): PanResponderInstance['panHandlers'] {
  const look = useRef({ yaw: 0, pitch: 0 });
  const drag = useRef<{ yaw: number; pitch: number } | null>(null);
  const latest = useRef(opts);
  latest.current = opts;

  useEffect(() => {
    drag.current = null;
    if (look.current.yaw === 0 && look.current.pitch === 0) return;
    look.current = { yaw: 0, pitch: 0 };
    // Said out loud too: a beat that does not change the shot would otherwise leave Unity at the old
    // angle while this side starts the next drag from straight ahead.
    if (latest.current.enabled) getUnityBridge().sendEvent({ type: 'ROOM_LOOK', payload: look.current });
  }, [opts.resetKey]);

  const pan = useMemo(() => {
    const send = (yaw: number, pitch: number) => {
      look.current = { yaw, pitch };
      getUnityBridge().sendEvent({ type: 'ROOM_LOOK', payload: look.current });
    };
    const claims = (e: GestureResponderEvent, dx: number, dy: number) => {
      const { enabled, topBarBottom, panelTop, walking } = latest.current;
      if (!enabled || e.nativeEvent.touches.length !== 1) return false;
      if (Math.abs(dx) <= DRAG_SLOP && Math.abs(dy) <= DRAG_SLOP) return false;
      // Where the finger STARTED, not where it is now: a scroll of the transcript that drifts up
      // over the room is still a scroll.
      const startY = e.nativeEvent.pageY - dy;
      if (walking) {
        const startX = e.nativeEvent.pageX - dx;
        return startY > topBarBottom && !onWalkStick(startX, startY, Dimensions.get('window'));
      }
      return startsOnRoom(startY, topBarBottom, panelTop());
    };
    const end = () => { drag.current = null; };
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) => claims(e, g.dx, g.dy),
      onPanResponderGrant: () => { drag.current = { ...look.current }; },
      onPanResponderMove: (_e, g) => {
        if (!drag.current) return;
        const next = lookFromDrag(drag.current, g.dx, g.dy, Dimensions.get('window'));
        send(next.yaw, next.pitch);
      },
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
      onPanResponderTerminationRequest: () => true,
    });
  }, []);

  return pan.panHandlers;
}
