import { keysVector } from '../src/features/world/components/useKeyboardWalk';

describe('keysVector (WASD → WALK_INPUT)', () => {
  it('maps each key to its axis', () => {
    expect(keysVector(new Set(['up']))).toEqual({ x: 0, y: 1 });
    expect(keysVector(new Set(['down']))).toEqual({ x: 0, y: -1 });
    expect(keysVector(new Set(['left']))).toEqual({ x: -1, y: 0 });
    expect(keysVector(new Set(['right']))).toEqual({ x: 1, y: 0 });
  });

  it('keeps a diagonal at walking speed, and opposite keys cancel', () => {
    expect(keysVector(new Set(['up', 'right']))).toEqual({ x: 0.71, y: 0.71 });
    expect(keysVector(new Set(['left', 'right']))).toEqual({ x: 0, y: 0 });
    expect(keysVector(new Set())).toEqual({ x: 0, y: 0 });
  });
});
