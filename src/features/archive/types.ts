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
      options: ['good', 'ok', 'neutral', 'down', 'angry'],
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
  ],
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

/** The emoji each category and choice wears. Not localized: they are the pictures, not the words. */
export const CATEGORY_ICON: Record<ArchiveCategory, string> = {
  profile: '🪪',
  interest: '🎯',
  relationship: '👥',
  career: '💼',
  story: '🗺️',
  diary: '📔',
  goal: '🏁',
  possession: '🎁',
  like: '❤️',
  dislike: '💔',
  manual: '📖',
};

export const MOOD_ICON: Record<string, string> = {
  good: '😄',
  ok: '🙂',
  neutral: '😐',
  down: '😔',
  angry: '😡',
};

export const KIND_ICON: Record<string, string> = {
  car: '🚗',
  device: '💻',
  fashion: '👕',
  hobby: '🎸',
  book: '📚',
  home: '🏠',
  other: '📦',
};
