/**
 * Spec 010 FR-008: the haptic tick is a seam over RN core Vibration (no haptics lib exists —
 * shared/haptics.ts is the swap point), behind a persisted toggle. Pinned: the tick obeys the
 * toggle, swallows platform refusals, and the stored preference only turns it off on a stored
 * `false` (the sound switches' merge rule).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
const mockVibrate = jest.fn();
jest.mock('react-native', () => ({ Vibration: { vibrate: (...a: unknown[]) => mockVibrate(...a) } }));

import { hapticsEnabled, tick, useHapticsStore } from '../src/shared/haptics';

beforeEach(() => {
  mockVibrate.mockReset();
  useHapticsStore.setState({ enabled: true });
});

it('ticks while the toggle is on, and is silent when it is off', () => {
  tick();
  expect(mockVibrate).toHaveBeenCalledTimes(1);
  useHapticsStore.getState().toggle();
  expect(hapticsEnabled()).toBe(false);
  tick();
  expect(mockVibrate).toHaveBeenCalledTimes(1);
});

it('never lets the platform break a tap', () => {
  mockVibrate.mockImplementation(() => {
    throw new Error('no vibrator');
  });
  expect(() => tick()).not.toThrow();
});

it('reads anything but a stored false as on (the sound switches rule)', () => {
  const merge = (useHapticsStore as any).persist?.getOptions?.().merge;
  expect(merge({ enabled: false }, { enabled: true })).toMatchObject({ enabled: false });
  expect(merge({}, { enabled: true })).toMatchObject({ enabled: true });
  expect(merge(undefined, { enabled: true })).toMatchObject({ enabled: true });
});
