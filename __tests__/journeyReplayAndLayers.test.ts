/**
 * Two ways the 2027 journey went quiet or nowhere (QA 29-10). Pinned here:
 *  - "Ride again" (result screen) and a station tapped in the collection run while the Journey
 *    screen is away; the ride must be under way (never 'done') when that screen opens — it bounced
 *    straight to JourneyEnding on 'done' — and must then really arrive at the station.
 *  - The music and the train's rolling come back when the player returns to the screen at a card
 *    (title, lock, quarters …), not only on play(); the player's own pause and the music switch
 *    still hold.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock(
  'react-native-sound',
  () => {
    class MockSound {
      static all: MockSound[] = [];
      static MAIN_BUNDLE = '/bundle';
      file: string;
      playing = false;
      released = false;
      constructor(file: string, _base: unknown, cb: (err: unknown) => void) {
        this.file = file;
        MockSound.all.push(this);
        Promise.resolve().then(() => cb(null));
      }
      isLoaded() { return true; }
      play() { this.playing = true; }
      pause() { this.playing = false; }
      stop(cb?: () => void) { this.playing = false; cb?.(); }
      release() { this.released = true; }
      setCurrentTime() {}
      setNumberOfLoops() {}
      setVolume() {}
      getDuration() { return 0; }
      getCurrentTime(cb: (t: number) => void) { cb(0); }
    }
    return MockSound;
  },
  // NOT virtual — see journeySfx.test.ts.
);

import * as api from '../src/features/journey/api/journeyApi';
import { TRANSITION_MS, useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { stopStationAmbience } from '../src/features/journey/player/stationAmbience';
import { useSoundStore } from '../src/shared/audio/store';
import { useSavedJourneys } from '../src/features/journey/store/savedJourneysStore';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';
import type { JourneyContent, JourneyPart } from '../src/features/journey/types';

const Sound = require('react-native-sound') as {
  all: Array<{ file: string; playing: boolean; released: boolean }>;
};

const IDX = Object.fromEntries(NEWYEAR_2027.chapters.map((c, i) => [c.id, i]));
const LAST = NEWYEAR_2027.chapters.length - 1;
const free = (): JourneyPart => ({ momentId: null, unlocked: true, label: null, teaser: null, text: 'A short line.', cards: [] });
const paid = (id: string): JourneyPart => ({ momentId: id, unlocked: true, label: id, teaser: 'o', text: 'Paid line.', cards: [] });
const locked = (id: string): JourneyPart => ({ momentId: id, unlocked: false, label: id, teaser: `Offer ${id}`, text: null, cards: [] });

/** Topics [free, #0, #1], monthly [free, #0..#3]; every paid part open unless `closed`. */
function content(closed = false): JourneyContent {
  const gate = (id: string) => (closed ? locked(id) : paid(id));
  const chapters = NEWYEAR_2027.chapters.map(c => ({
    id: c.id, narration: 'A short line.', cards: [], card: null,
    parts: c.id === 'intro' || c.id === 'outro' ? [free()]
      : c.id === 'monthly' ? [free(), gate('monthly#0'), gate('monthly#1'), gate('monthly#2'), gate('monthly#3')]
      : [free(), gate(`${c.id}#0`), gate(`${c.id}#1`)],
  }));
  return {
    journey: 'newyear-2027', year: 2027, counselor: 'theo', chapters, momentPrice: closed ? 100 : 0,
    summary: { bestMonths: [], cautionMonths: [], keywords: ['k'], months: [] },
  };
}

const player = () => useJourneyPlayer.getState();
const live = (file: string) => Sound.all.filter(s => s.file === file && !s.released).at(-1);
const music = () => live('prayers_ambient.m4a');
const train = () => live('train_ambience.m4a');
let served: JourneyContent;

/** Board on the platform and ride to station `id`: its title card. */
async function rideTo(id: string) {
  await player().board('newyear-2027', 'theo', 'theo', 'en', { platform: true });
  await jest.advanceTimersByTimeAsync(10);
  player().goTo(IDX[id]);
  await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
  expect(player()).toMatchObject({ chapterIndex: IDX[id], stage: 'title', status: 'paused' });
}

/** Ride to the end of the line and finish it: the result screen's state. */
async function finishRide() {
  await rideTo('monthly');
  player().goTo(LAST);
  await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
  player().next(); // the outro's part → its ending
  expect(player().stage).toBe('ending');
  player().next(); // the ending → done
  expect(player().status).toBe('done');
}

/** What App.tsx does on leaving for JourneyEnding/Result/Collection, then the screen's press. */
async function rideAgainFromAway(index?: number) {
  player().setScreenActive(false);
  player().replay(index);
  // The Journey screen mounts here: on 'done' it would replace itself with JourneyEnding.
  expect(player().status).not.toBe('done');
  expect(player()).toMatchObject({ status: 'transition', transitionTo: index ?? 0 });
  await jest.advanceTimersByTimeAsync(TRANSITION_MS * 2);
  // Nothing arrives while the screen is still away.
  expect(player().status).toBe('transition');
  player().setScreenActive(true);
  await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
}

beforeEach(() => {
  jest.useFakeTimers();
  Sound.all.length = 0;
  served = content();
  useSoundStore.setState({ sfxEnabled: true, musicEnabled: true });
  useSavedJourneys.setState({ journeys: [], unlocks: {}, heard: {} });
  useCoins.setState({ balance: null, products: [], shopOpen: false });
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'me', isUser: true, birthDate: '1990-01-01', gender: 'male' } });
  jest.spyOn(api, 'fetchJourneyContent').mockImplementation(async () => ({ content: served, coinBalance: 500 }));
  jest.spyOn(api, 'narrationUrl').mockResolvedValue(null);
});

afterEach(() => {
  player().stop();
  player().setScreenActive(true);
  stopStationAmbience();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('ride again', () => {
  it('from the result screen of a finished ride: the first station arrives, with its music', async () => {
    await finishRide();
    await rideAgainFromAway();
    // The intro has no title card: it is told straight away.
    expect(player()).toMatchObject({ chapterIndex: 0, transitionTo: null, status: 'playing' });
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
  });

  it('from a station in the collection of a saved journey: that station title card', async () => {
    player().openSaved({ journeyId: 'newyear-2027', counselorId: 'theo', tone: 'theo', lang: 'en', content: content() });
    expect(player().status).toBe('done');
    await rideAgainFromAway(IDX.love);
    expect(player()).toMatchObject({ chapterIndex: IDX.love, stage: 'title', status: 'paused', transitionTo: null });
    // Held at a card, the train still rolls under it.
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
  });

  it('play() on a finished ride, on screen, still rides again', async () => {
    await finishRide();
    player().play();
    expect(player()).toMatchObject({ status: 'transition', transitionTo: 0 });
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
    expect(player()).toMatchObject({ chapterIndex: 0, status: 'playing' });
  });
});

describe('the music and the train after leaving the screen', () => {
  it('come back on return at a title card, and play under the station it then starts', async () => {
    await rideTo('career');
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
    player().setScreenActive(false);
    expect(music()?.playing).toBe(false);
    expect(train()?.playing).toBe(false);
    player().setScreenActive(true);
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
    player().beginStation();
    await jest.advanceTimersByTimeAsync(100);
    expect(player().status).toBe('playing');
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
  });

  it('come back on return at a lock', async () => {
    served = content(true);
    await rideTo('career');
    player().beginStation();
    await jest.advanceTimersByTimeAsync(100);
    expect(player()).toMatchObject({ moment: 'locked', stage: '' });
    player().setScreenActive(false);
    expect(music()?.playing).toBe(false);
    player().setScreenActive(true);
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
  });

  it('a pause the player made stays a pause until play()', async () => {
    await rideTo('career');
    player().beginStation();
    await jest.advanceTimersByTimeAsync(100);
    player().pause();
    expect(music()?.playing).toBe(false);
    expect(train()?.playing).toBe(false);
    player().setScreenActive(false);
    player().setScreenActive(true);
    expect(music()?.playing).toBe(false);
    expect(train()?.playing).toBe(false);
    player().play();
    expect(music()?.playing).toBe(true);
    expect(train()?.playing).toBe(true);
  });

  it('the music switch still governs the music; the train rolls regardless', async () => {
    await rideTo('career');
    player().setScreenActive(false);
    useSoundStore.setState({ musicEnabled: false });
    player().setScreenActive(true);
    expect(music()).toBeUndefined();
    expect(train()?.playing).toBe(true);
    // Switched back on at the card: it starts there, not only at the next narration.
    useSoundStore.setState({ musicEnabled: true });
    await jest.advanceTimersByTimeAsync(10);
    expect(music()?.playing).toBe(true);
  });
});
