/**
 * Tree of Mind (spec 008): the breath and the clock, without a screen.
 *  · 4 s in / 6 s out with NO hold — the proposal's recommendation for §8 Q3, pinned so nobody turns
 *    it into the meditation room's 4-4-6 by accident;
 *  · a press is "in rhythm" only when it follows the guide, and touching never takes anything away;
 *  · the session clock walks a whole sitting in fake time, with no pause.
 */
import { BREATH_MS, EXHALE_MS, INHALE_MS, RHYTHM_TOLERANCE_MS, breathSync, guideFullness, phaseAt, rhythmCycle } from '../src/features/garden/breath';
import { GardenSession } from '../src/features/garden/gardenSession';

function fakeClock(start = 1_000_000) {
  let now = start;
  return { clock: { now: () => now }, advance: (ms: number) => { now += ms; } };
}

it('breathes 4 s in and 6 s out, with no hold', () => {
  expect([INHALE_MS, EXHALE_MS, BREATH_MS]).toEqual([4000, 6000, 10000]);
  expect(phaseAt(0).phase).toBe('in');
  expect(phaseAt(3999).phase).toBe('in');
  expect(phaseAt(4000)).toEqual({ phase: 'out', phaseProgress: 0, cycle: 0 });
  expect(phaseAt(10000)).toEqual({ phase: 'in', phaseProgress: 0, cycle: 1 });
  expect(breathSync(23500)).toEqual({ inMs: 4000, outMs: 6000, intoMs: 3500 });
});

it('fills the orb on the in-breath and empties it on the out-breath', () => {
  expect(guideFullness(0)).toBe(0);
  expect(guideFullness(4000)).toBe(1);
  expect(guideFullness(2000)).toBeCloseTo(0.5);
  expect(guideFullness(10000)).toBe(0);
});

it('counts a press as in rhythm only when it follows the guide', () => {
  // Down with the in-breath, up with the out-breath.
  expect(rhythmCycle(0, 4000)).toBe(0);
  expect(rhythmCycle(10_300, 13_900)).toBe(1);
  // A moment early still belongs to the coming breath.
  expect(rhythmCycle(19_200, 24_100)).toBe(2);
  // Down in the middle of the out-breath, or held far too long: not with the guide.
  expect(rhythmCycle(6000, 9000)).toBe(-1);
  expect(rhythmCycle(0, 4000 + RHYTHM_TOLERANCE_MS + 1)).toBe(-1);
  expect(rhythmCycle(5000, 4000)).toBe(-1);
});

it('walks a three-minute sitting to done, counting breaths and breaths taken with the guide', () => {
  const { clock, advance } = fakeClock();
  const s = new GardenSession(clock);
  expect(s.read().status).toBe('idle');
  s.start(3);
  expect(s.read()).toMatchObject({ status: 'running', phase: 'in', remainingSeconds: 180, breaths: 0, inRhythm: 0 });

  // One breath with the guide, one against it.
  s.press();
  advance(4000);
  expect(s.release()).toBe(true);
  advance(2000);
  s.press();
  advance(2000);
  expect(s.release()).toBe(false);
  expect(s.read()).toMatchObject({ breaths: 0, inRhythm: 1 });

  advance(172_000);
  expect(s.read()).toMatchObject({ status: 'done', remainingSeconds: 0, breaths: 18, inRhythm: 1 });
  // The clock does not run on past the end.
  advance(60_000);
  expect(s.read().remainingSeconds).toBe(0);
});

it('ignores touches when no sitting is running, and Stop ends it', () => {
  const { clock, advance } = fakeClock();
  const s = new GardenSession(clock);
  s.press();
  expect(s.release()).toBe(false);
  s.start(5);
  advance(30_000);
  s.stop();
  expect(s.read().status).toBe('idle');
});
