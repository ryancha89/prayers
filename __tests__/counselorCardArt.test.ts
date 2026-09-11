import { localizeCounselors } from '../src/features/counselors/data/mockCounselors';
import {
  COUNSELOR_AVATAR_ART,
  COUNSELOR_CARD_ART,
} from '../src/features/counselors/assets';
import { PREVIEW_STRIPS } from '../src/features/counselors/assets/previews';

/**
 * The card art is looked up by counselor id through a hand-written require map, so the two lists
 * drift apart silently: adding a counselor without adding its line leaves a card that renders a
 * letter on a colour block, and nothing fails. These pin the pairing in both directions.
 */
describe('counselor card art', () => {
  it('gives every counselor in the roster a bundled portrait', () => {
    const missing = localizeCounselors('en')
      .filter(c => !c.cardImage)
      .map(c => c.id);
    expect(missing).toEqual([]);
  });

  it('gives every counselor a square avatar too', () => {
    // The conversation row uses this one; a counselor with a card but no avatar shows a letter
    // there and a face everywhere else, which reads as two different people.
    const missing = localizeCounselors('en')
      .filter(c => !c.avatarImage)
      .map(c => c.id);
    expect(missing).toEqual([]);
  });

  it('has no art for a counselor that is not in the roster', () => {
    const ids = new Set(localizeCounselors('en').map(c => c.id));
    const orphans = [
      ...Object.keys(COUNSELOR_CARD_ART),
      ...Object.keys(COUNSELOR_AVATAR_ART),
    ].filter(id => !ids.has(id));
    expect(orphans).toEqual([]);
  });

  it('gives an action preview to every counselor that has a 3D model, and to no other', () => {
    // The strips are rendered from a real model playing a real clip. A counselor with no model
    // cannot have one, and inventing it would promise a character that does not exist — the same
    // failure the card art was redrawn to fix.
    const withModel = localizeCounselors('en')
      .filter(c => !c.comingSoon)
      .map(c => c.id)
      .sort();
    expect(Object.keys(PREVIEW_STRIPS).sort()).toEqual(withModel);
  });

  it('only names preview actions that have a rendered clip', () => {
    localizeCounselors('en')
      .filter(c => !c.comingSoon)
      .forEach(c => {
        const missing = c.previews.filter(p => !p.strip).map(p => p.id);
        expect(missing).toEqual([]);
      });
  });

  it('serves the counselors you can actually enter', () => {
    // These are the only ones with a 3D model, so theirs are the cards a player acts on. Yunjung
    // joined them on 2026-09-11 with f_char_003 and a room of her own (ConsultationSolo02) — this
    // list and Unity's RNBridge.PersonaFor have to gain a counselor in the same change, or the app
    // offers a name the engine cannot seat.
    const enterable = localizeCounselors('en').filter(c => !c.comingSoon);
    expect(enterable.map(c => c.id).sort()).toEqual(['jiho', 'yuna', 'yunjung']);
    enterable.forEach(c => expect(c.cardImage).toBeDefined());
  });
});
