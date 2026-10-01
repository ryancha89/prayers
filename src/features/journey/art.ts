/**
 * Art slots for the journey's illustrated moments (the 2027 mockup, 01-10). Each slot names the file
 * it is waiting for; until that file exists it shows an existing journey asset. Replacing a fallback
 * is a one-line change here — the screens only ever ask this map.
 *
 *   slot                 intended file (assets/)          fallback today
 *   reveal.career        reveal_career.jpg               hero_2027.jpg
 *   reveal.wealth        reveal_wealth.jpg               hero_2027_plate.jpg
 *   reveal.love          reveal_love.jpg                 hero_2027.jpg
 *   reveal.health        reveal_health.jpg               platform_night.jpg
 *   reveal.overall       reveal_overall.jpg              hero_2027_plate.jpg
 *   ending               ending.jpg                      hero_2027.jpg
 */
const HERO = require('./assets/hero_2027.jpg');
const PLATE = require('./assets/hero_2027_plate.jpg');
const NIGHT = require('./assets/platform_night.jpg');

export const REVEAL_ART: Record<string, number> = {
  career: HERO,
  wealth: PLATE,
  love: HERO,
  health: NIGHT,
  overall: PLATE,
};

/** A station with no slot of its own. */
export const REVEAL_ART_DEFAULT: number = HERO;

/** "언제나, 당신의 여행이 빛나길" — the painting after the last station. */
export const ENDING_ART: number = HERO;
