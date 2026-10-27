import type { PlayerGender } from '../subjects/store/subjectsStore';

/**
 * The characters a player can walk as — one list read by the picker, My Info and the bridge.
 *
 * The id is the wire value (`playerCharacter` on every *_INIT) and must match an entry in Unity's
 * Resources/PlayerBodyCatalog.asset (`characters`). The FIRST entry of each gender is that gender's
 * default: what a new profile gets, and what Unity mounts when no id matches.
 *
 * Xuân's characters (26-10, textured, Drive 1DXqs0SSg8u7eYRcx9rvUYrbT-DwR_tLz). Since 27-10 they are
 * auto-rigged (Unity XuanRigPlayer: xb_m01 on Theo's skeleton, xb_f01 on Go Yunjung's) and are what
 * the player walks everywhere and sees on the creator; they have no ARKit shapes. Her ReFemale
 * (hanbok) is NOT here: it is Yuna's remake, so a player could have picked a counsellor's body (26-10).
 */
export interface PlayerCharacterDef {
  id: string;
  gender: PlayerGender;
  art: number;
  /** 1-based among its gender, for the card label ("Female 2"). */
  n: number;
}

export const CHARACTERS: PlayerCharacterDef[] = [
  { id: 'xb_f01', gender: 'female', n: 1, art: require('./assets/basic_female.png') },
  { id: 'xb_m01', gender: 'male', n: 1, art: require('./assets/basic_male.png') },
];

export const charactersFor = (gender?: PlayerGender): PlayerCharacterDef[] =>
  gender ? CHARACTERS.filter(c => c.gender === gender) : CHARACTERS;

export const characterById = (id?: string): PlayerCharacterDef | undefined =>
  id ? CHARACTERS.find(c => c.id === id) : undefined;

export const defaultCharacterFor = (gender: PlayerGender): PlayerCharacterDef =>
  CHARACTERS.find(c => c.gender === gender)!;

/**
 * The character actually walked: the stored pick when it belongs to the profile's gender, else
 * that gender's default; with no gender on the profile, the stored pick as-is. A pick from before
 * 26-10 was a bare 'male'/'female' and matches no id — it falls to the default, which is the same
 * body it meant.
 */
export const effectiveCharacter = (
  gender: PlayerGender | undefined,
  stored: string | undefined,
): PlayerCharacterDef | undefined => {
  const pick = characterById(stored);
  if (!gender) return pick;
  return pick && pick.gender === gender ? pick : defaultCharacterFor(gender);
};
