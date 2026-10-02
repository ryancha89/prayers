/**
 * The place outside the window and the sound of the ride. Pinned: which loop each station plays
 * (the months station by the season of its month), that loops cross-fade and that a transition
 * fades the old station out before the new one comes in, that stop() silences at once, that the
 * music switch governs the loops and the interface-sounds switch the travel sounds, that the
 * loops follow the effects' duck, that the tunnel starts with the transition, that the final
 * arrival's chime lands as the train pulls in — once a ride — and that leaving the platform sounds.
 */
import * as fs from 'fs';
import * as path from 'path';

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
      plays = 0;
      released = false;
      volumes: number[] = [];
      constructor(file: string, _base: unknown, cb: (err: unknown) => void) {
        this.file = file;
        MockSound.all.push(this);
        Promise.resolve().then(() => cb(null));
      }
      isLoaded() { return true; }
      play() { this.plays += 1; }
      stop(cb?: () => void) { cb?.(); }
      pause() {}
      release() { this.released = true; }
      setCurrentTime() {}
      setNumberOfLoops() {}
      setVolume(v: number) { this.volumes.push(v); }
      getDuration() { return 0; }
    }
    return MockSound;
  },
  // Not virtual — see journeySfx.test.ts.
);

import * as api from '../src/features/journey/api/journeyApi';
import { TRANSITION_MS, seasonCueOf, useJourneyPlayer, wantedAmbience } from '../src/features/journey/player/journeyPlayer';
import { ARRIVAL_CHIME_AT_MS, BGM_DUCK, playJourneySfx } from '../src/features/journey/player/journeySfx';
import {
  AMBIENCE_FADE_MS,
  STATION_AMBIENCE_FILES,
  STATION_AMBIENCE_VOLUME,
  setStationAmbience,
  stationAmbienceOf,
  stationAmbienceSlots,
  stopStationAmbience,
} from '../src/features/journey/player/stationAmbience';
import { useSoundStore } from '../src/shared/audio/store';
import { useSavedJourneys } from '../src/features/journey/store/savedJourneysStore';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';
import type { JourneyContent, JourneyPart } from '../src/features/journey/types';

const Sound = require('react-native-sound') as {
  all: Array<{ file: string; plays: number; released: boolean; volumes: number[] }>;
};

const IDX = Object.fromEntries(NEWYEAR_2027.chapters.map((c, i) => [c.id, i]));
const free = (): JourneyPart => ({ momentId: null, unlocked: true, label: null, teaser: null, text: 'A short line.', cards: [] });

function content(): JourneyContent {
  const chapters = NEWYEAR_2027.chapters.map(c => ({ id: c.id, narration: 'A short line.', cards: [], parts: [free()], card: null }));
  return {
    journey: 'newyear-2027', year: 2027, counselor: 'theo', chapters, momentPrice: 100,
    summary: { bestMonths: [], cautionMonths: [], keywords: ['k'], months: [] },
  };
}

const player = () => useJourneyPlayer.getState();
const sounds = (file: string) => Sound.all.filter(s => s.file === file);
const plays = (file: string) => sounds(file).reduce((n, s) => n + s.plays, 0);
const last = (file: string) => sounds(file).at(-1)!;
const vol = (file: string) => last(file).volumes.at(-1) ?? 0;

async function onPlatform() {
  await player().board('newyear-2027', 'theo', 'theo', 'en', { platform: true });
  await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS + 100);
  expect(player().status).toBe('platform');
}

beforeEach(() => {
  jest.useFakeTimers();
  Sound.all.length = 0;
  useSoundStore.setState({ sfxEnabled: true, musicEnabled: true });
  useSavedJourneys.setState({ journeys: [], unlocks: {}, heard: {} });
  useCoins.setState({ balance: null, products: [], shopOpen: false });
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'me', isUser: true, birthDate: '1990-01-01', gender: 'male' } });
  jest.spyOn(api, 'fetchJourneyContent').mockImplementation(async () => ({ content: content(), coinBalance: 500 }));
  jest.spyOn(api, 'narrationUrl').mockResolvedValue(null);
});

afterEach(() => {
  player().stop();
  stopStationAmbience();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('which loop', () => {
  it('maps every station, the months station by its season, the end of the line to the arrival', () => {
    expect(['intro', 'career', 'wealth', 'love', 'health', 'overall', 'outro'].map(id => stationAmbienceOf(id)))
      .toEqual(['platform', 'city', 'eveningCity', 'meadow', 'forest', 'cosmic', 'arrival']);
    const season = { snow: 'winter', petals: 'spring', fireflies: 'summer', maple: 'autumn' } as const;
    for (let m = 1; m <= 12; m++) {
      // The same split as the months station's VFX: what you see and what you hear agree.
      expect(stationAmbienceOf('monthly', m)).toBe(season[seasonCueOf(m) as keyof typeof season]);
    }
    expect(stationAmbienceOf('monthly')).toBe('winter');
    expect(stationAmbienceOf('nowhere')).toBeNull();
  });

  it('follows the ride: the platform, nothing in a tunnel, the month card, then the quarter', () => {
    const base = { journeyId: 'newyear-2027', activeCard: null, transitionTo: null, partIndex: 0 };
    expect(wantedAmbience({ ...base, status: 'platform', chapterIndex: 0 })).toBe('platform');
    expect(wantedAmbience({ ...base, status: 'paused', chapterIndex: IDX.wealth })).toBe('eveningCity');
    expect(wantedAmbience({ ...base, status: 'transition', chapterIndex: IDX.wealth, transitionTo: IDX.love })).toBeNull();
    expect(wantedAmbience({ ...base, status: 'done', chapterIndex: IDX.outro })).toBeNull();
    const monthly = { ...base, status: 'playing' as const, chapterIndex: IDX.monthly };
    expect(wantedAmbience(monthly)).toBe('winter');
    expect(wantedAmbience({ ...monthly, partIndex: 2 })).toBe('spring');        // Q2 starts in April
    const july = { at: 0.2, title: 't', months: [7], description: '', stars: 3, saveable: true, key: 'k', chapterId: 'monthly' };
    expect(wantedAmbience({ ...monthly, partIndex: 2, activeCard: july })).toBe('summer');
    // The card goes down; its season stays for the rest of the part.
    expect(wantedAmbience({ ...monthly, partIndex: 2 })).toBe('summer');
    expect(wantedAmbience({ ...monthly, partIndex: 4 })).toBe('autumn');        // Q4: October
  });

  it('bundles every file and links it into both native projects', () => {
    const root = path.join(__dirname, '..');
    const linked = (platform: string) =>
      (JSON.parse(fs.readFileSync(path.join(root, platform, 'link-assets-manifest.json'), 'utf8')).data as { path: string }[])
        .map(d => path.basename(d.path));
    for (const file of [...Object.values(STATION_AMBIENCE_FILES), 'jtrav_tunnel.m4a', 'jtrav_arrival.m4a', 'jtrav_departure.m4a']) {
      expect(fs.existsSync(path.join(root, 'src/shared/assets/sounds', file))).toBe(true);
      expect(linked('ios')).toContain(file);
      expect(linked('android')).toContain(file);
    }
  });
});

describe('the loops', () => {
  it('cross-fade over AMBIENCE_FADE_MS, and the old one is released once silent', async () => {
    setStationAmbience('city');
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS);
    expect(vol('jamb_city.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME, 5);
    expect(last('jamb_city.m4a').plays).toBe(1);
    setStationAmbience('forest');
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS / 2);
    // Halfway: both are sounding, each at about half.
    expect(vol('jamb_city.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME / 2, 1);
    expect(vol('jamb_forest.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME / 2, 1);
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS / 2 + 50);
    expect(last('jamb_city.m4a').released).toBe(true);
    expect(stationAmbienceSlots()).toEqual([{ key: 'forest', level: 1, target: 1 }]);
    // Asking again for what plays changes nothing.
    setStationAmbience('forest');
    expect(sounds('jamb_forest.m4a')).toHaveLength(1);
  });

  it('a station change fades the old station out in the tunnel and the new one in on arrival', async () => {
    await onPlatform();
    expect(vol('jamb_platform.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME, 5);
    player().depart();
    await jest.advanceTimersByTimeAsync(100);
    // The intro is the platform: the same loop carries on, not a restart.
    expect(sounds('jamb_platform.m4a')).toHaveLength(1);
    player().goTo(IDX.career);
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS + 50);
    expect(last('jamb_platform.m4a').released).toBe(true);
    expect(sounds('jamb_city.m4a')).toHaveLength(0);
    await jest.advanceTimersByTimeAsync(TRANSITION_MS - AMBIENCE_FADE_MS);
    expect(player()).toMatchObject({ chapterIndex: IDX.career, stage: 'title' });
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS);
    expect(vol('jamb_city.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME, 5);
  });

  it('stop() silences at once', async () => {
    await onPlatform();
    player().stop();
    expect(last('jamb_platform.m4a').released).toBe(true);
    expect(stationAmbienceSlots()).toEqual([]);
  });

  it('obey the music switch: off plays none, turning it off mid-ride fades it out', async () => {
    useSoundStore.setState({ musicEnabled: false });
    await onPlatform();
    expect(sounds('jamb_platform.m4a')).toHaveLength(0);
    useSoundStore.setState({ musicEnabled: true });
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS);
    expect(vol('jamb_platform.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME, 5);
    useSoundStore.setState({ musicEnabled: false });
    await jest.advanceTimersByTimeAsync(AMBIENCE_FADE_MS + 50);
    expect(last('jamb_platform.m4a').released).toBe(true);
  });

  it('duck with the BGM under an effect', async () => {
    await onPlatform();
    playJourneySfx('orb');
    await jest.advanceTimersByTimeAsync(400);
    expect(vol('jamb_platform.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME * BGM_DUCK, 5);
    await jest.advanceTimersByTimeAsync(3000);
    expect(vol('jamb_platform.m4a')).toBeCloseTo(STATION_AMBIENCE_VOLUME, 5);
  });
});

describe('the ride', () => {
  it('leaving the platform sounds the wheels and the whistle', async () => {
    await onPlatform();
    expect(plays('jtrav_departure.m4a')).toBe(0);
    player().depart();
    await jest.advanceTimersByTimeAsync(10);
    expect(plays('jtrav_departure.m4a')).toBe(1);
  });

  it('the tunnel starts with the transition; the interface-sounds switch silences it', async () => {
    await onPlatform();
    player().goTo(IDX.wealth);
    expect(player().status).toBe('transition');
    expect(plays('jtrav_tunnel.m4a')).toBe(1);
    expect(plays('jtrav_arrival.m4a')).toBe(0);
    useSoundStore.setState({ sfxEnabled: false });
    player().goTo(IDX.love);
    expect(plays('jtrav_tunnel.m4a')).toBe(1);
  });

  it('into the last station: the chime lands at TRANSITION_MS, once a ride', async () => {
    await onPlatform();
    player().goTo(IDX.outro);
    await jest.advanceTimersByTimeAsync(TRANSITION_MS - ARRIVAL_CHIME_AT_MS - 1);
    expect(plays('jtrav_arrival.m4a')).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(plays('jtrav_arrival.m4a')).toBe(1);
    // The file's chime is ARRIVAL_CHIME_AT_MS in: it sounds exactly as the train pulls in.
    await jest.advanceTimersByTimeAsync(ARRIVAL_CHIME_AT_MS);
    expect(player().transitionTo).toBeNull();
    // Back a station and in again, then to the end: still once.
    player().prev();
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
    player().goTo(IDX.outro);
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 9000);
    expect(player().stage).toBe('ending');
    player().finish();
    expect(player().status).toBe('done');
    expect(plays('jtrav_arrival.m4a')).toBe(1);
  });

  it('a ride stopped before the end never chimes; the next ride chimes again, once', async () => {
    await onPlatform();
    player().goTo(IDX.outro);
    await jest.advanceTimersByTimeAsync(100);
    player().stop();
    await jest.advanceTimersByTimeAsync(TRANSITION_MS);
    expect(plays('jtrav_arrival.m4a')).toBe(0);
    await onPlatform();
    player().goTo(IDX.outro);
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 9000);
    expect(plays('jtrav_arrival.m4a')).toBe(1);
    player().finish();
    expect(plays('jtrav_arrival.m4a')).toBe(1);
  });
});
