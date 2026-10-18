import type { IconName } from '../../shared/components/Icon';

/**
 * 아카이브 — the player's long-term memory, kept by the player.
 *
 * One row shape for everything the tab holds (interests, people, possessions, diary, life story,
 * likes, goals, the self-manual, the basics). A single table rather than ten because the thing
 * that reads it — retrieval for a consultation turn — asks one question of every row: "is this
 * about what they just asked?" — and because "edit / delete / let the counselor use this" has to
 * work the same way on every row. The per-category structure lives in `details`, keyed by the
 * field specs in `FIELDS` below.
 */
export type ArchiveCategory =
  | 'profile'
  | 'interest'
  | 'like'
  | 'dislike'
  | 'relationship'
  | 'career'
  | 'story'
  | 'diary'
  | 'goal'
  | 'wish'
  | 'plan'
  | 'possession'
  | 'manual';

/** Display order — the tab's grid and the server's `PrayersMemory::CATEGORIES` share these ids. */
export const CATEGORIES: ArchiveCategory[] = [
  'profile',
  'interest',
  'relationship',
  'career',
  'story',
  'diary',
  'goal',
  'wish',
  'plan',
  'possession',
  'like',
  'dislike',
  'manual',
];

/** Where a memory came from. `counselor_discovery` rows are never written without the player's
 *  approval — see `ArchiveDiscovery`. */
export type MemorySource = 'manual' | 'conversation' | 'diary' | 'counselor_discovery';

export interface ArchiveMemory {
  id: string;
  category: ArchiveCategory;
  /** The headline: a person's name, an interest, a diary entry, a goal. */
  content: string;
  /** Category-specific fields, by `FIELDS[category]` key. */
  details: Record<string, string>;
  /** 1 (passing) – 3 (defining). Weighs retrieval; the player never sets it directly. */
  importance: 1 | 2 | 3;
  /** How sure the app is this is true. 1 for anything the player typed; lower for a discovery the
   *  counselor made and the player only half-confirmed. */
  confidence: number;
  source: MemorySource;
  /** The player's switch: may a counselor read this? Off means it stays in the tab and nowhere else. */
  aiEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

/** Something a counselor noticed mid-consultation, waiting for the player to say whether it is
 *  true. Kept apart from memories on purpose: an unapproved guess in the same list would be a
 *  fact the app decided on the player's behalf. */
export interface ArchiveDiscovery {
  id: string;
  category: ArchiveCategory;
  content: string;
  /** Which conversation it surfaced in. */
  sessionId?: string;
  createdAt: string;
}

export type FieldKind = 'text' | 'multiline' | 'choice' | 'year' | 'date' | 'time';

export interface FieldSpec {
  key: string;
  kind: FieldKind;
  /** i18n key of the label. */
  label: string;
  /** For `choice`: option ids; the label key is `${labelPrefix}.${id}`. */
  options?: string[];
  optionLabelPrefix?: string;
  required?: boolean;
}

/** The headline field is always `content`; these are the rest, per category. */
export const FIELDS: Record<ArchiveCategory, FieldSpec[]> = {
  profile: [
    {
      key: 'key',
      kind: 'choice',
      label: 'archive.f.value',
      options: ['bloodType', 'mbti', 'job', 'work', 'region', 'language'],
      optionLabelPrefix: 'archive.b',
      required: true,
    },
  ],
  interest: [
    {
      key: 'level',
      kind: 'choice',
      label: 'archive.f.level',
      options: ['like', 'love', 'adore'],
      optionLabelPrefix: 'archive.lv',
    },
  ],
  relationship: [
    {
      key: 'relation',
      kind: 'choice',
      label: 'archive.f.relation',
      options: ['family', 'partner', 'spouse', 'friend', 'colleague', 'business', 'acquaintance', 'other'],
      optionLabelPrefix: 'archive.rel',
      required: true,
    },
    // Typed, not picked (asked for on 2026-09-23): "2024년 봄" is an answer a year list cannot hold.
    { key: 'since', kind: 'text', label: 'archive.f.since' },
    {
      key: 'closeness',
      kind: 'choice',
      label: 'archive.f.closeness',
      options: ['low', 'mid', 'high'],
      optionLabelPrefix: 'archive.close',
    },
    // The person's own chart. With a birth date the counsellor can read THEM — "how are we
    // together" is a two-chart question, and without this it was answered from one.
    { key: 'birthDate', kind: 'date', label: 'archive.f.birthDate' },
    { key: 'birthTime', kind: 'time', label: 'archive.f.birthTime' },
    {
      key: 'gender',
      kind: 'choice',
      label: 'archive.f.gender',
      options: ['female', 'male'],
      optionLabelPrefix: 'archive.g',
    },
    { key: 'note', kind: 'multiline', label: 'archive.f.note' },
  ],
  possession: [
    {
      key: 'kind',
      kind: 'choice',
      label: 'archive.f.kind',
      options: ['car', 'device', 'fashion', 'hobby', 'book', 'home', 'other'],
      optionLabelPrefix: 'archive.kind',
    },
    { key: 'note', kind: 'multiline', label: 'archive.f.note' },
  ],
  career: [
    {
      key: 'kind',
      kind: 'choice',
      label: 'archive.f.kind',
      options: ['job', 'change', 'business', 'project'],
      optionLabelPrefix: 'archive.ck',
      required: true,
    },
    { key: 'note', kind: 'multiline', label: 'archive.f.note' },
  ],
  diary: [
    {
      key: 'mood',
      kind: 'choice',
      label: 'archive.f.mood',
      // The 07-10 scale (spec 006 Q1). Rows written on the old one (good · ok · neutral · down · angry)
      // are moved onto it by the SERVER, told apart by `moodScale: "2"` — which the store stamps on
      // every diary row it writes. Never remapped here (Principle II).
      options: ['great', 'good', 'okay', 'down', 'tired'],
      optionLabelPrefix: 'archive.mood',
      required: true,
    },
    { key: 'date', kind: 'date', label: 'archive.f.date', required: true },
  ],
  story: [
    { key: 'year', kind: 'year', label: 'archive.f.year', required: true },
    {
      key: 'kind',
      kind: 'choice',
      label: 'archive.f.kind',
      options: ['school', 'work', 'business', 'love', 'family', 'travel', 'success', 'failure', 'decision', 'other'],
      optionLabelPrefix: 'archive.sk',
    },
    { key: 'note', kind: 'multiline', label: 'archive.f.note' },
  ],
  like: [],
  dislike: [],
  goal: [
    {
      key: 'status',
      kind: 'choice',
      label: 'archive.f.status',
      options: ['plan', 'doing', 'done', 'hold'],
      optionLabelPrefix: 'archive.gs',
      required: true,
    },
    { key: 'date', kind: 'date', label: 'archive.f.date' },
  ],
  // Spec 006: the desk's two other kinds, in the goals group with `goal`. A date and the text.
  wish: [{ key: 'date', kind: 'date', label: 'archive.f.date', required: true }],
  plan: [{ key: 'date', kind: 'date', label: 'archive.f.date', required: true }],
  manual: [
    {
      key: 'section',
      kind: 'choice',
      label: 'archive.f.section',
      options: ['stress', 'focus', 'cheer', 'recipe'],
      optionLabelPrefix: 'archive.ms',
      required: true,
    },
  ],
};

/**
 * The icon each category and choice wears: an `IconName` (shared/components/Icon), drawn in the
 * app's stroke set. Not localized: they are the pictures, not the words. These used to be emoji,
 * which came out of the app's Text as "?" boxes — two for a variation-selector emoji (🗺️ 🗓️ ❤️) —
 * and ignored the tint (14-10).
 */
export const CATEGORY_ICON: Record<ArchiveCategory, IconName> = {
  profile: 'idCard',
  interest: 'target',
  relationship: 'people',
  career: 'briefcase',
  story: 'map',
  diary: 'notebook',
  goal: 'flag',
  wish: 'shootingStar',
  plan: 'calendar',
  possession: 'gift',
  like: 'heart',
  dislike: 'heartBroken',
  manual: 'book',
};

/** Each category's own colour on the Archive tab (10-17 redesign): its icon tile, its progress bar.
 *  Drawn from the app's accents and their neighbours, so the grid reads as a set, not a rainbow. */
export const CATEGORY_ACCENT: Record<ArchiveCategory, string> = {
  profile: '#A78BFA',
  interest: '#F472B6',
  relationship: '#FB923C',
  career: '#60A5FA',
  story: '#34D399',
  diary: '#E9C46A',
  goal: '#F87171',
  wish: '#C084FC',
  plan: '#22D3EE',
  possession: '#FBBF24',
  like: '#F9A8D4',
  dislike: '#94A3B8',
  manual: '#B4B4C4',
};

export const MOOD_ICON: Record<string, IconName> = {
  great: 'faceGreat',
  good: 'faceGood',
  okay: 'faceOkay',
  down: 'faceDown',
  tired: 'faceTired',
};

/** The four kinds the My Room desk writes (spec 006): diary rows and the goals group. */
export const DIARY_KINDS = ['diary', 'goal', 'wish', 'plan'] as const;
export type DiaryKind = (typeof DIARY_KINDS)[number];
export const isDiaryKind = (c: string): c is DiaryKind => (DIARY_KINDS as readonly string[]).includes(c);

export const KIND_ICON: Record<string, IconName> = {
  car: 'car',
  device: 'laptop',
  fashion: 'shirt',
  hobby: 'music',
  book: 'books',
  home: 'home',
  other: 'box',
};
