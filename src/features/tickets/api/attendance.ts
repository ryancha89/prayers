import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { noteCheckIn } from '../../myroom/inbox/inboxStore';
import { useCoins } from '../../coins/store/coinStore';
import { noteCheckedInToday } from '../../notifications/reminder';

/**
 * The daily check-in: 20 Prayer Coins a day into the coin wallet, topping it up to 100 at most
 * (10-17: at 85 it gives 15, at 100+ nothing — the day still counts). The policy is the server's (Prayers::AttendanceService) — this only asks
 * and shows. The wallet is written here from the server's answer, as every coin layer does.
 *
 * "Today" is the PHONE's date, sent as `local_date`: a player in Hanoi checks in on their own
 * midnight, not Seoul's.
 */
export interface AttendanceStatus {
  checkedToday: boolean;
  /** Prayer Coins a check-in would give now — 0 once the wallet is at the server's cap. */
  dailyCoins: number;
  coinBalance: number | null;
  /** Every day ever checked in (server `days_total`); 0 from a server that predates it. */
  daysTotal: number;
}

export interface CheckInResult {
  ok: boolean;
  alreadyChecked: boolean;
  /** Prayer Coins this check-in gave. */
  granted: number;
  coinBalance: number | null;
  /** As AttendanceStatus.daysTotal, after this check-in; null from an older server. */
  daysTotal: number | null;
}

export function localDate(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export async function fetchAttendance(signal?: AbortSignal): Promise<AttendanceStatus | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/attendance?local_date=${localDate()}`, { signal });
    if (!res?.ok) return null;
    const b = await res.json();
    if (!b?.success) return null;
    const status: AttendanceStatus = {
      checkedToday: !!b.checked_today,
      dailyCoins: b.daily_coins ?? 20,
      coinBalance: typeof b.coin_balance === 'number' ? b.coin_balance : null,
      daysTotal: typeof b.days_total === 'number' ? b.days_total : 0,
    };
    // My Room's mailbox: today's reward waiting (or already claimed elsewhere).
    noteCheckIn(localDate(), status.checkedToday);
    if (status.checkedToday) noteCheckedInToday();
    return status;
  } catch {
    return null;
  }
}

export async function checkIn(): Promise<CheckInResult | null> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/attendance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local_date: localDate() }),
    });
    if (!res) return null;
    const b = await res.json();
    const already = b?.error_code === 'already_checked';
    if (!b?.success && !already) return null;
    if (b?.success) noteCheckIn(localDate(), true, b.granted ?? 0);
    // Today is done either way: today's reminder must not ring.
    if (b?.success || already) noteCheckedInToday();
    const coinBalance = typeof b.coin_balance === 'number' ? b.coin_balance : null;
    if (coinBalance != null) useCoins.getState().setBalance(coinBalance);
    return {
      ok: !!b.success,
      alreadyChecked: already,
      granted: b.granted ?? 0,
      coinBalance,
      daysTotal: typeof b.days_total === 'number' ? b.days_total : null,
    };
  } catch {
    return null;
  }
}

export interface AttendanceMonth {
  year: number;
  month: number;
  /** YYYY-MM-DD of every checked-in day, with what it gave. */
  days: { date: string; coins: number }[];
  count: number;
  coins: number;
}

/** The calendar's stamps for one month (1-12). */
export async function fetchAttendanceMonth(
  year: number,
  month: number,
  signal?: AbortSignal,
): Promise<AttendanceMonth | null> {
  try {
    const res = await authedFetch(
      `${apiBase()}/api/v1/prayers/attendance/monthly?year=${year}&month=${month}&local_date=${localDate()}`,
      { signal },
    );
    if (!res?.ok) return null;
    const b = await res.json();
    if (!b?.success) return null;
    return {
      year: b.year,
      month: b.month,
      days: Array.isArray(b.days) ? b.days : [],
      count: b.count ?? 0,
      coins: b.coins ?? 0,
    };
  } catch {
    return null;
  }
}
