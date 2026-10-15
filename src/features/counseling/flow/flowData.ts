/**
 * The flow asset and its strings, typed and looked up.
 *
 * Both JSON files are generated — see `Tools/consultation/export_flow.py`.
 */
import { ConsultationPhase, LocEntry } from './types';
import type { Lang } from '../../../shared/i18n';
import flowJson from './consultationFlow.json';
import stringsJson from './consultationStrings.json';

export const phases: ConsultationPhase[] = (flowJson as { phases: ConsultationPhase[] }).phases;

const strings = stringsJson as Record<string, LocEntry>;

/**
 * Localized consultation line. Falls back ko → en → the key itself, which is
 * what the Unity `Loc.Get` does: a visible key is a bug report, a blank line is
 * a mystery.
 */
export function loc(key: string, lang: Lang, fallback = ''): string {
  if (!key) return fallback;
  const entry = strings[key];
  if (!entry) return fallback || key;
  return entry[lang] || entry.ko || entry.en || fallback || key;
}

/** `{0}`-style tokens — the asset interpolates the topic into P04 and friends. */
export function format(text: string, args: (string | number)[]): string {
  return text.replace(/\{(\d+)\}/g, (whole, i) => {
    const v = args[Number(i)];
    return v === undefined ? whole : String(v);
  });
}

export function phaseById(id: string): ConsultationPhase | undefined {
  return phases.find(p => p.id === id);
}

export function indexOf(id: string): number {
  return phases.findIndex(p => p.id === id);
}
