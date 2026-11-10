/**
 * Spec 010 against saju_server, below the screen (contract.md §1): the menu is read as the server
 * sends it (the server computes every reward — nothing here does), a start carries request_id /
 * kind / minutes / local_date, a finish reports taps, and TOO_EARLY and SESSION_CLOSED are told
 * apart from a plain failure — gardenApi's discipline, on the meditations routes.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import { authedFetch } from '../src/features/auth/api/headers';
import { fetchMeditations, finishMeditation, startMeditation } from '../src/features/meditations/api/meditationsApi';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });

const MENU = {
  success: true,
  experiences: [
    { kind: 'moktak', taps: 108, min_seconds: 240, reward: { xp: 60, gold: 30, energy: 60 } },
    {
      kind: 'snow_mountain',
      breath: { in_ms: 4000, hold_ms: 4000, out_ms: 6000 },
      durations: [
        { minutes: 3, xp: 30, gold: 15, energy: 30 },
        { minutes: 5, xp: 60, gold: 30, energy: 60 },
        { minutes: 10, xp: 150, gold: 75, energy: 150 },
        { minutes: 20, xp: 330, gold: 165, energy: 330 },
      ],
    },
  ],
  today: { local_date: '2026-11-09', finished: 1, next_percent: 100 },
  garden: null,
  session: null,
};

beforeEach(() => fetchMock.mockReset());

it('reads the canonical menu: both experiences, the shared day counter, the 20-minute row', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, MENU));
  const res = await fetchMeditations('2026-11-09');
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/meditations\?local_date=2026-11-09$/);
  expect(res?.moktak).toEqual({ taps: 108, minSeconds: 240, reward: { xp: 60, gold: 30, energy: 60 } });
  expect(res?.snow?.breath).toEqual({ inMs: 4000, holdMs: 4000, outMs: 6000 });
  expect(res?.snow?.durations.map(d => d.minutes)).toEqual([3, 5, 10, 20]);
  expect(res?.snow?.durations[3]).toEqual({ minutes: 20, xp: 330, gold: 165, energy: 330 });
  expect(res?.today).toEqual({ localDate: '2026-11-09', finished: 1, nextPercent: 100 });
});

it('is null when the menu cannot be read', async () => {
  fetchMock.mockResolvedValueOnce(reply(401, { error_code: 'USER_NOT_FOUND' }));
  expect(await fetchMeditations()).toBeNull();
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  expect(await fetchMeditations()).toBeNull();
});

it('starts a snow sitting with request_id, kind, minutes and the phone date', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, {
    success: true, replayed: false,
    session: { id: 71, kind: 'snow_mountain', minutes: 20, status: 'started', local_date: '2026-11-09' },
  }));
  const res = await startMeditation({ requestId: 'req-12345678', kind: 'snow_mountain', minutes: 20, date: '2026-11-09' });
  expect(res).toEqual({ ok: true, session: { id: 71, kind: 'snow_mountain', minutes: 20, status: 'started' } });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    request_id: 'req-12345678', kind: 'snow_mountain', minutes: 20, local_date: '2026-11-09',
  });
});

it('starts a moktak sitting WITHOUT minutes — the server stores its own nominal length', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, {
    success: true, session: { id: 72, kind: 'moktak', minutes: 60, status: 'started' },
  }));
  await startMeditation({ requestId: 'req-12345678', kind: 'moktak', date: '2026-11-09' });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    request_id: 'req-12345678', kind: 'moktak', local_date: '2026-11-09',
  });
});

it('finishes with the taps and reads the reward as the server paid it', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, {
    success: true, replayed: false,
    session: { id: 72, kind: 'moktak', status: 'finished', taps: 108 },
    reward: { xp: 60, gold: 30, energy: 60, percent: 50, day_index: 3 },
    level_up: false, level_before: 2,
    garden: null,
  }));
  const res = await finishMeditation({ id: 72, taps: 108 });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/meditations\/72\/finish$/);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ taps: 108 });
  expect(res).toMatchObject({
    ok: true,
    reward: { xp: 60, gold: 30, energy: 60, percent: 50, dayIndex: 3 },
    levelUp: false,
    levelBefore: 2,
  });
});

it('tells TOO_EARLY and SESSION_CLOSED apart from a plain failure', async () => {
  fetchMock.mockResolvedValueOnce(reply(422, { error_code: 'TOO_EARLY', seconds_left: 42 }));
  expect(await finishMeditation({ id: 1 })).toEqual({ ok: false, kind: 'tooEarly', secondsLeft: 42 });
  fetchMock.mockResolvedValueOnce(reply(409, { error_code: 'SESSION_CLOSED', status: 'abandoned' }));
  expect(await finishMeditation({ id: 1 })).toEqual({ ok: false, kind: 'closed', status: 'abandoned' });
  fetchMock.mockResolvedValueOnce(reply(500, null));
  expect(await finishMeditation({ id: 1 })).toEqual({ ok: false, kind: 'failed' });
});
