/**
 * The 2027 journey against server contract v2 and the 24-panel mockup (01-10): each station is told
 * in `parts` (free, then paid); the train waits on the player at a title card, a card pick, a branch
 * choice, the monthly quarter list, a lock, a reveal card. Pinned here: how v2 parts are read, that a
 * lock offers unlock OR "later" (skipping on is allowed), what each unlock answer does, the branch
 * order, the quarters in any order, a part the server already unlocked never locks, the pass never
 * shows for a coin journey, the collection's counts, and that JOURNEY_STATE carries the moment.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: async (k: string) => {
        store.delete(k);
      },
    },
  };
});
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import * as api from '../src/features/journey/api/journeyApi';
import { authedFetch } from '../src/features/auth/api/headers';
import { unlockMoment } from '../src/features/journey/player/unlockMoment';
import {
  CUE_AFTER_UNLOCK_MS,
  TRANSITION_MS,
  cabinMomentOf,
  currentPart,
  teaserOf,
  useJourneyPlayer,
} from '../src/features/journey/player/journeyPlayer';
import { useSavedJourneys } from '../src/features/journey/store/savedJourneysStore';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useCoins } from '../src/features/coins/store/coinStore';
import { NEWYEAR_2027, journeyEntryRoute } from '../src/features/journey/data/journeys';
import { collectionOf } from '../src/features/journey/collection';
import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import type { JourneyContent, JourneyPart } from '../src/features/journey/types';
import type { JourneyStatePayload } from '../src/features/counseling/types';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const free = (): JourneyPart => ({ momentId: null, unlocked: true, label: null, teaser: null, text: 'A short line.', cards: [] });
const locked = (id: string): JourneyPart => ({ momentId: id, unlocked: false, label: `L ${id}`, teaser: `Offer ${id}`, text: null, cards: [] });
const paid = (id: string): JourneyPart => ({ momentId: id, unlocked: true, label: `L ${id}`, teaser: `Offer ${id}`, text: 'Paid line.', cards: [] });

const IDX = Object.fromEntries(NEWYEAR_2027.chapters.map((c, i) => [c.id, i]));

/** The server's v2 shape: topics [free, #0, #1], monthly [free, #0..#3], intro and outro one free
 *  part. A silent part runs 8 s (no TTS in tests). */
function content(unlocked: string[] = []): JourneyContent {
  const gate = (id: string) => (unlocked.includes(id) ? paid(id) : locked(id));
  const chapters = NEWYEAR_2027.chapters.map(c => {
    const parts =
      c.id === 'intro' || c.id === 'outro' ? [free()]
      : c.id === 'monthly' ? [free(), gate('monthly#0'), gate('monthly#1'), gate('monthly#2'), gate('monthly#3')]
      : [free(), gate(`${c.id}#0`), gate(`${c.id}#1`)];
    const card = c.number != null && c.id !== 'monthly' ? { title: 'New Leap', line: 'A door opens.' } : null;
    return { id: c.id, narration: 'A short line.', cards: [], parts, card };
  });
  return {
    journey: 'newyear-2027', year: 2027, counselor: 'theo', chapters, momentPrice: 100,
    summary: { bestMonths: [], cautionMonths: [], keywords: ['k'], months: [] },
  };
}

const unlockBody = (id: string, charged = 100, balance = 400, cards: unknown[] = []) => ({
  success: true, moment_id: id, charged, coin_balance: balance,
  part: { moment_id: id, unlocked: true, label: `L ${id}`, teaser: `Offer ${id}`, text: `The paid ${id} line.`, cards },
  summary: { best_months: [], caution_months: [], keywords: ['k'], months: [{ month: 5, ganji: '甲午', headline: 'h', stars: 4 }] },
});
const revealCard = { at: 0.2, title: 'The turn', months: [5], description: 'A door opens in May.', stars: 4 };

const player = () => useJourneyPlayer.getState();
let served: JourneyContent;

/** Board on the platform (no storyboard wait) and ride to station `id`: its title card. */
async function rideTo(id: string) {
  await player().board('newyear-2027', 'theo', 'theo', 'en', { platform: true });
  player().goTo(IDX[id]);
  await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
  expect(player()).toMatchObject({ chapterIndex: IDX[id], stage: 'title', status: 'paused' });
}

/** Career: title → pick a card → its free part → (8 s) its first lock. */
async function rideToCareerLock() {
  await rideTo('career');
  player().beginStation();
  player().pickCard(1);
  player().beginReading();
  await jest.advanceTimersByTimeAsync(100);
  expect(player()).toMatchObject({ status: 'playing', partIndex: 0 });
  await jest.advanceTimersByTimeAsync(8500);
  expect(player()).toMatchObject({ moment: 'locked', momentId: 'career#0', stage: '' });
}

beforeEach(() => {
  jest.useFakeTimers();
  served = content();
  useSavedJourneys.setState({ journeys: [], unlocks: {}, heard: {} });
  useCoins.setState({ balance: null, products: [], shopOpen: false });
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'me', isUser: true, birthDate: '1990-01-01', gender: 'male' } });
  jest.spyOn(api, 'fetchJourneyContent').mockImplementation(async () => ({ content: served, coinBalance: 500 }));
  jest.spyOn(api, 'narrationUrl').mockResolvedValue(null);
  fetchMock.mockReset();
});

afterEach(() => {
  player().stop();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('reading the server (v2)', () => {
  it('maps parts with labels and the station card; a locked part never carries text or cards', async () => {
    (api.fetchJourneyContent as jest.Mock).mockRestore();
    fetchMock.mockResolvedValueOnce(reply(200, {
      success: true, journey: 'newyear-2027', year: 2027, counselor: 'theo', moment_price: 100, coin_balance: 250,
      chapters: [
        { id: 'intro', narration: 'Hello.', cards: [] },
        { id: 'wealth', narration: 'Free.', cards: [], card: { title: '새로운 도약', line: 'line' }, parts: [
          { moment_id: null, unlocked: true, label: null, teaser: null, text: 'Free.', cards: [] },
          { moment_id: 'wealth#0', unlocked: false, label: '수입 상승 시기', teaser: 'Shall we?', text: 'leaked', cards: [{ at: 0.5 }] },
          { moment_id: 'wealth#1', unlocked: true, label: '투자와 큰돈', teaser: 'T', text: 'Paid.', cards: [] },
        ] },
      ],
      summary: { best_months: [], caution_months: [], keywords: ['a'], months: [] },
    }));
    const r = await api.fetchJourneyContent('newyear-2027', 'theo', 'en', null);
    if (!('content' in r)) throw new Error('expected content');
    expect(r.coinBalance).toBe(250);
    expect(r.content.momentPrice).toBe(100);
    expect(r.content.chapters[0].parts).toEqual([{ momentId: null, unlocked: true, label: null, teaser: null, text: 'Hello.', cards: [] }]);
    expect(r.content.chapters[0].card).toBeNull();
    const w = r.content.chapters[1];
    expect(w.card).toEqual({ title: '새로운 도약', line: 'line' });
    expect(w.parts![1]).toEqual({ momentId: 'wealth#0', unlocked: false, label: '수입 상승 시기', teaser: 'Shall we?', text: null, cards: [] });
    expect(w.parts![2]).toMatchObject({ label: '투자와 큰돈', text: 'Paid.' });
  });

  it('unlockMoment reads every answer of the unlock route', async () => {
    const req = { journeyId: 'newyear-2027', momentId: 'career#0', tone: 'theo', lang: 'en' as const };
    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('career#0', 0, 380)));
    expect(await unlockMoment(req)).toMatchObject({ ok: true, charged: 0, coinBalance: 380 });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ moment_id: 'career#0', tone: 'theo', lang: 'en' });
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/journeys\/newyear-2027\/unlock$/);
    fetchMock.mockResolvedValueOnce(reply(402, { error_code: 'INSUFFICIENT_COINS', price: 100, coin_balance: 30 }));
    expect(await unlockMoment(req)).toEqual({ ok: false, reason: 'insufficient', price: 100, coinBalance: 30 });
    fetchMock.mockResolvedValueOnce(reply(404, { error_code: 'UNKNOWN_MOMENT' }));
    expect(await unlockMoment(req)).toEqual({ ok: false, reason: 'unknown' });
    fetchMock.mockResolvedValueOnce(reply(503, { error: 'generation failed' }));
    expect(await unlockMoment(req)).toEqual({ ok: false, reason: 'failed' });
  });
});

describe('the station flow', () => {
  it('a numbered station waits on its title card; career picks a card before its reading', async () => {
    await rideTo('career');
    player().play();
    expect(player().status).toBe('paused');
    player().beginStation();
    expect(player().stage).toBe('pick');
    player().beginReading();
    expect(player().stage).toBe('pick');   // nothing picked yet
    player().pickCard(2);
    player().pickCard(0);                  // the first pick stands
    expect(player().pickedCard).toBe(2);
    player().beginReading();
    await jest.advanceTimersByTimeAsync(100);
    expect(player()).toMatchObject({ stage: '', status: 'playing', partIndex: 0, moment: '' });
  });

  it('the free part ends at the lock with the server teaser, no text, shot close', async () => {
    await rideToCareerLock();
    const p = player();
    expect(p.status).toBe('paused');
    expect(currentPart(p)?.text).toBeNull();
    expect(teaserOf(p)).toBe('Offer career#0');
    expect(cabinMomentOf(p).shot).toBe('close');
    expect(useCoins.getState().balance).toBe(500);
  });

  it('"later" at a lock rides on to the next station; the part stays locked', async () => {
    await rideToCareerLock();
    player().later();
    expect(player().status).toBe('transition');
    expect(player().moment).toBe('');
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
    expect(player()).toMatchObject({ chapterIndex: IDX.wealth, stage: 'title' });
    expect(player().content?.chapters[IDX.career].parts![1].unlocked).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forward travel is free: next at a lock is "later", and a station ahead can be reached', async () => {
    await rideToCareerLock();
    player().next();
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
    expect(player().chapterIndex).toBe(IDX.wealth);
    player().goTo(IDX.monthly);
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
    expect(player()).toMatchObject({ chapterIndex: IDX.monthly, stage: 'title' });
  });

  it('a station whose parts are all done ends on "next station", then rides on', async () => {
    served = content(['love#0', 'love#1']);
    await rideTo('love');
    player().beginStation();
    await jest.advanceTimersByTimeAsync(8500);
    expect(player()).toMatchObject({ partIndex: 1, moment: 'premium', momentId: 'love#0' });
    await jest.advanceTimersByTimeAsync(8500);
    expect(player()).toMatchObject({ partIndex: 2, moment: 'premium', momentId: 'love#1' });
    await jest.advanceTimersByTimeAsync(8500);
    expect(player()).toMatchObject({ stage: 'stationEnd', moment: '' });
    expect(fetchMock).not.toHaveBeenCalled();
    player().nextStation();
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 50);
    expect(player().chapterIndex).toBe(IDX.health);
  });

  it('the ending station ends on "finish", and finish completes the journey', async () => {
    await rideTo('overall');
    player().goTo(IDX.outro);
    await jest.advanceTimersByTimeAsync(TRANSITION_MS + 100);
    expect(player()).toMatchObject({ chapterIndex: IDX.outro, status: 'playing', stage: '' });
    await jest.advanceTimersByTimeAsync(8500);
    expect(player().stage).toBe('ending');
    player().finish();
    expect(player().status).toBe('done');
  });
});

describe('unlocking', () => {
  it('a topic #0: premium, the reveal card, then its part — the card is not raised twice', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('career#0', 100, 400, [revealCard])));
    await rideToCareerLock();
    const seq = player().cueSeq;
    await player().unlock();
    expect(player()).toMatchObject({ moment: 'premium', stage: 'reveal', status: 'paused' });
    expect(player().reveal?.title).toBe('The turn');
    expect(useCoins.getState().balance).toBe(400);
    expect(player().content?.summary.months.map(m => m.month)).toEqual([5]);
    expect(useSavedJourneys.getState().unlocksOf('newyear-2027')).toEqual(['career#0']);
    await jest.advanceTimersByTimeAsync(CUE_AFTER_UNLOCK_MS);
    expect(player()).toMatchObject({ cue: 'coins', cueSeq: seq + 1 });
    player().continueReveal();
    await jest.advanceTimersByTimeAsync(5000);
    expect(player()).toMatchObject({ status: 'playing', stage: '', partIndex: 1 });
    expect(currentPart(player())?.text).toBe('The paid career#0 line.');
    expect(player().activeCard).toBeNull();
    // Then the second paid part's lock.
    await jest.advanceTimersByTimeAsync(4000);
    expect(player()).toMatchObject({ moment: 'locked', momentId: 'career#1' });
  });

  it('INSUFFICIENT_COINS: stays locked, records nothing, the balance is the server\'s', async () => {
    fetchMock.mockResolvedValueOnce(reply(402, { error_code: 'INSUFFICIENT_COINS', price: 100, coin_balance: 30 }));
    await rideToCareerLock();
    await player().unlock();
    expect(player()).toMatchObject({ moment: 'locked', unlockError: 'insufficient', unlocking: false });
    expect(useCoins.getState().balance).toBe(30);
    expect(player().content?.chapters[IDX.career].parts![1].unlocked).toBe(false);
    expect(useSavedJourneys.getState().unlocksOf('newyear-2027')).toEqual([]);
  });

  it('charged: 0 (already unlocked on the account) plays the same way', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('career#0', 0, 500)));
    await rideToCareerLock();
    await player().unlock();
    await jest.advanceTimersByTimeAsync(100);
    expect(player()).toMatchObject({ moment: 'premium', status: 'playing', partIndex: 1 });
  });

  it('cueSeq only grows — across a stop and a second unlock', async () => {
    fetchMock.mockResolvedValue(reply(200, unlockBody('career#0')));
    await rideToCareerLock();
    await player().unlock();
    await jest.advanceTimersByTimeAsync(CUE_AFTER_UNLOCK_MS + 100);
    const first = player().cueSeq;
    player().stop();
    expect(player().cueSeq).toBe(first);
    await rideToCareerLock();
    await player().unlock();
    await jest.advanceTimersByTimeAsync(CUE_AFTER_UNLOCK_MS + 100);
    // Only grows: the second ride's explanation effects (career's cityLights) and its unlock cue both
    // count on from where the first ride left off.
    expect(player().cueSeq).toBeGreaterThan(first);
    expect(player().cue).toBe('coins');
  });
});

describe('wealth branch', () => {
  it('the part chosen is offered first, the other one after it', async () => {
    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('wealth#1')));
    await rideTo('wealth');
    player().beginStation();
    await jest.advanceTimersByTimeAsync(8500);
    expect(player().stage).toBe('branch');
    player().chooseBranch(2);
    expect(player()).toMatchObject({ moment: 'locked', momentId: 'wealth#1', stage: '' });
    await player().unlock();
    await jest.advanceTimersByTimeAsync(100);
    // wealth#1 is not a #0: no reveal card, straight into its part.
    expect(player()).toMatchObject({ status: 'playing', partIndex: 2, moment: 'premium' });
    await jest.advanceTimersByTimeAsync(9000);
    expect(player()).toMatchObject({ moment: 'locked', momentId: 'wealth#0', partIndex: 1 });
  });
});

describe('monthly quarters', () => {
  async function toQuarters() {
    await rideTo('monthly');
    player().beginStation();
    await jest.advanceTimersByTimeAsync(8500);
    expect(player()).toMatchObject({ stage: 'quarters', moment: '' });
  }

  it('open in any order, each back to the list; a short wallet keeps the list up', async () => {
    await toQuarters();
    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('monthly#3')));
    await player().playQuarter(4);
    await jest.advanceTimersByTimeAsync(100);
    expect(player()).toMatchObject({ stage: '', status: 'playing', partIndex: 4, moment: 'premium', momentId: 'monthly#3' });
    await jest.advanceTimersByTimeAsync(9000);
    expect(player().stage).toBe('quarters');

    fetchMock.mockResolvedValueOnce(reply(402, { error_code: 'INSUFFICIENT_COINS', price: 100, coin_balance: 20 }));
    await player().playQuarter(1);
    expect(player()).toMatchObject({ stage: 'quarters', moment: '', unlockError: 'insufficient' });
    expect(useCoins.getState().balance).toBe(20);

    fetchMock.mockResolvedValueOnce(reply(200, unlockBody('monthly#0')));
    await player().playQuarter(1);
    await jest.advanceTimersByTimeAsync(100);
    expect(player()).toMatchObject({ partIndex: 1, moment: 'premium', momentId: 'monthly#0' });
    const opened = player().content!.chapters[IDX.monthly].parts!.filter(p => p.unlocked && p.momentId).map(p => p.momentId);
    expect(opened.sort()).toEqual(['monthly#0', 'monthly#3']);
  });

  it('an open quarter plays without asking the server', async () => {
    served = content(['monthly#1']);
    await toQuarters();
    await player().playQuarter(2);
    await jest.advanceTimersByTimeAsync(100);
    expect(player()).toMatchObject({ status: 'playing', partIndex: 2, moment: 'premium' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('resume and the collection', () => {
  it('parts the server already unlocked play straight through, never locked', async () => {
    served = content(['career#0', 'career#1']);
    await rideTo('career');
    player().beginStation();
    player().pickCard(0);
    player().beginReading();
    await jest.advanceTimersByTimeAsync(8600);
    expect(player()).toMatchObject({ status: 'playing', partIndex: 1, moment: 'premium', stage: '' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('counts heard free parts and unlocked paid parts per station (topics n/3, monthly n/4)', async () => {
    served = content(['career#0', 'monthly#2']);
    await rideTo('career');
    player().beginStation();
    player().pickCard(0);
    player().beginReading();
    await jest.advanceTimersByTimeAsync(8600);
    const rows = collectionOf(NEWYEAR_2027, player().content, useSavedJourneys.getState().heard['newyear-2027'] ?? []);
    const by = Object.fromEntries(rows.map(r => [r.chapterId, `${r.opened}/${r.total}`]));
    expect(by).toEqual({ career: '2/3', wealth: '0/3', love: '0/3', health: '0/3', overall: '0/3', monthly: '1/4' });
    expect(rows.map(r => r.number)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('a coin journey never goes through the pass screen', () => {
    expect(journeyEntryRoute(NEWYEAR_2027)).toBe('JourneyCounselor');
    expect(journeyEntryRoute({ ...NEWYEAR_2027, pass: true })).toBe('JourneyPass');
  });
});

describe('JOURNEY_STATE carries the moment', () => {
  it('posts moment, cue, cueSeq and shot, and replays them on JOURNEY_READY', () => {
    const posted: { type: string; payload?: unknown }[] = [];
    const bridge = new NativeUnityBridge();
    bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
    bridge.openJourneyRoom({ journeyId: 'newyear-2027', counselorId: 'theo', lang: 'ko' });
    const base: JourneyStatePayload = {
      scene: 'arrival', status: 'paused', transitionTo: '', transitionMs: 2800, month: 4, speaking: false, rough: 0,
    };
    bridge.sendJourneyState({ ...base, ...cabinMomentOf({ moment: 'locked', cue: 'coins', cueSeq: 3 }) });
    bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
    const states = posted.filter(p => p.type === 'JOURNEY_STATE').map(p => p.payload as JourneyStatePayload);
    expect(states.length).toBeGreaterThanOrEqual(2);
    for (const st of states) expect(st).toMatchObject({ moment: 'locked', cue: 'coins', cueSeq: 3, shot: 'close', month: 4 });
    expect(cabinMomentOf({ moment: '', cue: '', cueSeq: 0 }).shot).toBe('wide');
  });

  it('the monthly station rides through the arrival seasons, the end of the line is the ending scene', () => {
    const scene = (id: string) => {
      const bg = NEWYEAR_2027.chapters[IDX[id]].background;
      return bg.type === 'scene' ? bg.scene : '';
    };
    expect(scene('monthly')).toBe('arrival');
    expect(scene('outro')).toBe('ending');
  });
});
