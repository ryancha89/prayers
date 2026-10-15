import type { FieldSpec } from './types';

/**
 * What a typed field must look like before it is saved. Kept to the three shapes that later turn
 * into arithmetic on the server — a year, a calendar date, a clock time — because a wrong one
 * there is a wrong chart, not a typo. Free text is never validated: "2024년 봄" is an answer.
 *
 * Returns the i18n key of the complaint, or null when the value passes (or is empty and optional).
 */
export type ValidationKey = 'archive.err.year' | 'archive.err.date' | 'archive.err.time';

const THIS_YEAR = new Date().getFullYear();
const EARLIEST = 1900;

/** "2024", "2024년", "2024년 3월", "2024-03" — a year in range somewhere in the text. */
export const yearIn = (v: string): number | null => {
  const m = v.match(/(19|20)\d{2}/);
  if (!m) return null;
  const y = Number(m[0]);
  return y >= EARLIEST && y <= THIS_YEAR ? y : null;
};

/** A real calendar date, not in the future. */
export const validDate = (v: string): boolean => {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < EARLIEST || y > THIS_YEAR || mo < 1 || mo > 12 || d < 1) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
  return dt.getTime() <= Date.now();
};

export const validTime = (v: string): boolean => {
  const m = v.match(/^(\d{2}):(\d{2})$/);
  if (!m) return false;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  return h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
};

export function validate(field: FieldSpec, raw: string | undefined): ValidationKey | null {
  const v = (raw ?? '').trim();
  if (v.length === 0) return null; // required-ness is the form's concern, not the shape's
  switch (field.kind) {
    case 'year':
      return /^\d{4}$/.test(v) && yearIn(v) !== null ? null : 'archive.err.year';
    case 'date':
      return validDate(v) ? null : 'archive.err.date';
    case 'time':
      return validTime(v) ? null : 'archive.err.time';
    case 'text':
      // "Known since" is free text, but it is ABOUT a year: text with no year in range is the
      // one typo worth catching here (e.g. "2206년").
      return field.key === 'since' && !yearIn(v) ? 'archive.err.year' : null;
    default:
      return null;
  }
}
