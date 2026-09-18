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
  // A counselor you can ENTER must have art. One that is still coming soon may not: the card falls
  // back to the accent block by design, and the alternative — a Blender viewport grab with the
  // gizmo lines still in it — is worse than a clean placeholder on a locked card.
  //
  // Deliberately not a blanket exemption for coming-soon cards: the four older ones DO have art and
  // must keep it, so the list below is what is genuinely outstanding from the art side. Shrink it
  // as art lands; it must never grow for a counselor that has become playable.
  // Empty since 16-09: Theo's art was cut from his own character sheet (Tools/gen_theo_sheet_art.py),
  // which is the artefact his model will be built from — so it cannot promise a different person.
  const AWAITING_ART: string[] = [];

  it('gives every counselor in the roster a bundled portrait', () => {
    const missing = localizeCounselors('en')
      .filter(c => !c.cardImage)
      .map(c => c.id);
    expect(missing).toEqual(AWAITING_ART);
  });

  it('never leaves a counselor you can actually enter without one', () => {
    const missing = localizeCounselors('en')
      .filter(c => !c.comingSoon && (!c.cardImage || !c.avatarImage))
      .map(c => c.id);
    expect(missing).toEqual([]);
  });

  it('gives every counselor a square avatar too', () => {
    // The conversation row uses this one; a counselor with a card but no avatar shows a letter
    // there and a face everywhere else, which reads as two different people.
    const missing = localizeCounselors('en')
      .filter(c => !c.avatarImage)
      .map(c => c.id);
    expect(missing).toEqual(AWAITING_ART);
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
    // "Has a model" is not the same as "can be entered" since 15-09: the meditation guide's room
    // is a 2D screen, so she is enterable with no model, no clips and therefore no strip.
    const withModel = localizeCounselors('en')
      .filter(c => !c.comingSoon && c.category !== 'meditation')
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
    // Theo joined on 2026-09-16 with m_char_004 and ConsultationSolo03.
    expect(enterable.map(c => c.id).sort()).toEqual(['breathe', 'jiho', 'theo', 'yuna', 'yunjung']);
    enterable.forEach(c => expect(c.cardImage).toBeDefined());
  });
});
