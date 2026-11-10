/**
 * Spec 010's parameterised breath engine: the 4-4-6 maths the snow mountain runs on, with the
 * config injected rather than hard-coded (the garden's 4/6 and the breathing room's 4-4-6 keep
 * their own files, untouched).
 */
import { breathsIn, cycleMs, DEFAULT_BREATH, guideFullness, phaseAt } from '../src/features/meditations/breathEngine';

const C = { inMs: 4000, holdMs: 4000, outMs: 6000 };

it('walks one 4-4-6 cycle: in → hold → out, with honest progress', () => {
  expect(cycleMs(C)).toBe(14000);
  expect(phaseAt(C, 0)).toEqual({ phase: 'in', phaseProgress: 0, cycle: 0 });
  expect(phaseAt(C, 2000)).toEqual({ phase: 'in', phaseProgress: 0.5, cycle: 0 });
  expect(phaseAt(C, 4000)).toEqual({ phase: 'hold', phaseProgress: 0, cycle: 0 });
  expect(phaseAt(C, 6000)).toEqual({ phase: 'hold', phaseProgress: 0.5, cycle: 0 });
  expect(phaseAt(C, 8000)).toEqual({ phase: 'out', phaseProgress: 0, cycle: 0 });
  expect(phaseAt(C, 11000)).toEqual({ phase: 'out', phaseProgress: 0.5, cycle: 0 });
  expect(phaseAt(C, 14000)).toEqual({ phase: 'in', phaseProgress: 0, cycle: 1 });
});

it('counts whole breaths and keeps counting across cycles', () => {
  expect(breathsIn(C, 0)).toBe(0);
  expect(breathsIn(C, 13999)).toBe(0);
  expect(breathsIn(C, 14000)).toBe(1);
  expect(breathsIn(C, 3 * 60 * 1000)).toBe(12); // a 3-minute sitting = 12 full 4-4-6 breaths
});

it('holds the ring full through the hold, empty at the turn-arounds', () => {
  expect(guideFullness(C, 0)).toBe(0);
  expect(guideFullness(C, 4000)).toBe(1);
  expect(guideFullness(C, 6000)).toBe(1); // mid-hold: lungs stay full
  expect(guideFullness(C, 8000)).toBe(1);
  expect(guideFullness(C, 14000)).toBe(0);
});

it('skips a zero-length hold without a flicker frame', () => {
  const noHold = { inMs: 4000, holdMs: 0, outMs: 6000 };
  expect(phaseAt(noHold, 4000).phase).toBe('out');
  expect(cycleMs(noHold)).toBe(10000);
});

it('ships the server-matching default (contract §1 SNOW_BREATH)', () => {
  expect(DEFAULT_BREATH).toEqual({ inMs: 4000, holdMs: 4000, outMs: 6000 });
});

it('clamps a negative elapsed to the cycle start', () => {
  expect(phaseAt(C, -50)).toEqual({ phase: 'in', phaseProgress: 0, cycle: 0 });
  expect(breathsIn(C, -1)).toBe(0);
});
