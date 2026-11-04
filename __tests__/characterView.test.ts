import { DEG_PER_PT, yawFromDrag, zoomFromPinch } from '../src/features/character/useCharacterView';

describe('character creator view (CHARACTER_VIEW)', () => {
  it('turns the body with the finger: a drag right brings its front round to the right', () => {
    expect(yawFromDrag(0, 100)).toBeCloseTo(-100 * DEG_PER_PT);
    expect(yawFromDrag(-45, -100)).toBeCloseTo(-45 + 100 * DEG_PER_PT);
  });

  it('keeps a long spin as a running angle (Unity wraps it)', () => {
    expect(yawFromDrag(0, -1000)).toBeGreaterThan(360);
  });

  it('zooms in when the fingers spread and back out when they pinch, inside 0..1', () => {
    expect(zoomFromPinch(0, 100, 150)).toBeCloseTo(0.5);
    expect(zoomFromPinch(1, 200, 100)).toBeCloseTo(0.5);
    expect(zoomFromPinch(0.8, 100, 400)).toBe(1);
    expect(zoomFromPinch(0.2, 100, 10)).toBe(0);
  });

  it('ignores a pinch that never measured its start', () => {
    expect(zoomFromPinch(0.3, 0, 120)).toBe(0.3);
  });
});
