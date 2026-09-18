import { defaultTopicFor, groupTopicsFor } from '../src/features/counseling/topicsForCounselor';

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

describe('topics for a counselor', () => {
  it('offers a career counselor career and money, and nothing else', () => {
    // yunjung_01 is `career` in the generated roster.
    const groups = groupTopicsFor('yunjung_01', SIX);

    expect(groups).toHaveLength(1);
    expect(groups[0].headingKey).toBe('topic.herGround');
    expect(groups[0].items.map(i => i.key)).toEqual(['career', 'wealth']);
  });

  it('offers the relationship counselor love and relationships only', () => {
    // theo_01 is `love` in the roster — the brief, not the sheet's "career & money".
    const groups = groupTopicsFor('theo_01', SIX);

    expect(groups).toHaveLength(1);
    expect(groups[0].items.map(i => i.key)).toEqual(['love', 'relationships']);
  });

  it('drops what is not hers — and that is the point of the change', () => {
    const all = groupTopicsFor('yunjung_01', SIX).flatMap(g => g.items.map(i => i.key));
    expect(all).toEqual(['career', 'wealth']);
    expect(all).not.toContain('love');
  });

  it('leaves the generalist flat — a heading over all six says nothing', () => {
    // yuna_01 is `general`: she takes any question, and the card says so.
    const groups = groupTopicsFor('yuna_01', SIX);

    expect(groups).toHaveLength(1);
    expect(groups[0].headingKey).toBeNull();
    expect(groups[0].items).toHaveLength(6);
  });

  it('falls flat for an unknown counselor rather than guessing', () => {
    expect(groupTopicsFor(undefined, SIX)[0].headingKey).toBeNull();
    expect(groupTopicsFor('nobody_99', SIX)[0].headingKey).toBeNull();
  });

  it('does not open a section it cannot fill', () => {
    // The server's list is what it is; if her ground is missing from it, there is no heading.
    const withoutCareer = SIX.filter(t => t.key !== 'career' && t.key !== 'wealth');
    const groups = groupTopicsFor('yunjung_01', withoutCareer);

    expect(groups).toHaveLength(1);
    expect(groups[0].headingKey).toBeNull();
  });
});

/**
 * Since 18-09 nobody picks a topic — the subject screen sets one and walks into the room. That
 * makes this function the only thing standing between a session and an EMPTY topic, which is not a
 * cosmetic default: the lines that name the subject are recorded per topic with no bare fallback,
 * so an empty one drops those lines into live synthesis.
 */
describe('the topic when nobody picks one', () => {
  it('opens a specialist on her own ground', () => {
    expect(defaultTopicFor('yunjung_01')).toBe('career');
  });

  it('gives the generalist the topic that does not narrow her', () => {
    expect(defaultTopicFor('yuna_01')).toBe('life');
  });

  it('never returns empty, whoever is asked', () => {
    for (const id of [undefined, 'nobody_99', 'yuna_01', 'yunjung_01']) {
      expect(defaultTopicFor(id)).toBeTruthy();
    }
  });
});
