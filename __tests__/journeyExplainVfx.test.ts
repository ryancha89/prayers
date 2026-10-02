/**
 * The explanation effects (storyboard 02-10): which ambient a station asks the cabin for, which
 * one-shots fire while a part is explained, and the season burst of each month card.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { cabinAmbientOf, cardCueOf, explainCuesDue, seasonCueOf } from '../src/features/journey/player/journeyPlayer';

describe('explanation effects', () => {
  it('gives every reading station its ambient and the goodbye none', () => {
    for (const id of ['intro', 'career', 'wealth', 'love', 'health', 'overall', 'monthly']) {
      expect(cabinAmbientOf(id)).toBe(id);
    }
    expect(cabinAmbientOf('outro')).toBe('');
    expect(cabinAmbientOf(undefined)).toBe('');
  });

  it('turns each month card into its season, calendar months, December in winter', () => {
    expect([1, 2, 12].map(seasonCueOf)).toEqual(['snow', 'snow', 'snow']);
    expect([3, 4, 5].map(seasonCueOf)).toEqual(['petals', 'petals', 'petals']);
    expect([6, 7, 8].map(seasonCueOf)).toEqual(['fireflies', 'fireflies', 'fireflies']);
    expect([9, 10, 11].map(seasonCueOf)).toEqual(['maple', 'maple', 'maple']);
    expect(cardCueOf('monthly', [7])).toBe('fireflies');
    // A topic's reveal card is shown before its part plays: it fires nothing of its own.
    expect(cardCueOf('wealth', [5])).toBeNull();
  });

  it('fires one effect per part, only in a station’s first parts', () => {
    // Overall: the hologram at 30 % of its first part, the shooting star at half of its second.
    expect(explainCuesDue('overall', 5, 20, 0, 0)).toEqual({ cues: [], fired: 0 });
    expect(explainCuesDue('overall', 6, 20, 0, 0)).toEqual({ cues: ['hologram'], fired: 1 });
    expect(explainCuesDue('overall', 19, 20, 1, 0)).toEqual({ cues: [], fired: 1 });
    expect(explainCuesDue('overall', 10, 20, 0, 1).cues).toEqual(['shootingStar']);
    // Topics: once, in the free part; the paid parts are quiet (sim 02-10: "VFX bị nhiều quá").
    expect(explainCuesDue('wealth', 8, 20, 0, 0).cues).toEqual(['orb']);
    expect(explainCuesDue('wealth', 19, 20, 0, 1).cues).toEqual([]);
    expect(explainCuesDue('wealth', 19, 20, 0, 2).cues).toEqual([]);
    expect(explainCuesDue('love', 8, 20, 0).cues).toEqual(['petals']);
    expect(explainCuesDue('career', 8, 20, 0).cues).toEqual(['cityLights']);
    expect(explainCuesDue('monthly', 19, 20, 0).cues).toEqual([]);
    expect(explainCuesDue('wealth', 10, 0, 0).cues).toEqual([]);
  });
});
