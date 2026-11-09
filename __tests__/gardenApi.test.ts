/**
 * Tree of Mind (spec 008) against saju_server, below the screen: the garden's shape is read as the
 * server sends it (the server computes every reward; nothing here does), TOO_EARLY and SESSION_CLOSED
 * are told apart from a plain failure, and a start sends the request_id and the phone's date.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import { authedFetch } from '../src/features/auth/api/headers';
import { fetchGarden, finishSession, levelProgress, localDate, startSession } from '../src/features/garden/api/gardenApi';
import { energyGlow, gardenInit, nextNoteKey, resultNoteKey, stageKey, xpToNext } from '../src/features/garden/gardenFlow';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const GARDEN = {
  level: 2, stem: '壬', element: 'water', xp: 300, level_xp: 150, level_span: 300, max_level: 10, gold: 105,
  energy_total: 300, sessions_total: 2, minutes_total: 20,
  today: { local_date: '2026-10-22', finished: 2, energy: 300, next_percent: 50 }, variant: null,
};

beforeEach(() => fetchMock.mockReset());

it('reads the garden and the menu as the server sends them', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, {
    success: true, garden: GARDEN,
    durations: [{ minutes: 3, xp: 30, gold: 15, energy: 30 }, { minutes: 5, xp: 60, gold: 30, energy: 60 }, { minutes: 10, xp: 150, gold: 75, energy: 150 }],
    session: null,
  }));
  const res = await fetchGarden('2026-10-22');
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/garden\?local_date=2026-10-22$/);
  expect(res?.garden).toMatchObject({ level: 2, stem: '壬', element: 'water', levelXp: 150, levelSpan: 300, gold: 105, variant: null });
  expect(res?.garden.today).toEqual({ localDate: '2026-10-22', finished: 2, energy: 300, nextPercent: 50 });
  expect(res?.durations.map(d => d.minutes)).toEqual([3, 5, 10]);
  expect(levelProgress(res!.garden)).toBe(0.5);
  expect(xpToNext(res!.garden)).toBe(150);
});

it('is null when the garden cannot be read', async () => {
  fetchMock.mockResolvedValueOnce(reply(401, { error_code: 'USER_NOT_FOUND' }));
  expect(await fetchGarden()).toBeNull();
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect(await fetchGarden()).toBeNull();
});

it('starts with the request_id and the phone date', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, { session: { id: 7, minutes: 5, status: 'started', seconds: 300 }, replayed: false }));
  const res = await startSession({ requestId: 'req-12345678', minutes: 5, date: '2026-10-22' });
  expect(res).toEqual({ ok: true, session: { id: 7, minutes: 5, status: 'started', seconds: 300 } });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ request_id: 'req-12345678', minutes: 5, local_date: '2026-10-22' });
});

it('reads a finish, and tells TOO_EARLY and SESSION_CLOSED from a failure', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, {
    reward: { xp: 15, gold: 7, energy: 30, percent: 50, day_index: 3 }, level_up: true, level_before: 1, garden: GARDEN,
  }));
  const done = await finishSession({ id: 7, breaths: 18, inRhythm: 4 });
  expect(done).toMatchObject({ ok: true, levelUp: true, levelBefore: 1, reward: { xp: 15, gold: 7, energy: 30, percent: 50, dayIndex: 3 } });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ breaths: 18, in_rhythm: 4 });

  fetchMock.mockResolvedValueOnce(reply(422, { error_code: 'TOO_EARLY', seconds_left: 3 }));
  expect(await finishSession({ id: 7, breaths: 0, inRhythm: 0 })).toEqual({ ok: false, kind: 'tooEarly', secondsLeft: 3 });
  fetchMock.mockResolvedValueOnce(reply(409, { error_code: 'SESSION_CLOSED', status: 'abandoned' }));
  expect(await finishSession({ id: 7, breaths: 0, inRhythm: 0 })).toEqual({ ok: false, kind: 'closed', status: 'abandoned' });
  fetchMock.mockResolvedValueOnce(reply(500, null));
  expect(await finishSession({ id: 7, breaths: 0, inRhythm: 0 })).toEqual({ ok: false, kind: 'failed' });
});

it('words the daily cap and the levels from the server numbers', () => {
  expect(nextNoteKey(100)).toBeNull();
  expect(nextNoteKey(50)).toBe('garden.next.half');
  expect(nextNoteKey(0)).toBe('garden.next.energy');
  expect(resultNoteKey(100)).toBeNull();
  expect(resultNoteKey(50)).toBe('garden.result.half');
  expect(resultNoteKey(0)).toBe('garden.result.energyOnly');
  expect(stageKey(1)).toBe('garden.stage.1');
  expect(stageKey(12)).toBe('garden.stage.10');
  expect(energyGlow(150)).toBe(0.5);
  expect(energyGlow(900)).toBe(1);
  expect(levelProgress({ levelXp: 100, levelSpan: null })).toBe(1);
  expect(localDate(new Date(2026, 0, 5))).toBe('2026-01-05');
});

it('opens Unity at the garden the server described', () => {
  const g = {
    level: 3, stem: '辛', element: 'metal' as const, xp: 525, levelXp: 75, levelSpan: 450, maxLevel: 10, gold: 0,
    energyTotal: 0, today: { localDate: '', finished: 1, energy: 150, nextPercent: 100 }, variant: null,
  };
  expect(gardenInit('vi', g)).toEqual({ lang: 'vi', level: 3, progress: 75 / 450, energy: 0.5, variant: '' });
});
