/**
 * Paying from the report book (29-10): the unlock card kept offering "1,000 PC · Unlock the full
 * journey" after the journey was paid. The card reads the report's price, else the ride's, and only
 * the train ever lowered the ride's. Pinned: the unlock reply's `moment_price` is the price from then
 * on — in the report and in the ride's content — even when the reloaded report carries no price, and
 * even when a poll that left before the unlock comes back afterwards with the old one.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));

import * as api from '../src/features/journey/api/journeyApi';
import { authedFetch } from '../src/features/auth/api/headers';
import { useJourneyReport, type ReportState } from '../src/features/journey/report/useJourneyReport';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { useSavedJourneys } from '../src/features/journey/store/savedJourneysStore';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import type { JourneyContent, JourneyReport } from '../src/features/journey/types';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });

const report = (momentPrice: number | undefined, status: JourneyReport['status'] = 'ready'): JourneyReport => ({
  status,
  progress: { done: 1, total: 1 },
  ...(momentPrice != null ? { momentPrice } : {}),
  sections: [{ id: 'career', kind: 'topic', blocks: [{ momentId: 'career#0', unlocked: false, label: 'L', teaser: 'T', paragraphs: null }] }],
});
const content = (): JourneyContent => ({
  journey: 'newyear-2027', year: 2027, counselor: 'theo', momentPrice: 1000,
  chapters: [{ id: 'career', narration: '', cards: [], parts: [], card: null }],
  summary: { bestMonths: [], cautionMonths: [], keywords: [], months: [] },
});
const unlockReply = (moment_price?: number) => reply(200, {
  success: true, moment_id: 'career#0', charged: 1000, coin_balance: 200,
  ...(moment_price != null ? { moment_price } : {}),
  part: { moment_id: 'career#0', unlocked: true, label: 'L', teaser: 'T', text: 'Paid.', cards: [] },
  summary: null,
});

let state!: ReportState;
const Probe: React.FC = () => {
  state = useJourneyReport('newyear-2027', 'theo', 'theo', 'en');
  return null;
};

let tree: ReactTestRenderer.ReactTestRenderer | null = null;
beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  useSavedJourneys.setState({ journeys: [], unlocks: {}, heard: {} });
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'me', isUser: true, birthDate: '1990-01-01', gender: 'male' } });
  useJourneyPlayer.setState({ journeyId: 'newyear-2027', counselorId: 'theo', tone: 'theo', content: content() });
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  useJourneyPlayer.getState().stop();
  jest.restoreAllMocks();
  jest.useRealTimers();
});

it('the unlock reply sets the price in the report and the ride, even if the reload carries none', async () => {
  const fetchReport = jest.spyOn(api, 'fetchJourneyReport')
    .mockResolvedValueOnce(report(1000))
    .mockResolvedValueOnce(report(undefined));
  await act(async () => { tree = ReactTestRenderer.create(<Probe />); });
  await flush();
  expect(state.report?.momentPrice).toBe(1000);

  fetchMock.mockResolvedValueOnce(unlockReply(0));
  await act(async () => { await state.unlock('career#0'); });
  await flush();
  expect(fetchReport).toHaveBeenCalledTimes(2);
  expect(state.report?.momentPrice).toBeUndefined();          // the reload's own (old-server) shape…
  expect(useJourneyPlayer.getState().content?.momentPrice).toBe(0); // …so the card falls back to this: 0
});

it('a poll that left before the unlock does not bring the old price back', async () => {
  let late!: (r: JourneyReport) => void;
  jest.spyOn(api, 'fetchJourneyReport')
    .mockResolvedValueOnce(report(1000, 'generating'))                 // first fetch: keep polling
    .mockImplementationOnce(() => new Promise(r => { late = r; }))     // the poll in flight
    .mockResolvedValueOnce(report(0, 'generating'));                   // the reload after the unlock
  await act(async () => { tree = ReactTestRenderer.create(<Probe />); });
  await flush();
  await act(async () => { jest.advanceTimersByTime(4000); });
  await flush();

  fetchMock.mockResolvedValueOnce(unlockReply(0));
  await act(async () => { await state.unlock('career#0'); });
  await flush();
  expect(state.report?.momentPrice).toBe(0);

  await act(async () => { late(report(1000, 'generating')); });
  await flush();
  expect(state.report?.momentPrice).toBe(0);
  expect(useJourneyPlayer.getState().content?.momentPrice).toBe(0);
});

it('the price is the server\'s, not an assumed 0', async () => {
  jest.spyOn(api, 'fetchJourneyReport').mockResolvedValueOnce(report(1000)).mockResolvedValueOnce(report(undefined));
  await act(async () => { tree = ReactTestRenderer.create(<Probe />); });
  await flush();
  fetchMock.mockResolvedValueOnce(unlockReply(300));
  await act(async () => { await state.unlock('career#0'); });
  await flush();
  expect(useJourneyPlayer.getState().content?.momentPrice).toBe(300);
});
