/**
 * Art slots for the journey's illustrated moments (the 2027 mockup, 01-10). The screens only ever ask
 * this map, so replacing a picture is a one-line change here. Painted with codex by
 * Tools/journey_art/gen_cards.sh (raw outputs in Tools/journey_art/raw_cards/), then sized into assets/.
 * Reveal art is drawn `cover` into a ~16:9 band (portrait) or a ~square (landscape), so every subject
 * is centred in its 3:2 painting.
 *
 *   slot                 file (assets/)                  status
 *   reveal.career        reveal_career.jpg               done 01-10 — dawn city, glowing stair to an open door
 *   reveal.wealth        reveal_wealth.jpg               done 01-10 — golden towers at dusk, coins of light
 *   reveal.love          reveal_love.jpg                 done 01-10 — couple from behind, cherry blossoms, river sunset
 *   reveal.health        reveal_health.jpg               done 01-10 — forest, mountains and a calm morning lake
 *   reveal.overall       reveal_overall.jpg              done 01-10 — brass armillary orb over a starry valley
 *   ending               ending.jpg                      done 01-10 — lit train on a stone viaduct at sunset (no text)
 *   pick card backs      card_back_1/2/3.png             done 01-10 — navy / plum / forest green, gold compass star
 */
const HERO = require('./assets/hero_2027.jpg');

export const REVEAL_ART: Record<string, number> = {
  career: require('./assets/reveal_career.jpg'),
  wealth: require('./assets/reveal_wealth.jpg'),
  love: require('./assets/reveal_love.jpg'),
  health: require('./assets/reveal_health.jpg'),
  overall: require('./assets/reveal_overall.jpg'),
};

/** A station with no slot of its own. */
export const REVEAL_ART_DEFAULT: number = HERO;

/** "언제나, 당신의 여행이 빛나길" — the painting after the last station. */
export const ENDING_ART: number = require('./assets/ending.jpg');

/** The three face-down cards of the pick stage, left to right (mockup panel 6). */
export const CARD_BACKS: readonly number[] = [
  require('./assets/card_back_1.png'),
  require('./assets/card_back_2.png'),
  require('./assets/card_back_3.png'),
];
