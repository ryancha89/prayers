/**
 * The Journey engine's data — a season reading told as a train ride with a counsellor.
 *
 * Nothing here is 2027-specific. A Journey is a list of Chapters (stations); each chapter has a
 * backdrop, a narration and cards that rise over it at a point in the narration. "2027 신년운세
 * 여행" is the first Journey; 10년 대운·연애운·직업운·재물운·인생 journeys are the same shape with
 * other data (data/journeys.ts) and another server reading (Prayers::JourneyService::JOURNEYS).
 */
import type { TranslationKey } from '../../shared/i18n';

/** What the train window shows. `scene` is a drawn, moving landscape (components/Scenery); `image`
 *  and `video` are media files — video falls back to its poster until a video player is linked. */
export type BackgroundMedia =
  | { type: 'scene'; scene: SceneKey }
  | { type: 'image'; source: number | { uri: string } }
  | { type: 'video'; source: number | { uri: string }; poster?: SceneKey };

export type SceneKey =
  | 'station'
  | 'dawnCity'
  | 'nightCity'
  | 'springSunset'
  | 'forestLake'
  | 'sunrise'
  | 'arrival'
  /** The final station: the train pulling in at the end of the line (Unity adds its own). */
  | 'ending';

/** Where a chapter's audio layers come from. Voice is the narration (TTS); bgm and ambient are
 *  bundled files, optional — `null` is silence on that layer. */
export interface AudioLayers {
  bgm: string | null;
  ambient: string | null;
}

export interface FortuneCard {
  /** Where in the chapter's narration the card rises, 0-1 of its length. */
  at: number;
  title: string;
  /** Month numbers (1-12) the card is about. */
  months: number[];
  description: string;
  /** 1-5. */
  stars: number;
  saveable: boolean;
}

/** One-shot effects the cabin plays over the table (Unity JourneyMomentPlan.Cues). `reveal` is the
 *  unlock burst Unity plays by itself on locked → premium; RN sends the others. */
export type MomentCue = 'reveal' | 'sparkle' | 'stars' | 'coins' | 'hearts' | 'leaves'
  // The explanation effects (storyboard 02-10): played while the counsellor explains a station.
  | 'hologram' | 'orb' | 'shootingStar' | 'cityLights' | 'petals' | 'snow' | 'maple' | 'fireflies';

/** The cabin's soft continuous effect for a station (JOURNEY_STATE `ambient`). */
export type CabinAmbient = '' | 'intro' | 'career' | 'wealth' | 'love' | 'health' | 'overall' | 'monthly';

/**
 * How the app presents a paid moment (Jeongmin 01-10). The moments themselves — where they are,
 * whether they are paid for, what they say — come from the server, as a chapter's `parts`; the app
 * only adds the cabin effect and a fallback offer for a server that sends no teaser.
 */
export interface MomentPresentation {
  /** The effect a beat after the unlock. Default `stars`. */
  cue?: MomentCue;
  /** Shown (and voiced) at the lock when the server sent no teaser. */
  teaser?: TranslationKey;
}

/**
 * What a station asks of the player besides listening (the 2027 mockup, 01-10):
 * - `pickCard`: before the reading, pick one of three face-down cards; it turns over to the
 *   server's chapter `card`.
 * - `branch`: after the free part, choose which of the two paid parts to hear first.
 * - `quarters`: after the free part, a list of the paid parts (the months by quarter) to open in
 *   any order.
 * - `ending`: the last station; its part ends on "finish the journey".
 */
export type StationInteraction = 'pickCard' | 'branch' | 'quarters' | 'ending';

export interface Chapter {
  /** Matches the server's chapter id. */
  id: string;
  order: number;
  /** Station name on the rail. */
  title: TranslationKey;
  subtitle?: TranslationKey;
  /** 1… for a station with a title card on arrival ("1. 사회운 (Social & Career)"); none = no card. */
  number?: number;
  /** The title card's heading and one-line description. */
  heading?: TranslationKey;
  blurb?: TranslationKey;
  interaction?: StationInteraction;
  /** The question over the two buttons of a `branch` station. */
  branchPrompt?: TranslationKey;
  /** Not drawn on the rail (the final station is the end of the line, not a stop on it). */
  hideOnRail?: boolean;
  background: BackgroundMedia;
  /** Filled from the server when the journey is boarded. */
  narrationText?: string;
  narrationAudio?: string;
  /** Seconds; known once the audio loads. */
  duration?: number;
  fortuneCards?: FortuneCard[];
}

export interface JourneyCounselor {
  /** Card id in the roster (mockCounselors). */
  id: string;
  /** The line under their name on the choose-your-companion screen. */
  pitch: TranslationKey;
}

export interface Journey {
  id: string;
  title: TranslationKey;
  eyebrow: TranslationKey;
  year: number;
  thumbnail: BackgroundMedia;
  counselors: JourneyCounselor[];
  chapters: Chapter[];
  audio: AudioLayers;
  /** Presentation of the paid moments, by server moment id (`career#0`). */
  moments?: Record<string, MomentPresentation>;
  /** For a moment id not in `moments`. */
  momentDefault?: MomentPresentation;
  /** Sold as a whole through the boarding pass (JourneyPassScreen). False/absent: free to board,
   *  paid by the moment in coins. */
  pass?: boolean;
}

/** One of the year's twelve months — calendar January to December of the journey's year (server v2;
 *  before it, the months ran 입춘 to 입춘). */
export interface JourneyMonth {
  month: number;
  /** The month pillar, two characters. */
  ganji: string;
  headline: string;
  /** 1-5. */
  stars: number;
}

export type JourneyCard = Omit<FortuneCard, 'saveable'>;

/** A topic station's free card — what the picked card turns over to ("새로운 도약"). */
export interface StationCard {
  title: string;
  line: string;
}

/**
 * One stretch of a chapter's narration, told and voiced on its own. Part 0 is always free; a later
 * part is a paid moment (`momentId` "career#0"). Locked, it carries only its `teaser` — the server
 * sends no text and no cards for it, so nothing on the phone can play what was not paid for.
 */
export interface JourneyPart {
  momentId: string | null;
  unlocked: boolean;
  /** A paid part's short name, in the reading's language — the branch button, the quarter row
   *  ("1~3월"), the collection. Null on a free part. */
  label: string | null;
  /** The counsellor's offer at the lock, in the reading's language. Null on a free part. */
  teaser: string | null;
  /** Null while locked. */
  text: string | null;
  /** `at` is 0-1 within THIS part's text. */
  cards: JourneyCard[];
}

export interface JourneySummary {
  /** Empty until every moment is unlocked (the server holds them back). */
  bestMonths: number[];
  cautionMonths: number[];
  keywords: string[];
  /** Only the months of unlocked quarters. Calendar months of the journey's year. */
  months: JourneyMonth[];
}

/** The reading the server returned for one journey + counsellor. */
export interface JourneyContent {
  journey: string;
  year: number;
  counselor: string;
  /** `narration`/`cards` are the server's flattened view for old builds; the player reads `parts`.
   *  A reading saved before the paid moments has no `parts` (player/journeyPlayer partsOf). */
  chapters: { id: string; narration: string; cards: JourneyCard[]; parts?: JourneyPart[]; card?: StationCard | null }[];
  summary: JourneySummary;
  /** Coins one moment costs, as the server prices it. Absent from a server without moments. */
  momentPrice?: number;
}
