/**
 * Zooming into the 78 while choosing (PM 23-10, "could you implement zoom in and zoom out?"): two fingers
 * pinch in and out, one finger drags across the spread once it is zoomed, a short tap still picks a card.
 * Pure so it can be pinned without a renderer; CafeScreen's TapLayer feeds it, CAFE_ZOOM carries it.
 *
 * RN sends the GESTURE, not the camera: Unity owns the zoom, because only Unity knows where the cards
 * sit on the screen — the spread grows about the cards' centre (user 23-10: "zoom vô lá bài"; the first
 * cut zoomed on the screen's centre, an empty cloth under the cards on a phone) and the drag stops at
 * the edges of the unzoomed view. Each message is cumulative since its gesture began, so the bridge
 * may coalesce them; a new `gesture` number starts from wherever the last one left the camera.
 */

import type { CardsGesture } from '../../counseling/types';

export type { CardsGesture };

/** Half-views from the view's centre, +y up — from a point 0..1 of the view from its top-left (CAFE_TAP). */
export const toHalfViews = (x: number, y: number) => ({ x: x * 2 - 1, y: 1 - y * 2 });

let nextGesture = 0;
/** Never reused within a run, so a remounted layer cannot continue an old gesture on Unity's side. */
export const newGesture = () => ++nextGesture;

/** Two fingers: from where they were when the gesture began to where they are now. Distances in any
 *  one unit, midpoints in half-views. */
export function pinch(
  gesture: number,
  from: { dist: number; mid: { x: number; y: number } },
  to: { dist: number; mid: { x: number; y: number } },
): CardsGesture {
  return { gesture, scale: to.dist / Math.max(1, from.dist), x: to.mid.x - from.mid.x, y: to.mid.y - from.mid.y };
}

/** One finger, in half-views since it began to drag. */
export const drag = (gesture: number, dx: number, dy: number): CardsGesture => ({ gesture, scale: 1, x: dx, y: dy });
