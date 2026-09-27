jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));
const mockFetch = jest.fn();
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: (...a: unknown[]) => mockFetch(...a) }));

import { checkIn, fetchAttendance, localDate } from '../src/features/tickets/api/attendance';

const reply = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe('daily check-in api', () => {
  beforeEach(() => mockFetch.mockReset());

  it("sends the phone's own date", async () => {
    mockFetch.mockResolvedValue(reply({ success: true, checked_today: false, daily_tickets: 2, free_balance: 3, free_cap: 10, tickets: 5 }));
    const s = await fetchAttendance();
    expect(mockFetch.mock.calls[0][0]).toContain(`local_date=${localDate()}`);
    expect(s).toEqual({ checkedToday: false, dailyTickets: 2, freeBalance: 3, freeCap: 10, tickets: 5 });
  });

  it('reports what was granted, and a full wallet as capped', async () => {
    mockFetch.mockResolvedValue(reply({ success: true, granted: 1, cap_reached: true, free_balance: 10, free_cap: 10, tickets: 12 }));
    expect(await checkIn()).toMatchObject({ ok: true, granted: 1, capReached: true, freeBalance: 10, tickets: 12 });
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
