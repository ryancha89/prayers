import { registryFor } from '../counselors/data/registry';

/**
 * Which topics this counselor takes.
 *
 * The picker used to offer the same six cards to everybody, including a career specialist and a
 * relationship one — so the screen said "pick anything" while the roster said each of them reads one
 * thing best. The split is the roster's own word (`specialty`), not a second list: add a counselor
 * and her sections come from the seed that already had to name what she does.
 *
 * ⚠️ THIS IS A FILTER NOW (16-09), AND IT WAS NOT BEFORE. The 15-09 version showed a specialist's
 * ground first and kept the other four below under "you can also ask about", on the argument that
 * the room can answer them anyway and hiding a card sends the player out to find somebody else.
 * The call was changed deliberately: a counselor presented as a career reader should look like one,
 * and a menu that offers everything makes the specialty decorative. What the ROOM accepts has not
 * changed — a question typed in the free-chat loop is still answered whatever it is about; this is
 * the opening menu only.
 *
 * `general` (Yuna) still gets the flat list with no heading. A generalist with a "her ground"
 * heading over all six cards is a heading that says nothing.
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
  // Nothing of hers came back from the server: show what DID rather than an empty screen. This is
  // the one case where the filter gives way — an empty picker has no way forward at all.
  if (hers.length === 0) return [{ headingKey: null, items: options }];

  return [{ headingKey: 'topic.herGround', items: hers }];
}

/**
 * The topic a consultation opens on when nobody is asked to choose one.
 *
 * ⚠️ REMOVING THE PICKER DID NOT REMOVE THE TOPIC (18-09, Cha Jeongmin: "don't let use choose
 * category — can directly enter the room"). Three things downstream still read it:
 *
 *   · the recorded takes. Lines that name the subject are recorded PER TOPIC —
 *     `consult_p06_l0__love` and six siblings — and there is no unsuffixed file to fall back to.
 *     An empty topic sends every one of those lines to live synthesis, which is exactly the lag
 *     that was fixed earlier the same day.
 *   · the VFX pack, whose entries carry per-topic variants.
 *   · the server prompt: `consult_shape_hint_v4` interpolates the topic's own name.
 *
 * So the choice moves rather than disappears: it comes from the roster's `specialty`, which is the
 * same field the picker was already filtering by. A career reader opens on career, a relationship
 * reader on love. `life` for a generalist — Yuna listens to anything, and of the seven topics that
 * is the one that does not narrow her.
 *
 * All seven topics have takes in every language, so no default here can land on a missing clip.
 */
export function defaultTopicFor(characterId: string | undefined): string {
  const specialty = registryFor(characterId)?.specialty ?? 'general';
  return GROUND[specialty]?.[0] ?? 'life';
}
