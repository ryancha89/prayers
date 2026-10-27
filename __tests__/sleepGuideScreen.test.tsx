import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

/**
 * The sleep guide screen on top of the real session and player code, with only react-native-sound
 * faked: it starts on arrival, pauses and resumes, ends on a Replay card that starts both tracks from
 * 0 again, and leaving silences it.
 */
const mockNav = { goBack: jest.fn(), addListener: jest.fn(() => () => {}) };
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), back: jest.fn() } }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

const mockSounds: any[] = [];
jest.mock('react-native-sound', () => {
  class Sound {
    static MAIN_BUNDLE = 'bundle';
    static setCategory() {}
    calls: string[] = [];
    released = false;
    onEnd: ((ok: boolean) => void) | null = null;
    file: string;
    constructor(path: string, _b: string, onLoad: (e: unknown) => void) {
      this.file = path;
      mockSounds.push(this);
      onLoad(null); // synchronous on purpose: the loader must survive a callback inside `new`
    }
    setVolume() {}
    getDuration() {
      return 900;
    }
    play(cb: (ok: boolean) => void) {
      this.calls.push('play');
      this.onEnd = cb;
    }
    pause() {
      this.calls.push('pause');
    }
    stop() {
      this.calls.push('stop');
    }
    release() {
      this.released = true;
    }
    getCurrentTime(cb: (s: number) => void) {
      cb(0);
    }
    setCurrentTime() {}
  }
  return Sound;
});

import { SleepGuideScreen } from '../src/features/meditation/screens/SleepGuideScreen';

const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(require('react-native').Text).map(n => [].concat(n.props.children).join('')).join(' | ');
const live = (file: string) => mockSounds.filter(s => s.file === file && !s.released);
const press = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  act(() => {
    tree.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0].props.onPress();
  });

beforeEach(() => {
  mockSounds.length = 0;
});

it('starts voice and music on arrival, without a second tap', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<SleepGuideScreen />);
  });
  expect(live('sleep_bed.m4a')[0].calls).toEqual(['play']);
  expect(live('sleep_voice_en.m4a')[0].calls).toEqual(['play']);
  expect(text(tree)).toContain('Close your eyes');
  expect(text(tree)).toContain('30:00 left');
  act(() => tree.unmount());
});

it('pauses and resumes both, ends on Replay, and Replay starts again from the top', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<SleepGuideScreen />);
  });
  const [bed] = live('sleep_bed.m4a');
  const [voice] = live('sleep_voice_en.m4a');

  await press(tree, 'sleep-pause');
  expect(bed.calls).toEqual(['play', 'pause']);
  expect(voice.calls).toEqual(['play', 'pause']);
  expect(text(tree)).toContain('Paused.');
  await press(tree, 'sleep-resume');
  expect(bed.calls).toEqual(['play', 'pause', 'play']);
  expect(voice.calls).toEqual(['play', 'pause', 'play']);

  act(() => bed.onEnd(true)); // the 30:00 bed reaches its end
  expect(text(tree)).toContain('Sleep well.');
  expect(live('sleep_bed.m4a')).toEqual([]); // nothing left playing
  await press(tree, 'sleep-replay');
  expect(live('sleep_bed.m4a')[0].calls).toEqual(['play']);
  expect(live('sleep_voice_en.m4a')[0].calls).toEqual(['play']);

  act(() => tree.unmount()); // leaving stops the session
  expect(mockSounds.every(s => s.released)).toBe(true);
});

/* ---- the yoga girl behind the guide (22-10) ---------------------------------------------------- */

it('tells the girl in the room to sleep-breathe while the guide plays, slower than the room, out-breath longest', () => {
  const { roomStateFor, SLEEP_BREATH } = require('../src/features/meditation/screens/SleepGuideScreen');
  expect(roomStateFor('running')).toBe('breathing');
  expect(roomStateFor('paused')).toBe('paused');
  expect(roomStateFor('done')).toBe('done');
  expect(roomStateFor('loading')).toBe('idle');
  const cycle = SLEEP_BREATH.inMs + SLEEP_BREATH.holdMs + SLEEP_BREATH.outMs;
  expect(cycle).toBeGreaterThan(14000 - 1500); // not quicker than the meditation room's 4-4-6 by much
  expect(SLEEP_BREATH.outMs).toBeGreaterThan(SLEEP_BREATH.inMs);
});


it('waits on the sleep card\'s picture, not the meditation threshold\'s lone lantern', async () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<SleepGuideScreen />);
  });
  expect(tree.root.findAll(n => n.props.testID === 'sleep-art').length).toBeGreaterThan(0);
  expect(tree.root.findAll(n => n.props.testID === 'med-threshold')).toHaveLength(0);
  act(() => tree.unmount());
});
