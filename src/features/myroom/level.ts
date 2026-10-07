import type { TranslationKey } from '../../shared/i18n';
import type { ArchiveMemory } from '../archive/types';
import { isDiaryKind } from '../archive/types';
import type { ConversationSummary } from '../conversations/types';
import type { DiaryReflection } from './diary/diaryStore';

/**
 * My Room's level (the badge's "Lv. 80 / 방랑하는 별", 07-10 mockup). There is no level system on
 * the server and none is stored here: the level is DERIVED, every time, from what the player has
 * actually done — counted from data the app already keeps or the server already returns. Nothing
 * can be bought or farmed that the app did not already count for its own reasons, and a reinstall
 * that pulls the account back down gets the same level back (except the transcript cache, below).
 *
 * Where each count comes from:
 *   checkIns       GET prayers/attendance `days_total` — every day ever checked in (server-owned)
 *   counselors     the conversations store — one thread per counsellor × subject (server-merged)
 *   questions      the conversations store's cached transcripts — the player's own turns. The cache
 *                  is the phone's (a fresh install starts it empty), so it is weighted low
 *   diaryEntries   아카이브 rows of a diary kind (diary / goal / wish / plan) — synced with the account
 *   reflections    diary entries a counsellor has finished reading (diary store, from the server)
 *   memories       every other 아카이브 row the player kept (not a counsellor's unapproved guess)
 *   stations       journey stations whose free part was heard (saved-journeys store)
 *   journeys       journeys ridden to the end (saved-journeys store)
 *
 * Coins never buy XP: paid moments and furniture are not counted.
 */
export interface Activity {
  checkIns: number;
  counselors: number;
  questions: number;
  diaryEntries: number;
  reflections: number;
  memories: number;
  stations: number;
  journeys: number;
}

export type ActivitySource = keyof Activity;

/**
 * XP per unit. The daily habits (a check-in, a diary entry) are worth about one diary page each; a
 * question is small because there are many and the cache is lossy; a finished journey is the
 * biggest single thing in the app (a whole year told, station by station).
 */
export const XP_WEIGHTS: Record<ActivitySource, number> = {
  checkIns: 10,
  counselors: 20,
  questions: 2,
  diaryEntries: 15,
  reflections: 5,
  memories: 4,
  stations: 6,
  journeys: 30,
};

/** Display order of the profile sheet's "where your XP came from". */
export const ACTIVITY_ORDER: ActivitySource[] = [
  'checkIns', 'diaryEntries', 'reflections', 'counselors', 'questions', 'journeys', 'stations', 'memories',
];

export const MAX_LEVEL = 99;

/**
 * XP needed to go from `level` to `level + 1`: 40, then 10 more per level. Gentle at the start —
 * level 2 is four check-ins, level 5 about a fortnight of check-ins and diary pages — and slow at
 * the top, so 80 is a long companionship rather than a weekend.
 */
export const stepXp = (level: number): number => 40 + 10 * (Math.max(1, level) - 1);

/** Total XP at which `level` begins. Level 1 begins at 0. */
export function levelStartXp(level: number): number {
  const n = Math.max(1, Math.min(MAX_LEVEL, Math.floor(level))) - 1;
  // Σ_{k=1..n} (40 + 10(k−1)) = 40n + 5n(n−1)
  return 40 * n + 5 * n * (n - 1);
}

const nonNeg = (v: number) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function xpOf(a: Activity): { total: number; by: Record<ActivitySource, number> } {
  const by = {} as Record<ActivitySource, number>;
  let total = 0;
  for (const k of ACTIVITY_ORDER) {
    by[k] = nonNeg(a[k]) * XP_WEIGHTS[k];
    total += by[k];
  }
  return { total, by };
}

export interface LevelInfo {
  level: number;
  xp: number;
  /** XP earned inside the current level, and what the level takes; equal at MAX_LEVEL. */
  intoLevel: number;
  levelSpan: number;
  /** 0..1 toward the next level (1 at MAX_LEVEL). */
  progress: number;
  title: TranslationKey;
  /** The level at which the next title begins; null in the last band. */
  nextTitleAt: number | null;
}

export function levelOf(xp: number): LevelInfo {
  const total = nonNeg(xp);
  let level = 1;
  while (level < MAX_LEVEL && levelStartXp(level + 1) <= total) level += 1;
  const start = levelStartXp(level);
  const span = level >= MAX_LEVEL ? 0 : stepXp(level);
  const into = total - start;
  const band = titleBand(level);
  return {
    level,
    xp: total,
    intoLevel: into,
    levelSpan: span,
    progress: span === 0 ? 1 : Math.min(1, into / span),
    title: band.key,
    nextTitleAt: band.next,
  };
}

/**
 * Titles by level band (ko first: 새내기 여행자 → 하늘의 길잡이). "방랑하는 별" is the middle of the
 * road, as the mockup's badge has it. Keys live in all six translation tables.
 */
export const TITLE_BANDS: { from: number; key: TranslationKey }[] = [
  { from: 1, key: 'myroom.title.1' },   // 새내기 여행자
  { from: 5, key: 'myroom.title.5' },   // 별을 찾는 이
  { from: 10, key: 'myroom.title.10' }, // 길 위의 순례자
  { from: 20, key: 'myroom.title.20' }, // 방랑하는 별
  { from: 35, key: 'myroom.title.35' }, // 달빛을 지키는 이
  { from: 55, key: 'myroom.title.55' }, // 운명을 읽는 현자
  { from: 80, key: 'myroom.title.80' }, // 하늘의 길잡이
];

export function titleBand(level: number): { key: TranslationKey; next: number | null } {
  let i = 0;
  while (i + 1 < TITLE_BANDS.length && TITLE_BANDS[i + 1].from <= level) i += 1;
  return { key: TITLE_BANDS[i].key, next: TITLE_BANDS[i + 1]?.from ?? null };
}

/**
 * The counts, from the stores' own shapes. Pure: the screen hands it what the stores hold, the
 * tests hand it fixtures. `checkIns` is the server's number (null = not known yet, counted as 0).
 */
export function activityFrom(input: {
  checkIns: number | null | undefined;
  conversations: ConversationSummary[];
  memories: ArchiveMemory[];
  reflections: Record<string, DiaryReflection>;
  heard: Record<string, string[]>;
  journeysFinished: number;
}): Activity {
  const diary = input.memories.filter(m => isDiaryKind(m.category));
  const diaryIds = new Set(diary.map(m => m.id));
  return {
    checkIns: nonNeg(input.checkIns ?? 0),
    counselors: input.conversations.length,
    questions: input.conversations.reduce((n, c) => n + (c.messages ?? []).filter(m => m.role === 'user').length, 0),
    diaryEntries: diary.length,
    // Only a reading the counsellor actually wrote, for an entry that still exists.
    reflections: Object.entries(input.reflections).filter(([id, r]) => r.status === 'ready' && diaryIds.has(id)).length,
    memories: input.memories.length - diary.length,
    stations: Object.values(input.heard).reduce((n, list) => n + list.length, 0),
    journeys: input.journeysFinished,
  };
}
