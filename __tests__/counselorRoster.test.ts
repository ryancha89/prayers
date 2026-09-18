/**
 * One roster, two repos — the test that was missing when they drifted.
 *
 * On 14-09 the Unity catalogue had NO CARD for Jiho while this app had been offering him for weeks,
 * and the file the Unity side generates called itself "shared" while this app read a hand-written
 * list of its own. Nothing compared them, so nothing said so. These assertions are that comparison.
 *
 * The registry is GENERATED (`Saju/Assets/Editor/CounselorCatalogBuilder.cs` → menu *Build Counselor
 * Catalog*). When one of these fails, the answer is almost always to fix the seeds there and re-run
 * the menu — not to edit the JSON, which the next run overwrites.
 */
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));

import {
  builtCharacterIds,
  counselorRegistry,
  registryFor,
  toneByCharacter,
} from '../src/features/counselors/data/registry';
import {
  getLocalizedCounselor,
  localizeCounselors,
} from '../src/features/counselors/data/mockCounselors';
import { groupTopicsFor } from '../src/features/counseling/topicsForCounselor';
import { toneForCharacter } from '../src/features/counseling/api/counselorAI';

describe('the generated registry', () => {
  it('gives every playable counselor the four names the two sides need', () => {
    // SILENT counsellors are excluded on purpose, and the flag is what excludes them rather than a
    // list of ids. The meditation guide has no characterId spine to fill: nothing stages a body,
    // nothing answers in a voice. Her room is RN's own breathing screen. The moment a silent card
    // gains a tone, this test is the one that should start complaining again.
    const playable = counselorRegistry.filter(c => c.available && !c.silent);
    expect(playable.length).toBeGreaterThan(0);
    // A playable card with no characterId cannot be opened from the app at all: SESSION_INIT is
    // keyed on it. A missing tone means the server answers in its default voice, which is a
    // different counselor. Collected rather than asserted one by one so a failure names every
    // offender at once instead of stopping at the first.
    const incomplete = playable
      .filter(c => !c.characterId || !c.tone || !c.personaId)
      .map(c => `${c.id}: characterId='${c.characterId}' tone='${c.tone}' persona='${c.personaId}'`);
    expect(incomplete).toEqual([]);
  });

  it('never lists the same character or persona twice', () => {
    const ids = counselorRegistry.map(c => c.characterId).filter(Boolean);
    expect(new Set(ids).size).toBe(ids.length);
    // Empty personas are the silent ones — two of those are not a clash, they are two people with
    // nothing to say.
    const personas = counselorRegistry.map(c => c.personaId).filter(Boolean);
    expect(new Set(personas).size).toBe(personas.length);
  });

  it('keeps a silent counselor genuinely silent', () => {
    const silent = counselorRegistry.filter(c => c.silent);
    expect(silent.length).toBeGreaterThan(0);
    // A tone is a voice the SERVER answers in; a persona is a body Unity stages. A silent card
    // carrying either means somebody wired her into the consultation path by accident.
    silent.forEach(c => {
      expect(c.tone).toBe('');
      expect(c.personaId).toBe('');
      expect(toneForCharacter(c.characterId)).toBeUndefined();
    });
  });
});

describe('the app roster agrees with it', () => {
  it('offers a card for every counselor the registry says is playable', () => {
    const offered = new Set(localizeCounselors('en').map(c => c.characterId));
    // This is the one that would have caught 14-09 from the other direction.
    const missing = [...builtCharacterIds].filter(id => !offered.has(id));
    expect(missing).toEqual([]);
  });

  it('marks a counselor available only when the registry does', () => {
    const disagreements = localizeCounselors('en')
      .filter(c => {
        const entry = registryFor(c.characterId);
        return !c.comingSoon !== (entry != null && entry.available);
      })
      .map(c => `${c.id} (${c.characterId}): app says ${c.comingSoon ? 'coming soon' : 'offered'}`);
    expect(disagreements).toEqual([]);
  });

  it('asks the server for the tone the registry names, not the persona', () => {
    // `wood` answers in `sunyeo`. Deriving tone from personaId would be a one-line "simplification"
    // that changes whose voice the counselor speaks in, and nothing would error.
    expect(toneForCharacter('yuna_01')).toBe('sunyeo');
    expect(registryFor('yuna_01')?.personaId).toBe('wood');

    for (const [characterId, tone] of Object.entries(toneByCharacter)) {
      expect(toneForCharacter(characterId)).toBe(tone);
    }
  });

  it('has no tone for a counselor who cannot be consulted', () => {
    expect(toneForCharacter('seoyeon_01')).toBeUndefined();
    expect(toneForCharacter(undefined)).toBeUndefined();
  });
});

/* ── The order the feed reads in ──────────────────────────────────────────── */

describe('card order', () => {
  const ids = () => localizeCounselors('en').map(c => c.id);

  // DECIDED 18-09: the first release serves only counselors who can be consulted. The ordering the
  // roster still carries — real, then seeded, then placeholder — is what the feed reverts to the day
  // SHOW_UNRELEASED goes back on, and the two tests below still pin it through `RAW`.
  it('serves nobody the player cannot enter', () => {
    expect(localizeCounselors('en').filter(c => c.comingSoon)).toEqual([]);
  });

  it('still resolves an unreleased counselor by id, so an old link does not vanish', () => {
    // A favourite or a past conversation may name one. Hiding them from the FEED is not the same as
    // deleting them, and a card that renders nothing is the failure this avoids.
    expect(getLocalizedCounselor('mina', 'en')?.comingSoon).toBe(true);
  });

  it('opens on the generalist', () => {
    expect(ids()[0]).toBe('yuna');
  });

  it('opens on the generalist and ends on the guide, with nobody unreleased between', () => {
    // The three-band order (enterable, seeded, placeholder) is unobservable while the last two bands
    // are hidden; what is still worth pinning is that the visible feed is exactly the enterable set
    // and that it leads with the counselor who takes any question.
    const order = ids();
    expect(order[0]).toBe('yuna');
    expect(order).toEqual(expect.arrayContaining(['yuna', 'jiho', 'yunjung', 'theo', 'breathe']));
    expect(order).toHaveLength(5);
  });
});

/**
 * WHAT A CARD PROMISES has to be what the room delivers. Three grids drifted apart before anything
 * compared them, and all three are cheap to pin:
 *
 *  - the preview buttons promise a POSE (16-09: Theo's promised a tarot card flip);
 *  - `specialties` promises a SUBJECT, while `groupTopicsFor` is what the picker actually offers;
 *  - the Vietnamese copy promises a REGISTER, which in this language is carried by the pronouns.
 */
describe('what a counselor card promises', () => {
  it('never promises a card flip from a counsellor whose reading is the saju walk', () => {
    // Every counsellor with a card today goes through the same P06-P10 saju reading, and none of it
    // draws a card. The "Revealing" pose came in with Theo's sheet, which was drawn with tarot
    // flavour. If the roster's tarot specialist is ever built, this assertion is the one to revisit
    // — deliberately, and with a strip behind it.
    for (const c of localizeCounselors('en')) {
      expect(c.previews.map(p => p.id)).not.toContain(`${c.id}_reveal`);
    }
  });

  it('advertises the career reader exactly the subjects her picker offers', () => {
    const options = [
      { key: 'career' }, { key: 'wealth' }, { key: 'love' },
      { key: 'relationships' }, { key: 'life' }, { key: 'health' },
    ];
    const ground = groupTopicsFor('yunjung_01', options)[0].items.map(o => o.key);
    expect(ground).toEqual(['career', 'wealth']);

    // The card's own word for each of those keys. `wealth` is "Money" on a card and nothing else.
    const advertised = getLocalizedCounselor('yunjung', 'en')!.specialties.map(s => s.toLowerCase());
    expect(advertised).toContain('career');
    expect(advertised).toContain('money');
    // The three it used to claim it read. A menu of two under a card offering "Life" is the
    // specialty made decorative.
    expect(advertised).not.toContain('life');
  });

  it('keeps the career reader on her own pronouns in Vietnamese', () => {
    // vi has no neutral "you": "ta / con" is grandmaster-to-disciple and "tôi / bạn" is one adult
    // to another. Her ROOM speaks the second (flow/voice.ts), so her card cannot speak the first.
    const hers = getLocalizedCounselor('yunjung', 'vi')!;
    expect(hers.hook).toMatch(/\bTôi\b|\btôi\b/);
    expect(hers.hook).not.toMatch(/\bTa\b|\bcon\b/);

    // The control: the shared register is not a bug, and this test must fail if someone sweeps it.
    expect(getLocalizedCounselor('jiho', 'vi')!.hook).toMatch(/\bcon\b/);
  });
});
