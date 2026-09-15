import { registryFor } from '../counselors/data/registry';

/**
 * Which topics this counselor is FOR, and which ones she will still take.
 *
 * The picker offered the same six cards to everybody, including a career specialist and a
 * relationship one — so the screen said "pick anything" while the roster said each of them reads
 * one thing best. The split below is the roster's own word (`specialty`), not a second list: add a
 * counselor and her sections come from the seed that already had to name what she does.
 *
 * DELIBERATELY NOT A FILTER. A player who wants to ask the career counselor about their marriage is
 * allowed to — the room answers it, the server classifies it, and hiding the card would send them
 * back out to find somebody else for a question this counselor can handle. What changes is the
 * ORDER and the framing: her ground first, under her name; everything else still there, below.
 *
 * `general` (Yuna) gets no split at all. A generalist with a "her ground" heading over all six
 * cards is a heading that says nothing.
 */
export type TopicGroup<T> = {
  /** Null for the flat, generalist list. */
  headingKey: 'topic.herGround' | 'topic.alsoPossible' | null;
  items: T[];
};

/** specialty → the topic keys that specialty is actually about. */
const GROUND: Record<string, readonly string[]> = {
  // "business and career merged" in the roster's own enum, and money is the question a career
  // reading turns into by the second sentence.
  career: ['career', 'wealth'],
  wealth: ['wealth', 'career'],
  // Two different things in this app's vocabulary — 연애 and 인간관계 — and one counselor covers both.
  love: ['love', 'relationships'],
  // No cards yet; a heading over an empty section would be worse than no heading.
  tarot: [],
  horoscope: [],
};

export function groupTopicsFor<T extends { key: string }>(
  characterId: string | undefined,
  options: T[],
): TopicGroup<T>[] {
  const specialty = registryFor(characterId)?.specialty ?? 'general';
  const ground = GROUND[specialty] ?? [];
  if (ground.length === 0) return [{ headingKey: null, items: options }];

  const hers = ground
    .map(key => options.find(o => o.key === key))
    .filter((o): o is T => o != null);
  if (hers.length === 0) return [{ headingKey: null, items: options }];

  const rest = options.filter(o => !hers.includes(o));
  const groups: TopicGroup<T>[] = [{ headingKey: 'topic.herGround', items: hers }];
  if (rest.length > 0) groups.push({ headingKey: 'topic.alsoPossible', items: rest });
  return groups;
}
