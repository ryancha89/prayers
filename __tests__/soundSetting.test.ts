// AsyncStorage is a native module and there is none under jest — the persist middleware writes on
// every setState, and an unmocked write takes the whole suite down with "Native module is null".
// An in-memory stand-in is enough: what is under test is the preference, not where it is kept.
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});

import { useSoundStore, musicEnabled } from '../src/shared/audio/store';

/**
 * The switch itself, not the sound.
 *
 * What a test can hold onto here is the preference: that it starts ON, that turning it off is what
 * the app reads afterwards, and that a stored value nobody can make sense of leaves the app
 * sounding the way it does out of the box rather than mute. The audio path underneath is native and
 * belongs to a device, not to jest.
 */
describe('background music setting', () => {
  const merge = (useSoundStore.persist.getOptions().merge ?? ((_p, c) => c)) as (
    persisted: unknown,
    current: { musicEnabled: boolean },
  ) => { musicEnabled: boolean };

  beforeEach(() => {
    useSoundStore.setState({ musicEnabled: true });
  });

  it('is on until the player says otherwise', () => {
    expect(musicEnabled()).toBe(true);
  });

  it('reads back what was set, from outside React as well', () => {
    useSoundStore.getState().setMusicEnabled(false);
    expect(useSoundStore.getState().musicEnabled).toBe(false);
    // The player module is not a component and reads it through this door.
    expect(musicEnabled()).toBe(false);

    useSoundStore.getState().toggleMusic();
    expect(musicEnabled()).toBe(true);
  });

  it('treats a stored false as the only reason to be quiet', () => {
    expect(merge({ musicEnabled: false }, { musicEnabled: true }).musicEnabled).toBe(false);
  });

  it('starts audible on a first launch, and on a preference it cannot read', () => {
    // Nothing stored yet.
    expect(merge(undefined, { musicEnabled: true }).musicEnabled).toBe(true);
    // Half-written or from a build that kept something else here.
    expect(merge({}, { musicEnabled: true }).musicEnabled).toBe(true);
    expect(merge({ musicEnabled: 'no' }, { musicEnabled: true }).musicEnabled).toBe(true);
  });
});
