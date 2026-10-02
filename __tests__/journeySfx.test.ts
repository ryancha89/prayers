/**
 * The sound of the cabin's effects. Pinned: every cue has a sound and its file is bundled and
 * linked; the sound lands CUE_SFX_LEAD_MS after the cue (when Unity blooms the VFX), the unlock's
 * too, and the topic cue after it; leaving the journey or the station drops what was scheduled; the
 * interface-sounds switch silences them; the journey BGM ducks under one and comes back — and the
 * ambient layer is never touched.
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
    /** Loads at once, plays at once; every instance and call is kept for the assertions. */
    class MockSound {
      static all: MockSound[] = [];
      static MAIN_BUNDLE = '/bundle';
      file: string;
      plays = 0;
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
      release() {}
      setCurrentTime() {}
      setNumberOfLoops() {}
      setVolume(v: number) { this.volumes.push(v); }
      getDuration() { return 0; }
    }
    return MockSound;
  },
  // NOT virtual: the package is installed, and a virtual mock lives under a virtual path that loses
  // to the real one once another file in the same jest worker has resolved it — the sounds then
  // silently became null and this file failed only on some full runs (cf. jest/devTokenStub.js).
);

import * as api from '../src/features/journey/api/journeyApi';
import { authedFetch } from '../src/features/auth/api/headers';
import {
  CUE_AFTER_UNLOCK_MS,
  CUE_SFX_LEAD_MS,
  JOURNEY_BGM_VOLUME,
  TRANSITION_MS,
  useJourneyPlayer,
} from '../src/features/journey/player/journeyPlayer';
import {
  BGM_DUCK,
  JOURNEY_SFX_FILES,
  pendingJourneySfx,
  sfxForCue,
} from '../src/features/journey/player/journeySfx';
import { useSoundStore } from '../src/shared/audio/store';
import { useSavedJourneys } from '../src/features/journey/store/savedJourneysStore';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { NEWYEAR_2027 } from '../src/features/journey/data/journeys';
import type { JourneyContent, JourneyPart, MomentCue } from '../src/features/journey/types';

const Sound = require('react-native-sound') as { all: Array<{ file: string; plays: number; volumes: number[] }> };

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const IDX = Object.fromEntries(NEWYEAR_2027.chapters.map((c, i) => [c.id, i]));
const free = (): JourneyPart => ({ momentId: null, unlocked: true, label: null, teaser: null, text: 'A short line.', cards: [] });
const locked = (id: string): JourneyPart => ({ momentId: id, unlocked: false, label: `L ${id}`, teaser: `Offer ${id}`, text: null, cards: [] });

/** Topics [free, #0, #1], monthly [free, #0..#3]; a silent part runs 8 s (no TTS in tests). */
function content(): JourneyContent {
  const chapters = NEWYEAR_2027.chapters.map(c => {
    const parts =
      c.id === 'intro' || c.id === 'outro' ? [free()]
      : c.id === 'monthly' ? [free(), locked('monthly#0'), locked('monthly#1'), locked('monthly#2'), locked('monthly#3')]
      : [free(), locked(`${c.id}#0`), locked(`${c.id}#1`)];
    return { id: c.id, narration: 'A short line.', cards: [], parts, card: null };
  });
  return {
    journey: 'newyear-2027', year: 2027, counselor: 'theo', chapters, momentPrice: 100,
    summary: { bestMonths: [], cautionMonths: [], keywords: ['k'], months: [] },
  };
}

const unlockBody = (id: string) => ({
  success: true, moment_id: id, charged: 100, coin_balance: 400,
  part: { moment_id: id, unlocked: true, label: `L ${id}`, teaser: `Offer ${id}`, text: `The paid ${id} line.`, cards: [] },
  summary: { best_months: [], caution_months: [], keywords: ['k'], months: [] },
});

const player = () => useJourneyPlayer.getState();
const sound = (file: string) => Sound.all.filter(s => s.file === file);
const plays = (file: string) => sound(file).reduce((n, s) => n + s.plays, 0);
const bgm = () => sound('prayers_ambient.m4a').at(-1)!;
const ambient = () => sound('train_ambience.m4a').at(-1)!;
const bgmVolume = () => bgm().volumes.at(-1);

/** Career: title → pick a card → its free part playing. Its cityLights cue is due at 35 % (2.8 s). */
async function rideIntoCareer() {
  await player().board('newyear-2027', 'theo', 'theo', 'en', { platform: true });
  player().goTo(IDX.career);
  // The ride's tunnel ducks the BGM too; let it come back up on the title card before the reading.
  await jest.advanceTimersByTimeAsync(TRANSITION_MS + 1000);
  player().beginStation();
  player().pickCard(1);
  player().beginReading();
  await jest.advanceTimersByTimeAsync(100);
  expect(player()).toMatchObject({ status: 'playing', partIndex: 0 });
}

/** Advance in small steps until a cue fires; returns it. The clock then stands at the firing. */
async function untilCue(): Promise<MomentCue | ''> {
  const seq = player().cueSeq;
  for (let i = 0; i < 400 && player().cueSeq === seq; i++) await jest.advanceTimersByTimeAsync(10);
  expect(player().cueSeq).toBe(seq + 1);
  return player().cue;
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
  fetchMock.mockReset();
});

afterEach(() => {
  player().stop();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('which sound', () => {
  it('gives every cue a sound', () => {
    const expected: Record<MomentCue, string> = {
      hologram: 'hologram', orb: 'orb', shootingStar: 'shootingStar', cityLights: 'cityLights',
      petals: 'petals', snow: 'snow', maple: 'maple', fireflies: 'fireflies', leaves: 'leaves',
      sparkle: 'sparkle', stars: 'stars', coins: 'coins', hearts: 'sparkle', reveal: 'unlock',
    };
    for (const [cue, name] of Object.entries(expected)) expect(sfxForCue(cue as MomentCue)).toBe(name);
    expect(sfxForCue('')).toBeNull();
  });

  it('bundles every file and links it into both native projects (npx react-native-asset)', () => {
    const root = path.join(__dirname, '..');
    const linked = (platform: string) =>
      (JSON.parse(fs.readFileSync(path.join(root, platform, 'link-assets-manifest.json'), 'utf8')).data as { path: string }[])
        .map(d => path.basename(d.path));
    for (const file of Object.values(JOURNEY_SFX_FILES)) {
      expect(fs.existsSync(path.join(root, 'src/shared/assets/sounds', file))).toBe(true);
      expect(linked('ios')).toContain(file);
      expect(linked('android')).toContain(file);
    }
  });
});

describe('when', () => {
  it('lands CUE_SFX_LEAD_MS (450 ms) after the cue — with the bloom, not the gesture', async () => {
    expect(CUE_SFX_LEAD_MS).toBe(450);
    await rideIntoCareer();
    expect(await untilCue()).toBe('cityLights');
    await jest.advanceTimersByTimeAsync(CUE_SFX_LEAD_MS - 1);
    expect(plays('jsfx_city_lights.m4a')).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(plays('jsfx_city_lights.m4a')).toBe(1);
  });

  it('the unlock sounds at +450 ms, the topic cue (a coin chime for career) at its own +450 ms', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('career#0')));
    await rideIntoCareer();
    await jest.advanceTimersByTimeAsync(9000);
    expect(player()).toMatchObject({ moment: 'locked', momentId: 'career#0' });
    await player().unlock();
    expect(player().moment).toBe('premium');
    await jest.advanceTimersByTimeAsync(CUE_SFX_LEAD_MS - 1);
    expect(plays('jsfx_unlock.m4a')).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(plays('jsfx_unlock.m4a')).toBe(1);
    await jest.advanceTimersByTimeAsync(CUE_AFTER_UNLOCK_MS - CUE_SFX_LEAD_MS);
    expect(player().cue).toBe('coins');
    expect(plays('jsfx_coins.m4a')).toBe(0);
    await jest.advanceTimersByTimeAsync(CUE_SFX_LEAD_MS);
    expect(plays('jsfx_coins.m4a')).toBe(1);
  });
});

describe('cancelled', () => {
  it('by stop(): a cue fired just before leaving is never heard', async () => {
    await rideIntoCareer();
    await untilCue();
    expect(pendingJourneySfx()).toBe(1);
    player().stop();
    expect(pendingJourneySfx()).toBe(0);
    await jest.advanceTimersByTimeAsync(2000);
    expect(plays('jsfx_city_lights.m4a')).toBe(0);
  });

  it('by riding to another station', async () => {
    await rideIntoCareer();
    await untilCue();
    player().goTo(IDX.wealth);
    await jest.advanceTimersByTimeAsync(2000);
    expect(plays('jsfx_city_lights.m4a')).toBe(0);
  });

  it('by the interface-sounds switch: off plays nothing, the cue itself still goes to the cabin', async () => {
    useSoundStore.setState({ sfxEnabled: false });
    await rideIntoCareer();
    expect(await untilCue()).toBe('cityLights');
    await jest.advanceTimersByTimeAsync(3000);
    expect(Object.values(JOURNEY_SFX_FILES).map(plays)).toEqual(Object.values(JOURNEY_SFX_FILES).map(() => 0));
    expect(bgmVolume()).toBe(JOURNEY_BGM_VOLUME);
  });
});

describe('the BGM duck', () => {
  it('eases the music down under an effect, holds, and brings it back; the ambient is untouched', async () => {
    await rideIntoCareer();
    expect(bgmVolume()).toBe(JOURNEY_BGM_VOLUME);
    await untilCue();
    await jest.advanceTimersByTimeAsync(CUE_SFX_LEAD_MS);
    expect(plays('jsfx_city_lights.m4a')).toBe(1);
    // Eased: the first step is part-way, not the whole drop.
    expect(bgmVolume()!).toBeLessThan(JOURNEY_BGM_VOLUME);
    expect(bgmVolume()!).toBeGreaterThan(JOURNEY_BGM_VOLUME * BGM_DUCK);
    await jest.advanceTimersByTimeAsync(300);
    expect(bgmVolume()).toBeCloseTo(JOURNEY_BGM_VOLUME * BGM_DUCK, 5);
    // Held while the sound rings (cityLights is 1.2 s)…
    await jest.advanceTimersByTimeAsync(700);
    expect(bgmVolume()).toBeCloseTo(JOURNEY_BGM_VOLUME * BGM_DUCK, 5);
    // …then back, gradually.
    await jest.advanceTimersByTimeAsync(400);
    const rising = bgmVolume()!;
    expect(rising).toBeGreaterThan(JOURNEY_BGM_VOLUME * BGM_DUCK);
    expect(rising).toBeLessThan(JOURNEY_BGM_VOLUME);
    await jest.advanceTimersByTimeAsync(1000);
    expect(bgmVolume()).toBeCloseTo(JOURNEY_BGM_VOLUME, 5);
    // The carriage's own sound never moves.
    expect(new Set(ambient().volumes)).toEqual(new Set([0.35]));
  });

  it('stop() lifts the duck at once', async () => {
    await rideIntoCareer();
    await untilCue();
    await jest.advanceTimersByTimeAsync(CUE_SFX_LEAD_MS + 300);
    const music = bgm();
    expect(music.volumes.at(-1)).toBeCloseTo(JOURNEY_BGM_VOLUME * BGM_DUCK, 5);
    player().stop();
    expect(music.volumes.at(-1)).toBe(JOURNEY_BGM_VOLUME);
  });
});
