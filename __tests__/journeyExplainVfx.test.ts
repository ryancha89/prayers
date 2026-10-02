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

  it('fires a station’s one-shots once each, at their point in the part', () => {
    // Overall: the hologram at 30 %, the shooting star at 75 % of a 20 s part.
    expect(explainCuesDue('overall', 5, 20, 0)).toEqual({ cues: [], fired: 0 });
    expect(explainCuesDue('overall', 6, 20, 0)).toEqual({ cues: ['hologram'], fired: 1 });
    expect(explainCuesDue('overall', 7, 20, 1)).toEqual({ cues: [], fired: 1 });
    expect(explainCuesDue('overall', 16, 20, 1)).toEqual({ cues: ['shootingStar'], fired: 2 });
    // A seek past both fires both, once.
    expect(explainCuesDue('overall', 19, 20, 0)).toEqual({ cues: ['hologram', 'shootingStar'], fired: 2 });
    expect(explainCuesDue('overall', 20, 20, 2)).toEqual({ cues: [], fired: 2 });
    expect(explainCuesDue('wealth', 8, 20, 0).cues).toEqual(['orb']);
    expect(explainCuesDue('love', 8, 20, 0).cues).toEqual(['petals']);
    expect(explainCuesDue('career', 8, 20, 0).cues).toEqual(['cityLights']);
    // The months station fires on its cards, not on a schedule; no duration, nothing due.
    expect(explainCuesDue('monthly', 19, 20, 0).cues).toEqual([]);
    expect(explainCuesDue('wealth', 10, 0, 0).cues).toEqual([]);
  });
});
