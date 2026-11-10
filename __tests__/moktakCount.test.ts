/**
 * The wooden fish's count (spec 010 US1): the tap floor is RN's whole anti-drumming guard
 * (FR-004 — the server never sees individual taps), so it is pinned here: a floor measured from
 * the last COUNTED tap, 0 → 108, and the 108th strike flipping `done` exactly once.
 */
import { MOKTAK_TAPS, MoktakCount, TAP_FLOOR_MS } from '../src/features/meditations/moktak';

it('rejects a 200 ms double-tap but still answers it (sound without count)', () => {
  const m = new MoktakCount();
  expect(m.tap(1000)).toEqual({ counted: true, count: 1, done: false });
  expect(m.tap(1200)).toEqual({ counted: false, count: 1, done: false });
  // 250 ms after the last COUNTED tap, not after the refused one: the burst cannot re-arm itself.
  expect(m.tap(1250)).toEqual({ counted: true, count: 2, done: false });
});

it('measures the floor from the last counted tap through a whole burst', () => {
  const m = new MoktakCount();
  m.tap(0);
  // Drumming at 100 ms: only every third touch lands a full floor after the last counted one.
  const counted = [100, 200, 300, 400, 500, 600].map(t => m.tap(t).counted);
  expect(counted).toEqual([false, false, true, false, false, true]);
  expect(m.count).toBe(3);
});

it('the 108th tap flips done, and nothing moves after it', () => {
  const m = new MoktakCount();
  for (let i = 0; i < MOKTAK_TAPS - 1; i += 1) {
    expect(m.tap(i * TAP_FLOOR_MS).done).toBe(false);
  }
  expect(m.count).toBe(107);
  expect(m.tap(108 * TAP_FLOOR_MS)).toEqual({ counted: true, count: 108, done: true });
  // Tapping past the end never takes anything away — and never counts either.
  expect(m.tap(200 * TAP_FLOOR_MS)).toEqual({ counted: false, count: 108, done: true });
  expect(m.done).toBe(true);
});

it('resets to a fresh instrument', () => {
  const m = new MoktakCount();
  m.tap(0);
  m.reset();
  expect(m.count).toBe(0);
  // The floor forgets the old sitting too: the first tap of the new one always counts.
  expect(m.tap(1).counted).toBe(true);
});
