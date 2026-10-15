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

import { cabinAmbientOf, cardCueOf, explainAt, explainCuesDue, seasonCueOf } from '../src/features/journey/player/journeyPlayer';

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

describe('the effect lands on its word (10-07)', () => {
  const text = '두 번째 역은 재물운입니다. 올해는 흐름이 조용하게 시작됩니다. 그러다 여름부터 돈이 들어오는 길이 넓어집니다.';
  it('skips the station title and lands on the explanation', () => {
    const at = explainAt('wealth', 0, text)!;
    expect(at).toBeCloseTo(text.indexOf('돈') / text.length, 5);
    expect(at).toBeGreaterThan(0.5);
  });
  it('fires CUE lead early, not at the fixed 35 %', () => {
    const d = 20;
    const at = explainAt('wealth', 0, text)! * d;
    expect(explainCuesDue('wealth', 0.35 * d, d, 0, 0, text).cues).toEqual([]);
    expect(explainCuesDue('wealth', at - 0.4, d, 0, 0, text).cues).toEqual(['orb']);
  });
  it('falls back to the schedule when no word is said', () => {
    expect(explainAt('health', 0, 'Nothing to see.')).toBe(0.35);
  });
});
