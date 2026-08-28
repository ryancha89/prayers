/** Counselor domain types — spec §8, §12. Keep content data-driven (rule §52-9/10). */

export type CounselorCategory =
  | 'saju'
  | 'love'
  | 'career'
  | 'wealth'
  | 'life'
  | 'tarot';

export interface CounselorPreview {
  id: string;
  label: string;
  /** Short pre-rendered MP4/WebM clip. Optional for MVP (placeholder). */
  videoUrl?: string;
  thumbnailUrl?: string;
}

export interface CounselorSummary {
  id: string;

  name: string;
  title: string;
  hook: string;

  thumbnailUrl?: string;
  heroUrl?: string;
  /** Placeholder accent used when no artwork asset is bundled (MVP). */
  accent: string;

  tags: string[];

  category: CounselorCategory;

  popularity?: number;
  conversationCount?: number;

  isNew?: boolean;
  isTrending?: boolean;

  /** Detail-screen content. */
  personality: string[]; // e.g. ["Calm", "Insightful", "Warm"]
  specialties: string[]; // e.g. ["Love", "Career", "Wealth", "Life"]
  about: string;
  previews: CounselorPreview[];

  /** Unity mapping — which 3D character/room to load (spec §40). */
  characterId: string;
  roomId: string;
}
