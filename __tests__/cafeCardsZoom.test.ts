import { drag, newGesture, pinch, toHalfViews } from '../src/features/cafe/table/cardsZoom';

describe('the spread zoom gestures (23-10)', () => {
  it('a pinch is the fingers spread and their midpoint travel; Unity owns the zoom itself', () => {
    const g = pinch(7, { dist: 100, mid: { x: 0.1, y: 0.2 } }, { dist: 180, mid: { x: 0.3, y: 0.1 } });
    expect(g.gesture).toBe(7);
    expect(g.scale).toBeCloseTo(1.8);
    expect(g.x).toBeCloseTo(0.2);
    expect(g.y).toBeCloseTo(-0.1);
  });

  it('a drag never scales, and gesture numbers are never reused', () => {
    expect(drag(3, 0.5, -0.25)).toEqual({ gesture: 3, scale: 1, x: 0.5, y: -0.25 });
    const a = newGesture();
    expect(newGesture()).toBeGreaterThan(a);
  });

  it('half-views run from the centre, +y up', () => {
    expect(toHalfViews(0.5, 0.5)).toEqual({ x: 0, y: 0 });
    expect(toHalfViews(1, 0)).toEqual({ x: 1, y: 1 });
  });
});
