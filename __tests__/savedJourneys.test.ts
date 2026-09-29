/**
 * 저장한 여행 — a finished journey is kept whole and reopened from the archive, the way the saju
 * app's 나의 리포트 keeps a purchased 신년운세. Pinned: one row per journey × guide (a replay
 * refreshes, never duplicates); the newest ride lists first; opening a saved row puts the player
 * at the terminus with the saved content and no audio.
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

import { savedJourneyId, useSavedJourneys } from '../src/features/journey/store/savedJourneysStore';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { JOURNEYS } from '../src/features/journey/data/journeys';
import type { JourneyContent } from '../src/features/journey/types';

const content = (keyword: string): JourneyContent => ({
  journey: 'newyear-2027',
  year: 2027,
  counselor: 'theo',
  chapters: [{ id: 'intro', narration: 'hello', cards: [] }],
  summary: { bestMonths: [3, 9], cautionMonths: [7], keywords: [keyword], months: [] },
});

beforeEach(() => useSavedJourneys.setState({ journeys: [] }));

describe('saved journeys', () => {
  it('keeps one row per journey × guide and refreshes it on a second ride', () => {
    const s = useSavedJourneys.getState();
    s.save({ journeyId: 'newyear-2027', counselorId: 'theo', tone: 'theo', lang: 'ko', year: 2027, content: content('a') });
    s.save({ journeyId: 'newyear-2027', counselorId: 'theo', tone: 'theo', lang: 'ko', year: 2027, content: content('b') });
    const rows = useSavedJourneys.getState().journeys;
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(savedJourneyId('newyear-2027', 'theo'));
    expect(rows[0].content.summary.keywords).toEqual(['b']);
  });

  it('lists a different guide separately, newest first', () => {
    const s = useSavedJourneys.getState();
    s.save({ journeyId: 'newyear-2027', counselorId: 'theo', tone: 'theo', lang: 'ko', year: 2027, content: content('a') });
    s.save({ journeyId: 'newyear-2027', counselorId: 'yunjung', tone: 'yunjung', lang: 'ko', year: 2027, content: content('b') });
    const ids = useSavedJourneys.getState().list().map(j => j.counselorId);
    expect(ids).toEqual(['yunjung', 'theo']);
  });

  it('opens a saved journey at the terminus with its content and no audio', () => {
    const saved = useSavedJourneys
      .getState()
      .save({ journeyId: 'newyear-2027', counselorId: 'theo', tone: 'theo', lang: 'ko', year: 2027, content: content('a') });
    useJourneyPlayer.getState().openSaved(saved);
    const p = useJourneyPlayer.getState();
    expect(p.status).toBe('done');
    expect(p.journeyId).toBe('newyear-2027');
    expect(p.counselorId).toBe('theo');
    expect(p.content?.summary.keywords).toEqual(['a']);
    expect(p.chapterIndex).toBe(JOURNEYS['newyear-2027'].chapters.length - 1);
  });
});

describe('boarding with the player\'s own chart', () => {
  const { journeyBirthOf } = require('../src/features/journey/api/journeyApi');
  const { useSubjectsStore } = require('../src/features/subjects/store/subjectsStore');

  it('shapes self birth data as base_info.first, hour absent when the time is unknown', () => {
    expect(journeyBirthOf({ id: 'self', displayName: 'me', isUser: true, birthDate: '1989-12-05', birthTime: '00:20', gender: 'male' }))
      .toEqual({ birth_year: 1989, birth_month: 12, birth_day: 5, birth_hour: 0, birth_minute: 20, gender: 'male' });
    const unknown = journeyBirthOf({ id: 'self', displayName: 'me', isUser: true, birthDate: '1995-04-12', gender: 'female' });
    expect(unknown).toEqual({ birth_year: 1995, birth_month: 4, birth_day: 12, birth_minute: 0, gender: 'female' });
    expect('birth_hour' in unknown!).toBe(false);
    expect(journeyBirthOf({ id: 'self', displayName: 'me', isUser: true })).toBeNull();
  });

  it('refuses to board without birth data and names the reason instead of retrying', async () => {
    useSubjectsStore.setState({ self: { id: 'self', displayName: 'Myself', isUser: true } });
    await useJourneyPlayer.getState().board('newyear-2027', 'theo', 'theo', 'ko');
    const p = useJourneyPlayer.getState();
    expect(p.status).toBe('error');
    expect(p.error).toBe('no-chart');
  });
});

describe('the station platform (3D cabin)', () => {
  const api = require('../src/features/journey/api/journeyApi');
  const { useSubjectsStore } = require('../src/features/subjects/store/subjectsStore');

  it('waits on the platform once loaded, and only depart() starts the reading', async () => {
    useSubjectsStore.setState({ self: { id: 'self', displayName: 'me', isUser: true, birthDate: '1990-01-01', gender: 'male' } });
    const spy = jest.spyOn(api, 'fetchJourneyContent').mockResolvedValue({ content: content('p') });
    await useJourneyPlayer.getState().board('newyear-2027', 'theo', 'theo', 'ko', { platform: true });
    expect(useJourneyPlayer.getState().status).toBe('platform');
    expect(useJourneyPlayer.getState().chapterIndex).toBe(0);

    useJourneyPlayer.getState().depart();
    // startChapter awaits the chapter's voice URL (none here: it runs silent) before it plays.
    for (let i = 0; i < 20 && useJourneyPlayer.getState().status === 'platform'; i++)
      await new Promise(r => setImmediate(r));
    expect(useJourneyPlayer.getState().status).toBe('playing');
    spy.mockRestore();
    useJourneyPlayer.getState().stop();
  });

  it('ignores depart() anywhere but the platform', () => {
    useJourneyPlayer.setState({ status: 'paused' });
    useJourneyPlayer.getState().depart();
    expect(useJourneyPlayer.getState().status).toBe('paused');
  });
});
