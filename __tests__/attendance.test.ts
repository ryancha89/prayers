jest.mock('../src/features/notifications/reminder', () => ({ noteCheckedInToday: jest.fn() }));
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));
const mockFetch = jest.fn();
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: (...a: unknown[]) => mockFetch(...a) }));

import { checkIn, fetchAttendance, localDate } from '../src/features/tickets/api/attendance';

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe('daily check-in api', () => {
  beforeEach(() => mockFetch.mockReset());

  it("sends the phone's own date", async () => {
    mockFetch.mockResolvedValue(reply({ success: true, checked_today: false, daily_coins: 20, coin_balance: 50 }));
    const s = await fetchAttendance();
    expect(mockFetch.mock.calls[0][0]).toContain(`local_date=${localDate()}`);
    // An older server sends no days_total: 0, never undefined.
    expect(s).toEqual({ checkedToday: false, dailyCoins: 20, coinBalance: 50, daysTotal: 0 });
  });

  it('reads days_total, every day ever checked in (My Room level), on the status and the check-in', async () => {
    mockFetch.mockResolvedValue(reply({ success: true, checked_today: true, daily_coins: 20, coin_balance: 50, days_total: 12 }));
    expect((await fetchAttendance())?.daysTotal).toBe(12);
    mockFetch.mockResolvedValue(reply({ success: true, granted: 20, coin_balance: 70, days_total: 13 }));
    expect((await checkIn())?.daysTotal).toBe(13);
    mockFetch.mockResolvedValue(reply({ success: true, granted: 20, coin_balance: 90 }));
    expect((await checkIn())?.daysTotal).toBeNull();
  });

  it('reports the coins granted and writes the wallet', async () => {
    mockFetch.mockResolvedValue(reply({ success: true, granted: 20, coin_balance: 120 }));
    expect(await checkIn()).toMatchObject({ ok: true, granted: 20, coinBalance: 120 });
    expect(require('../src/features/coins/store/coinStore').useCoins.getState().balance).toBe(120);
  });

  it('treats "already checked" as an answer, not a failure', async () => {
    mockFetch.mockResolvedValue(reply({ success: false, error_code: 'already_checked' }));
    expect(await checkIn()).toMatchObject({ ok: false, alreadyChecked: true, granted: 0 });
  });

  it('returns null when the server cannot be reached', async () => {
    mockFetch.mockResolvedValue(null);
    expect(await checkIn()).toBeNull();
    expect(await fetchAttendance()).toBeNull();
  });

  it('formats the local date as YYYY-MM-DD', () => {
    expect(localDate(new Date(2026, 8, 7))).toBe('2026-09-07');
  });
});
