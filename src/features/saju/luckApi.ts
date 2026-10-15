import { apiBase } from '../../shared/config/api';
import { authedFetch } from '../auth/api/headers';

/** One 대운 or 세운 as `POST /api/v1/saju/luck` flattens it. */
export interface LuckItem {
  /** 간지, e.g. "戊午". */
  luck: string;
  /** 대운: the age it starts at. 세운: the year. */
  number: number | null;
  /** 십성 of the stem and of the branch against the day master ("비견", "정인" …). */
  skyProp: string;
  earthProp: string;
  /** 십이운성. */
  star: string;
}

export interface Luck {
  /** 대운수 — the age the first 대운 begins. */
  decadeNumber: number;
  /** First 대운 first. */
  decades: LuckItem[];
  /** 세운, oldest year first. */
  years: LuckItem[];
}

const item = (x: any): LuckItem => ({
  luck: String(x?.luck ?? ''),
  number: x?.number == null ? null : Number(x.number),
  skyProp: String(x?.sky_prop ?? ''),
  earthProp: String(x?.earth_prop ?? ''),
  star: String(x?.star ?? ''),
});

/**
 * 대운·세운 for a birth — computed by the server's 만세력 with the same clock corrections as the
 * chart (Seoul −30 min, Korean summer time), because the 대운수 depends on the distance to the
 * solar term. Null on any failure; the caller just leaves the section out.
 */
export async function fetchLuck(
  input: { birthDate: string; birthTime?: string; gender: 'male' | 'female' },
  signal?: AbortSignal,
): Promise<Luck | null> {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.birthDate.trim());
  if (!date) return null;
  const time = input.birthTime ? /^(\d{1,2}):(\d{2})$/.exec(input.birthTime.trim()) : null;
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/saju/luck`, {
      method: 'POST',
      body: JSON.stringify({
        year: Number(date[1]),
        month: Number(date[2]),
        day: Number(date[3]),
        gender: input.gender,
        calendar_type: 'solar',
        ...(time ? { hour: Number(time[1]), minute: Number(time[2]), time_unknown: false } : { time_unknown: true }),
      }),
      signal,
    });
    if (!res || !res.ok) return null;
    const body = await res.json();
    if (body?.success !== true || !Array.isArray(body.decades)) return null;
    return {
      decadeNumber: Number(body.decade_number ?? 0),
      decades: body.decades.map(item).filter((d: LuckItem) => d.luck),
      years: (Array.isArray(body.years) ? body.years.map(item) : [])
        .filter((y: LuckItem) => y.luck && y.number != null)
        .sort((a: LuckItem, b: LuckItem) => a.number! - b.number!),
    };
  } catch {
    return null;
  }
}

/** The 대운 running now: the last one that has started by this year's age (current year − birth
 *  year, as saju_world's LuckSettingUI counts it). */
export function currentDecadeIndex(decades: LuckItem[], birthYear: number, now = new Date()): number {
  const age = now.getFullYear() - birthYear;
  let index = -1;
  decades.forEach((d, i) => {
    if (d.number != null && d.number <= age) index = i;
  });
  return index;
}
