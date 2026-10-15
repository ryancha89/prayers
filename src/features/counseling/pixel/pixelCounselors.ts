/**
 * Counselors who live in the app rather than in Unity.
 *
 * The generated registry (`counselorRegistry.json`) is the Unity catalogue's list: a row there
 * means a 3D body, a persona and a scene. A pixel counselor has none of those — his room is drawn
 * by `PixelCatStage` and his lines are paced by the mock stage — so he is listed here instead of
 * being hand-added to a file the next catalogue run would overwrite.
 *
 * `tone` is the server persona he answers in (`Prayers::Personas` lens + `TikiMode::TONE_LINES`).
 * ⚠️ IT MUST BE HIS ALONE. The server separates counselors' memories by tone — Recall finds "last
 * time" by tone, and the prompt's last-visit summary is picked by tone — so a borrowed tone would
 * let him bring up what the player told the counselor he borrowed it from, and the other way round.
 */
export interface PixelCounselor {
  characterId: string;
  tone: string;
  defaultTopic: string;
}

export const PIXEL_COUNSELORS: Readonly<Record<string, PixelCounselor>> = {
  nabi_01: { characterId: 'nabi_01', tone: 'nabi', defaultTopic: '' },
};

export const isPixelCounselor = (characterId?: string): boolean =>
  !!characterId && characterId in PIXEL_COUNSELORS;
