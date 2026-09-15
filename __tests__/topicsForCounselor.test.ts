import { groupTopicsFor } from '../src/features/counseling/topicsForCounselor';

/**
 * The picker used to ask every counselor the same six questions — including the career specialist
 * and the relationship one, whose whole card says they read one thing best.
 *
 * What is pinned here is the judgement, not the layout: her ground comes FIRST, and nothing is
 * taken away. A player who wants to ask the career counsellor about their marriage is allowed to;
 * hiding the card would send them back out to find somebody else for a question this room answers.
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
  it('leads a career counselor with career and money', () => {
    // yunjung_01 is `career` in the generated roster.
    const groups = groupTopicsFor('yunjung_01', SIX);

    expect(groups[0].headingKey).toBe('topic.herGround');
    expect(groups[0].items.map(i => i.key)).toEqual(['career', 'wealth']);
    expect(groups[1].headingKey).toBe('topic.alsoPossible');
  });

  it('leads the relationship counselor with love and relationships', () => {
    // theo_01 is `love` in the roster — the brief, not the sheet's "career & money".
    const groups = groupTopicsFor('theo_01', SIX);

    expect(groups[0].items.map(i => i.key)).toEqual(['love', 'relationships']);
  });

  it('never drops a topic', () => {
    const all = groupTopicsFor('yunjung_01', SIX).flatMap(g => g.items.map(i => i.key));
    expect(all.sort()).toEqual(SIX.map(t => t.key).sort());
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
