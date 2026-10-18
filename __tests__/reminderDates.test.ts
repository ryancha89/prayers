jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
import { reminderDates } from '../src/features/notifications/reminder';

// 10-17: the check-in reminder rings on each of the next 14 days, never on a day already checked in.
describe('reminderDates', () => {
  const morning = new Date(2026, 9, 17, 8, 0);
  it('starts today when the time is still ahead, and spans 14 days', () => {
    const d = reminderDates(morning, 9, 0, null);
    expect(d[0]).toBe('2026-10-17');
    expect(d).toHaveLength(14);
    expect(d[13]).toBe('2026-10-30');
  });
  it('skips today once checked in, and today’s time already passed', () => {
    expect(reminderDates(morning, 9, 0, '2026-10-17')[0]).toBe('2026-10-18');
    expect(reminderDates(new Date(2026, 9, 17, 10, 0), 9, 0, null)[0]).toBe('2026-10-18');
  });
  it('crosses month ends', () => {
    expect(reminderDates(new Date(2026, 9, 31, 23, 0), 9, 0, null)[0]).toBe('2026-11-01');
  });
});
