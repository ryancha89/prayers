import type { ImageSourcePropType } from 'react-native';
import { COUNSELOR_AVATAR_ART } from '../../counselors/assets';
import { counselorRegistry } from '../../counselors/data/registry';

/** The tarot card's accent in the registry, for a reader nobody has drawn yet. */
const TAROT_ACCENT = '#7B5EA7';

/**
 * A tarot reader's face, from the server's `portrait_key` — the key Unity loads as
 * Resources/CounselorPortraits/<key>, which is a registry card id (`tarot`, `sunyeo`, `theo`, …).
 *
 * The app's own art is keyed differently (by the counselor's first name, `yuna`), so the key goes
 * through the registry: card id → characterId (`yuna_01`) → the art's key (`yuna`). A key the art
 * already uses is taken as it is. Neither = the registry's accent with the reader's initial, the same
 * fallback every counselor card has.
 */
export function readerPortrait(key: string): { image?: ImageSourcePropType; accent: string } {
  const entry = counselorRegistry.find(c => c.id === key);
  const artKey = entry?.characterId ? entry.characterId.replace(/_\d+$/, '') : key;
  return { image: COUNSELOR_AVATAR_ART[artKey] ?? COUNSELOR_AVATAR_ART[key], accent: entry?.accent ?? TAROT_ACCENT };
}
