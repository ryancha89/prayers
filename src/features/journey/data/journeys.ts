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
  chapters: [
    { id: 'intro', order: 0, title: 'journey.st.intro', subtitle: 'journey.sub.intro', background: { type: 'scene', scene: 'station' } },
    { id: 'career', order: 1, title: 'journey.st.career', subtitle: 'journey.sub.career', background: { type: 'scene', scene: 'dawnCity' } },
    { id: 'wealth', order: 2, title: 'journey.st.wealth', subtitle: 'journey.sub.wealth', background: { type: 'scene', scene: 'nightCity' } },
    { id: 'love', order: 3, title: 'journey.st.love', subtitle: 'journey.sub.love', background: { type: 'scene', scene: 'springSunset' } },
    { id: 'health', order: 4, title: 'journey.st.health', subtitle: 'journey.sub.health', background: { type: 'scene', scene: 'forestLake' } },
    { id: 'overall', order: 5, title: 'journey.st.overall', subtitle: 'journey.sub.overall', background: { type: 'scene', scene: 'sunrise' } },
    { id: 'outro', order: 6, title: 'journey.st.outro', subtitle: 'journey.sub.outro', background: { type: 'scene', scene: 'arrival' } },
  ],
  // No bundled tracks yet: the layers exist so a BGM or train ambience is a file and a name here.
  audio: { bgm: null, ambient: null },
};

export const JOURNEYS: Record<string, Journey> = { [NEWYEAR_2027.id]: NEWYEAR_2027 };
