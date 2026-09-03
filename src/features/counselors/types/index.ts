/** Counselor domain types — spec §8, §12. Keep content data-driven (rule §52-9/10). */
import { ImageSourcePropType } from 'react-native';

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
  /**
   * Vertical sprite strip of this action, rendered from the counselor's real 3D model and its real
   * animation clip. Undefined when the counselor has no model — see `assets/previews`.
   */
  strip?: ImageSourcePropType;
}

export interface CounselorSummary {
  id: string;

  name: string;
  title: string;
  hook: string;

  thumbnailUrl?: string;
  heroUrl?: string;
  /**
   * Bundled card portrait. Set for every counselor that has art in
   * `../assets` (see COUNSELOR_CARD_ART); undefined falls back to `accent`.
   *
   * Separate from `thumbnailUrl` on purpose: that one is a remote URI for when a real API serves
   * the roster, and the two need different plumbing — `require`d assets are numbers under Metro,
   * not strings, so they cannot share a field without lying about its type.
   */
  cardImage?: ImageSourcePropType;
  /**
   * Square head crop, for the places a counselor appears as a small circle (the conversation row).
   * Its own cut rather than `cardImage` scaled down, because `cover` on a square would centre the
   * tall portrait on the chest.
   */
  avatarImage?: ImageSourcePropType;
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

  /**
   * True when this counselor has no 3D model yet, so a consultation cannot actually be held with
   * them. Listed and readable; not enterable.
   *
   * ConsultationSolo contains two sages — `wood` (f_char_002) and `dosa` (m_char_003). The other
   * four characterIds map to personas that were never built. Before this flag existed, choosing one
   * of them opened a room that could not seat anybody: the entry retried for its whole timeout and
   * ended the session with `auto_seat_failed`, which the player saw as the room loading and then
   * throwing them out. Four of six counselors did that.
   *
   * Unity now substitutes a same-gender sage rather than ejecting anyone, so the failure is no
   * longer fatal — but three different names wearing the same face is its own kind of wrong. Saying
   * "coming soon" is the honest version of what is true.
   */
  comingSoon?: boolean;
}
