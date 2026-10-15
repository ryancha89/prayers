import { onWalkStick, startsOnRoom } from '../src/features/counseling/components/useRoomLook';
import { lookFromDrag } from '../src/features/journey/components/useCabinCamera';

describe('room look-around (ROOM_LOOK)', () => {
  const topBar = 64;

  it('starts a drag only on the room, between the top bar and the panel', () => {
    expect(startsOnRoom(300, topBar, 520)).toBe(true);
    expect(startsOnRoom(40, topBar, 520)).toBe(false); // the back button's row
    expect(startsOnRoom(600, topBar, 520)).toBe(false); // the transcript scrolls there
  });

  it('treats the whole screen under the top bar as room before the panel has measured', () => {
    expect(startsOnRoom(800, topBar, null)).toBe(true);
  });

  it('keeps only the joystick corner out of the room while walking, in either orientation', () => {
    const portrait = { height: 874 };
    expect(onWalkStick(75, 760, portrait)).toBe(true); // the stick
    expect(onWalkStick(300, 760, portrait)).toBe(false); // beside it: still the room
    const landscape = { height: 402 };
    expect(onWalkStick(75, 330, landscape)).toBe(true);
    expect(onWalkStick(500, 200, landscape)).toBe(false); // most of a landscape screen is draggable
  });

  it('drags grab the world: left looks right, down looks up, and both clamp to the range', () => {
    const window = { width: 402, height: 874 };
    const right = lookFromDrag({ yaw: 0, pitch: 0 }, -100, 0, window);
    expect(right.yaw).toBeGreaterThan(0);
    const far = lookFromDrag({ yaw: 0, pitch: 0 }, -5000, 5000, window);
    expect(far).toEqual({ yaw: 1, pitch: 1 });
  });
});
