import type { PanResponderInstance } from 'react-native';
import type { MyRoomCamera } from '../../counseling/types';
import { useFollowCamera } from '../../world/components/useWorldCamera';

/** The zoom Unity opens the room at (MyRoomBuilder.DefaultCameraZoom — keep the two equal): the
 *  follow camera a few steps behind the player, about where the old overview stood. */
export const MYROOM_START_ZOOM = 0.6;

/** Where every visit starts, and what a double-tap goes back to: straight behind the player at the
 *  room's own zoom. */
export const MYROOM_HOME: MyRoomCamera = { zoom: MYROOM_START_ZOOM, yaw: 0, pitch: 0 };

/**
 * The player's camera in My Room (MYROOM_CAMERA). Since the room became walkable (02-10) it is the
 * world's follow camera on both sides of the bridge — same fingers, same numbers:
 *
 *  · One finger, dragged past the slop — look around (yaw wraps ±1, pitch −1..1).
 *  · Two fingers — pinch to zoom, twist to turn.
 *  · Double-tap — back behind the player at the start zoom.
 *
 * The handlers go on a transparent layer OVER the UnityView (useFollowCamera says why); the stick
 * and the top bar sit above that layer and keep their own touches. Unity keeps the lens inside the
 * room whatever it is asked (WorldCamera's sphere-cast against the room's colliders).
 */
export function useMyRoomCamera(
  enabled: boolean,
  send: (camera: MyRoomCamera) => void,
): PanResponderInstance['panHandlers'] {
  return useFollowCamera({ enabled, home: MYROOM_HOME, send, doubleTapHome: true });
}
