import { defaultTopicFor, groupTopicsFor } from '../src/features/counseling/topicsForCounselor';
import { counselorRegistry } from '../src/features/counselors/data/registry';

/**
 * The picker used to ask every counselor the same six questions — including the career specialist
 * and the relationship one, whose whole card says they read one thing best.
 *
 * What is pinned here is the judgement, not the layout: a SPECIALIST IS OFFERED ONLY HER GROUND
 * (changed 16-09; it used to lead with her ground and keep the rest below). The generalist is still
 * flat, and the one escape hatch — her ground missing from the server's list — still shows whatever
 * came back, because an empty picker has no way forward.
 *
 * ⚠️ This is the opening MENU only. The room's free-chat loop still answers a question about
 * anything, so a test that reads this as "she refuses other subjects" is reading it wrong.
 */
const SIX = [
  { key: 'love' },
  { key: 'wealth' },
  { key: 'career' },
  { key: 'relationships' },
  { key: 'health' },
  { key: 'life' },
];

/**
 * 26-09: nobody owns a subject. "각 캐릭터별 애정운 직업운 담당 이런거 없이 모두 다 볼 수
 * 있어야함" — every counsellor you can enter offers every topic and opens on none in particular;
 * the player's question picks it. What is pinned is that this holds for EVERY playable card, so a
 * seed that grows a specialty again cannot quietly narrow one of them.
 */
const PLAYABLE = counselorRegistry.filter(c => c.available && !c.silent).map(c => c.characterId);

describe('topics for a counselor', () => {
  it('has the counsellors to check', () => {
    expect(PLAYABLE).toEqual(expect.arrayContaining(['yuna_01', 'yunjung_01', 'jiho_01', 'theo_01']));
  });

  it.each(PLAYABLE)('offers %s every topic, flat, with no "her ground" heading', id => {
    const groups = groupTopicsFor(id, SIX);
    expect(groups).toHaveLength(1);
    expect(groups[0].headingKey).toBeNull();
    expect(groups[0].items).toEqual(SIX);
  });

  it('falls flat for an unknown counselor rather than guessing', () => {
    expect(groupTopicsFor(undefined, SIX)[0].headingKey).toBeNull();
    expect(groupTopicsFor('nobody_99', SIX)[0].headingKey).toBeNull();
  });

  it('never narrows even a counsellor the roster still calls a specialist', () => {
    // Theo was `love` and 고윤정 `career`; both are general now, but the rule must not depend on it.
    const all = groupTopicsFor('theo_01', SIX).flatMap(g => g.items.map(i => i.key));
    expect(all).toContain('career');
    expect(all).toContain('love');
  });
});

/**
 * Since 18-09 nobody picks a topic — the subject screen sets one and walks into the room. That
 * makes this function the only thing standing between a session and an EMPTY topic, which is not a
 * cosmetic default: the lines that name the subject are recorded per topic with no bare fallback,
 * so an empty one drops those lines into live synthesis.
 */
describe('the topic when nobody picks one', () => {
  it.each(PLAYABLE)('opens %s on life — the topic that narrows nobody', id => {
    expect(defaultTopicFor(id)).toBe('life');
  });

  it('never returns empty, whoever is asked', () => {
    for (const id of [undefined, 'nobody_99', 'yuna_01', 'yunjung_01', 'theo_01']) {
      expect(defaultTopicFor(id)).toBeTruthy();
    }
  });
});
