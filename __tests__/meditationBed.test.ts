// See soundSetting.test.ts for why AsyncStorage needs a stand-in here.
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

// react-native-sound is a native module. The double records what the bed ASKED the platform for —
// which file, how many loops — because that is the whole contract this module has with the device.
// `mock`-prefixed so jest's out-of-scope guard lets the factory below reach them.
const mockLoaded: string[] = [];
const mockReleased: string[] = [];
const mockVolume = { value: 0 };
const mockEvents: string[] = [];
const events = mockEvents;
const loaded = mockLoaded;
const released = mockReleased;

jest.mock(
  'react-native-sound',
  () => {
    class FakeSound {
      static MAIN_BUNDLE = '/bundle';
      static setCategory() {}
      file: string;
      playing = false;
      constructor(file: string, _base: string | undefined, done: (e: unknown) => void) {
        this.file = file;
        mockLoaded.push(file);
        // ⚠️ MUST be deferred, and finding that out is what this double is for. The module keeps the
        // instance as `sound = s` INSIDE this callback, so answering synchronously runs it while `s`
        // is still in its temporal dead zone — the throw is swallowed by the try/catch around the
        // constructor and the bed silently never loads. The real library answers after the native
        // load, which is why nobody has met this on a device.
        setImmediate(() => done(null));
      }
      setNumberOfLoops() {}
      setVolume(v: number) {
        mockVolume.value = v;
      }
      getVolume() {
        return mockVolume.value;
      }
      play(cb?: (ok: boolean) => void) {
        this.playing = true;
        cb?.(true);
      }
      isPlaying() {
        return this.playing;
      }
      stop() {
        this.playing = false;
        mockEvents.push('stop:' + this.file);
      }
      pause() {
        this.playing = false;
        mockEvents.push('pause:' + this.file);
      }
      release() {
        mockReleased.push(this.file);
      }
    }
    return { __esModule: true, default: FakeSound };
  },
  { virtual: true },
);

import { backgroundMusic } from '../src/shared/audio/backgroundMusic';

/** Let the (deferred) load callback run — see the double's constructor. */
const settle = () => new Promise(resolve => setImmediate(resolve));

describe('the two beds', () => {
  beforeEach(() => {
    loaded.length = 0;
    released.length = 0;
    events.length = 0;
  });

  afterEach(() => {
    backgroundMusic.release();
  });

  it('plays the app bed by default', async () => {
    backgroundMusic.start();
    await settle();

    expect(loaded).toEqual(['prayers_ambient.m4a']);
  });

  it('swaps to the meditation loop when that room asks for it', async () => {
    backgroundMusic.start();
    await settle();
    backgroundMusic.start('meditation');
    await settle();

    // One file per instance: the swap has to release the old one, not just turn it down.
    expect(released).toContain('prayers_ambient.m4a');
    expect(loaded[loaded.length - 1]).toBe('meditation_bed.m4a');
  });

  it('does not reload the file it is already playing', async () => {
    backgroundMusic.start('meditation');
    await settle();
    backgroundMusic.start('meditation');
    await settle();

    expect(loaded).toEqual(['meditation_bed.m4a']);
    expect(released).toEqual([]);
  });

  it('comes back to the app bed on the way out of the room', async () => {
    backgroundMusic.start('meditation');
    await settle();
    backgroundMusic.start('app');
    await settle();

    expect(released).toContain('meditation_bed.m4a');
    expect(loaded[loaded.length - 1]).toBe('prayers_ambient.m4a');
  });
});

/**
 * A paused session is not an ended one.
 *
 * The room's music IS the session — so Pause has to hold the track where it is rather than drop it,
 * or carrying on restarts the room under someone who only put the phone down for a sip of water.
 */
describe('pausing the bed', () => {
  beforeEach(() => {
    loaded.length = 0;
    released.length = 0;
    events.length = 0;
  });

  afterEach(() => {
    backgroundMusic.release();
  });

  it('holds the position instead of stopping', async () => {
    backgroundMusic.start('meditation');
    await settle();
    events.length = 0;

    backgroundMusic.pause();
    // The fade runs on a timer before the pause lands.
    await new Promise(resolve => setTimeout(resolve, 1200));

    expect(events).toContain('pause:meditation_bed.m4a');
    expect(events).not.toContain('stop:meditation_bed.m4a');
    expect(released).toEqual([]);
  });

  it('carries on with the same file rather than loading it again', async () => {
    backgroundMusic.start('meditation');
    await settle();
    backgroundMusic.pause();
    await new Promise(resolve => setTimeout(resolve, 1200));
    loaded.length = 0;

    backgroundMusic.start('meditation');
    await settle();

    expect(loaded).toEqual([]);
  });

  it('does nothing when there is no bed to pause', () => {
    expect(() => backgroundMusic.pause()).not.toThrow();
  });
});
