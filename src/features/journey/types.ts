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
  | 'arrival';

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

export interface Chapter {
  /** Matches the server's chapter id. */
  id: string;
  order: number;
  /** Station name on the rail. */
  title: TranslationKey;
  subtitle?: TranslationKey;
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
}

/** One of the year's twelve months (입춘 기준: 2 … 12, then 1 = January of the next year). */
export interface JourneyMonth {
  month: number;
  /** The month pillar, two characters. */
  ganji: string;
  headline: string;
  /** 1-5. */
  stars: number;
}

/** The reading the server returned for one journey + counsellor. */
export interface JourneyContent {
  journey: string;
  year: number;
  counselor: string;
  chapters: { id: string; narration: string; cards: Omit<FortuneCard, 'saveable'>[] }[];
  summary: { bestMonths: number[]; cautionMonths: number[]; keywords: string[]; months: JourneyMonth[] };
}
