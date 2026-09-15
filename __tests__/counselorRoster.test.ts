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
import { localizeCounselors } from '../src/features/counselors/data/mockCounselors';
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

  it('puts the counselors you can enter first', () => {
    const order = localizeCounselors('en');
    const firstSoon = order.findIndex(c => c.comingSoon);
    expect(order.slice(0, firstSoon).every(c => !c.comingSoon)).toBe(true);
    expect(order.slice(firstSoon).every(c => c.comingSoon)).toBe(true);
  });

  it('opens on the generalist', () => {
    expect(ids()[0]).toBe('yuna');
  });

  it('puts a seeded counselor ahead of a placeholder that is only a name', () => {
    const order = ids();
    // theo has a registry row (persona, tone decided; art in progress).
    // seoyeon/mina/harin/doyun have none.
    expect(order.indexOf('theo')).toBeLessThan(order.indexOf('seoyeon'));
    expect(order.indexOf('theo')).toBeLessThan(order.indexOf('mina'));
  });
});
