import registry from './counselorRegistry.json';

/**
 * The one list of who the counselors are — GENERATED, not written here.
 *
 * Source: `Saju/Assets/Editor/CounselorCatalogBuilder.cs` → menu *Saju World ▸ Prayers ▸ Build
 * Counselor Catalog*, which writes `counselorRegistry.json` into this folder and the same content
 * into `Saju/Docs/counselor_cards.json`. Edit the seeds there and re-run the menu; hand-editing the
 * JSON is overwritten on the next run.
 *
 * WHY IT EXISTS. This app kept its own hand-written answers to four questions — which counselors
 * are playable (`BUILT_CHARACTER_IDS`), which tone each one answers in (`TONE_BY_CHARACTER`), which
 * persona a characterId maps to (Unity's `RNBridge.PersonaFor`), and which room a persona opens
 * (Unity's `ConsultationRooms`). Nothing compared them, and on 14-09 they had genuinely drifted:
 * the Unity catalogue had NO CARD AT ALL for Jiho, whose room had been working for weeks.
 *
 * The four names are not interchangeable and that is exactly why they drift:
 *   `id`           sunyeo      the card
 *   `characterId`  yuna_01     what this app sends in SESSION_INIT
 *   `personaId`    wood        what the room stages, and what picks the scene
 *   `tone`         sunyeo      what the SERVER answers in — `wood`'s tone is `sunyeo`, not `wood`
 */
export interface CounselorRegistryEntry {
  id: string;
  characterId: string;
  personaId: string;
  tone: string;
  /** The scene this counselor's room lives in. Empty = the default room. */
  room: string;
  specialty: string;
  defaultTopic: string;
  accent: string;
  available: boolean;
  tagline_vi: string;
}

export const counselorRegistry: CounselorRegistryEntry[] = registry.cards;

/** Only an entry with a body to stage can hold a consultation. `available` is the generator's own
 *  word for "has a model and clips"; a characterId is what this app needs to name it. */
const playable = counselorRegistry.filter(c => c.available && c.characterId.length > 0);

export const builtCharacterIds: ReadonlySet<string> = new Set(playable.map(c => c.characterId));

/** characterId → the tone the server answers in. Derived, so it cannot disagree with the roster. */
export const toneByCharacter: Readonly<Record<string, string>> = Object.fromEntries(
  playable.filter(c => c.tone.length > 0).map(c => [c.characterId, c.tone]),
);

export const registryFor = (characterId?: string): CounselorRegistryEntry | undefined =>
  characterId ? counselorRegistry.find(c => c.characterId === characterId) : undefined;
