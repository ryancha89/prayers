/**
 * Where the consultation room leaves to (16-10, user: "2d상태에서 상담방 들어갔다가 나오면 월드맵 말고
 * 이전 화면으로").
 *
 * Out of the room the player goes back to whatever OPENED the consultation — the World, or the 2D
 * screen they were on — past the steps that only set it up (the counselor card, who it is for, the
 * topic, the loading screen). Landing on the subject picker again would ask the question twice.
 *
 * Decided from the routes UNDER the room, nearest first, and never from "is a World anywhere in the
 * stack": since React Navigation 7, `navigate('Tabs')` from the World pushes a new Tabs instead of
 * going back, so an old World can sit under a 2D Home and the room sent 2D players into it.
 */
const SETUP = new Set(['CounselorDetail', 'CounselingSubject', 'CounselingTopic', 'UnityEntry', 'AddSubject']);

export interface RoomExit {
  /** How many screens to pop, the room included. 0 = nothing under the room to go back to. */
  pops: number;
  /** The screen that ends up on top. */
  to: string | null;
}

export function roomExit(routes: readonly { name: string }[], index: number): RoomExit {
  for (let i = index - 1; i >= 0; i--) {
    if (!SETUP.has(routes[i].name)) return { pops: index - i, to: routes[i].name };
  }
  return { pops: 0, to: null };
}
