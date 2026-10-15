import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';
import { noteCheckIn } from '../../myroom/inbox/inboxStore';
import { useCoins } from '../../coins/store/coinStore';

/**
 * The daily check-in: 10-15, 20 Prayer Coins a day into the coin wallet, no cap (it was two free
 * tickets, up to ten kept). The policy is the server's (Prayers::AttendanceService) — this only asks
 * and shows. The wallet is written here from the server's answer, as every coin layer does.
 *
 * "Today" is the PHONE's date, sent as `local_date`: a player in Hanoi checks in on their own
 * midnight, not Seoul's.
 */
export interface AttendanceStatus {
  checkedToday: boolean;
  /** Prayer Coins a check-in gives. */
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
