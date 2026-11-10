import { orbitFromDrag, YAW_PER_SCREEN, PITCH_PER_SCREEN } from '../src/features/garden/components/useGardenLook';

/**
 * The Tree of Mind's camera orbit (10-11). Before it the garden was the only 3D place in the app whose
 * camera could not be moved, and decor edit mode asked the player to furnish the far half of an island
 * no shot could see. The sums below are the part Unity trusts this side to get right: Unity does not
 * clamp the yaw at all, on purpose.
 */
const WINDOW = { width: 400, height: 800 };

describe('the garden orbit a drag reaches', () => {
  it('grabs the world: dragging left swings the camera right', () => {
    const { yaw } = orbitFromDrag({ yaw: 0, pitch: 0 }, -WINDOW.width / 2, 0, WINDOW);
    expect(yaw).toBeCloseTo(YAW_PER_SCREEN / 2, 5);
  });

  it('carries on from where the last drag left the camera, past a full turn', () => {
    // Two drags the full width of the screen are more than 360°: the yaw must keep climbing, because
    // wrapping it here would make the next drag jump. Unity takes the modulo instead.
    const first = orbitFromDrag({ yaw: 0, pitch: 0 }, -WINDOW.width, 0, WINDOW);
    const second = orbitFromDrag(first, -WINDOW.width, 0, WINDOW);
    expect(first.yaw).toBeCloseTo(YAW_PER_SCREEN, 5);
    expect(second.yaw).toBeCloseTo(YAW_PER_SCREEN * 2, 5);
    expect(second.yaw).toBeGreaterThan(360);
  });

  it('holds the pitch inside -1..1 however far the finger goes', () => {
    expect(orbitFromDrag({ yaw: 0, pitch: 0 }, 0, -WINDOW.height, WINDOW).pitch).toBe(1);
    expect(orbitFromDrag({ yaw: 0, pitch: 0 }, 0, WINDOW.height * 4, WINDOW).pitch).toBe(-1);
    // Half the screen is half the band, so a small drag is a small move.
    expect(orbitFromDrag({ yaw: 0, pitch: 0 }, 0, -WINDOW.height / 4, WINDOW).pitch)
      .toBeCloseTo(PITCH_PER_SCREEN / 4, 5);
  });

  it('survives a zero-sized window instead of returning NaN', () => {
    const o = orbitFromDrag({ yaw: 10, pitch: 0 }, 30, 30, { width: 0, height: 0 });
    expect(Number.isFinite(o.yaw)).toBe(true);
    expect(Number.isFinite(o.pitch)).toBe(true);
  });
});
