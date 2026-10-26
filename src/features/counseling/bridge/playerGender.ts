import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { effectiveCharacter } from '../../character/characters';

/**
 * Which body the player walks in Unity (World, My Room, the cafe, the walk-in rooms; Unity's
 * PlayerBody), sent as `playerGender` + `playerCharacter` on every *_INIT.
 *
 * The profile's GENDER decides the body's gender (the picker only offers that gender's characters);
 * the stored pick only stands in while the profile has no gender yet. Undefined when neither exists:
 * JSON drops the field and Unity walks its default body (Theo).
 */
export const playerGender = (): 'male' | 'female' | undefined => {
  const s = useSubjectsStore.getState();
  return s.self.gender ?? effectiveCharacter(undefined, s.playerCharacter)?.gender;
};

/** The picked character's id (PlayerBodyCatalog.characters in Unity), resolved against the gender. */
export const playerCharacter = (): string | undefined => {
  const s = useSubjectsStore.getState();
  return effectiveCharacter(s.self.gender, s.playerCharacter)?.id;
};
