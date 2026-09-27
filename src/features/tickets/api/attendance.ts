import { apiBase } from '../../../shared/config/api';
import { authedFetch } from '../../auth/api/headers';

/**
 * The daily check-in (2026-09-27): two free tickets a day, and free tickets stop piling up at ten.
 * The policy is the server's (Prayers::AttendanceService) — this only asks and shows.
 *
 * "Today" is the PHONE's date, sent as `local_date`: a player in Hanoi checks in on their own
 * midnight, not Seoul's.
 */
export interface AttendanceStatus {
  checkedToday: boolean;
  dailyTickets: number;
  freeBalance: number;
  freeCap: number;
  tickets: number;
}

export interface CheckInResult {
  ok: boolean;
  alreadyChecked: boolean;
  granted: number;
  capReached: boolean;
  freeBalance: number;
  freeCap: number;
  tickets: number | null;
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
    return {
      checkedToday: !!b.checked_today,
      dailyTickets: b.daily_tickets ?? 2,
      freeBalance: b.free_balance ?? 0,
      freeCap: b.free_cap ?? 10,
      tickets: b.tickets ?? 0,
    };
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
    return {
      ok: !!b.success,
      alreadyChecked: already,
      granted: b.granted ?? 0,
      capReached: !!b.cap_reached,
      freeBalance: b.free_balance ?? 0,
      freeCap: b.free_cap ?? 10,
      tickets: typeof b.tickets === 'number' ? b.tickets : null,
    };
  } catch {
    return null;
  }
}

export interface AttendanceMonth {
  year: number;
  month: number;
  /** YYYY-MM-DD of every checked-in day, with what it gave. */
  days: { date: string; tickets: number }[];
  count: number;
  tickets: number;
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
      tickets: b.tickets ?? 0,
    };
  } catch {
    return null;
  }
}
