import type { Journey } from '../types';

/**
 * The journeys the app offers. Data, not screens: a new journey is a new entry here and a new
 * reading on the server (Prayers::JourneyService::JOURNEYS), with no UI written for it.
 */
export const NEWYEAR_2027: Journey = {
  id: 'newyear-2027',
  title: 'journey.2027.title',
  eyebrow: 'journey.2027.eyebrow',
  year: 2027,
  thumbnail: { type: 'scene', scene: 'station' },
  counselors: [
    { id: 'yunjung', pitch: 'journey.pitch.yunjung' },
    { id: 'theo', pitch: 'journey.pitch.theo' },
    { id: 'yuna', pitch: 'journey.pitch.yuna' },
    { id: 'jiho', pitch: 'journey.pitch.jiho' },
  ],
  // The 2027 mockup (24 panels, 01-10): six numbered stations between the departure and the end of
  // the line. The monthly station is its own stop now, and the window shows its seasons ('arrival'
  // turns with the month card on screen); the end of the line is the 'ending' scene.
  chapters: [
    { id: 'intro', order: 0, title: 'journey.st.intro', subtitle: 'journey.sub.intro', background: { type: 'scene', scene: 'station' } },
    { id: 'career', order: 1, number: 1, title: 'journey.st.career', subtitle: 'journey.sub.career', heading: 'journey.head.career', blurb: 'journey.blurb.career', interaction: 'pickCard', background: { type: 'scene', scene: 'dawnCity' } },
    { id: 'wealth', order: 2, number: 2, title: 'journey.st.wealth', subtitle: 'journey.sub.wealth', heading: 'journey.head.wealth', blurb: 'journey.blurb.wealth', interaction: 'branch', branchPrompt: 'journey.branch.wealth', background: { type: 'scene', scene: 'nightCity' } },
    { id: 'love', order: 3, number: 3, title: 'journey.st.love', subtitle: 'journey.sub.love', heading: 'journey.head.love', blurb: 'journey.blurb.love', background: { type: 'scene', scene: 'springSunset' } },
    { id: 'health', order: 4, number: 4, title: 'journey.st.health', subtitle: 'journey.sub.health', heading: 'journey.head.health', blurb: 'journey.blurb.health', background: { type: 'scene', scene: 'forestLake' } },
    { id: 'overall', order: 5, number: 5, title: 'journey.st.overall', subtitle: 'journey.sub.overall', heading: 'journey.head.overall', blurb: 'journey.blurb.overall', background: { type: 'scene', scene: 'sunrise' } },
    { id: 'monthly', order: 6, number: 6, title: 'journey.st.monthly', subtitle: 'journey.sub.monthly', heading: 'journey.head.monthly', blurb: 'journey.blurb.monthly', interaction: 'quarters', background: { type: 'scene', scene: 'arrival' } },
    { id: 'outro', order: 7, title: 'journey.st.outro', subtitle: 'journey.sub.outro', interaction: 'ending', hideOnRail: true, background: { type: 'scene', scene: 'ending' } },
  ],

  // Music: the app's own bed (194 s, -12.7 LUFS; ~-25 LUFS at the player's 0.25 — under the voice).
  // Carriage: rumble, rail joints, wind (Tools/audio/gen_train_ambience.py, -18 LUFS).
  audio: { bgm: 'prayers_ambient.m4a', ambient: 'train_ambience.m4a' },
  // The paid moments are the server's (two per topic station, the four quarters of the monthly
  // station); this is only how each one looks and what it says if the server sent no teaser.
  moments: {
    'career#0': { cue: 'coins', teaser: 'journey.moment.career' },
    'career#1': { cue: 'sparkle', teaser: 'journey.moment.career' },
    'wealth#0': { cue: 'coins', teaser: 'journey.moment.wealth' },
    'wealth#1': { cue: 'coins', teaser: 'journey.moment.wealth' },
    'love#0': { cue: 'hearts', teaser: 'journey.moment.love' },
    'love#1': { cue: 'hearts', teaser: 'journey.moment.love' },
    'health#0': { cue: 'leaves', teaser: 'journey.moment.health' },
    'health#1': { cue: 'leaves', teaser: 'journey.moment.health' },
    'overall#0': { cue: 'stars', teaser: 'journey.moment.overall' },
    'overall#1': { cue: 'sparkle', teaser: 'journey.moment.overall' },
    'monthly#0': { cue: 'leaves', teaser: 'journey.moment.months' },
    'monthly#1': { cue: 'sparkle', teaser: 'journey.moment.months' },
    'monthly#2': { cue: 'stars', teaser: 'journey.moment.months' },
    'monthly#3': { cue: 'sparkle', teaser: 'journey.moment.months' },
  },
  momentDefault: { cue: 'stars', teaser: 'journey.moment.months' },
  // 01-10: free to board, paid by the moment in coins. The pass screen stays for journeys sold whole.
  pass: false,
};

export const JOURNEYS: Record<string, Journey> = { [NEWYEAR_2027.id]: NEWYEAR_2027 };

/** Where "start the journey" goes: a journey sold whole goes through its boarding pass; a coin
 *  journey (2027 since 01-10) goes straight to choosing the guide — the pass screen never shows. */
export const journeyEntryRoute = (journey: Journey): 'JourneyPass' | 'JourneyCounselor' =>
  journey.pass ? 'JourneyPass' : 'JourneyCounselor';
