/**
 * Spec 010's shared sitting lifecycle (contract.md §3), below the screens: the clock starts only
 * when BOTH the server's start answered AND the scene settled (or its 4.5 s fallback fired),
 * TOO_EARLY is waited out and retried three times, and leaving asks nothing of the server.
 */
import React, { useEffect } from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
const mockApi = { startMeditation: jest.fn(), finishMeditation: jest.fn() };
jest.mock('../src/features/meditations/api/meditationsApi', () => ({
  ...jest.requireActual('../src/features/meditations/api/meditationsApi'),
  startMeditation: (...a: unknown[]) => mockApi.startMeditation(...a),
  finishMeditation: (...a: unknown[]) => mockApi.finishMeditation(...a),
}));

import { SETTLE_FALLBACK_MS, useMeditationSession, type UseMeditationSession } from '../src/features/meditations/useMeditationSession';

/** The hook under a probe: the latest render's value, reachable from the test. */
function mount(opts: Parameters<typeof useMeditationSession>[0] & { autoBegin?: number }) {
  const out: { current: UseMeditationSession | null } = { current: null };
  const Probe: React.FC = () => {
    const s = useMeditationSession(opts);
    out.current = s;
    useEffect(() => {
      if (opts.autoBegin != null) s.begin(opts.autoBegin);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  };
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<Probe />);
  });
  return { out, tree };
}

const settle = async () => {
  await act(async () => {
    await Promise.resolve();
  });
};

beforeEach(() => {
  jest.useFakeTimers();
  Object.values(mockApi).forEach(f => f.mockReset());
});
afterEach(() => jest.useRealTimers());

it('does not run until BOTH the server answered and the scene settled', async () => {
  let answer!: (v: unknown) => void;
  mockApi.startMeditation.mockReturnValue(new Promise(r => { answer = r; }));
  const { out } = mount({ kind: 'snow_mountain', autoBegin: 3 });
  await settle();
  expect(out.current!.step).toBe('starting');

  // The scene settles first: still waiting on the server.
  act(() => out.current!.settle());
  expect(out.current!.step).toBe('starting');

  await act(async () => { answer({ ok: true, session: { id: 7, kind: 'snow_mountain', minutes: 3, status: 'started' } }); });
  expect(out.current!.step).toBe('running');
  expect(out.current!.minutes).toBe(3);
});

it('falls back to running 4.5 s after start when the scene never settles', async () => {
  const onRunning = jest.fn();
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 8, kind: 'moktak', minutes: 60, status: 'started' } });
  const { out } = mount({ kind: 'moktak', autoBegin: undefined as unknown as number, onRunning });
  await act(async () => { out.current!.begin(); });
  expect(out.current!.step).toBe('starting');
  await act(async () => { jest.advanceTimersByTime(SETTLE_FALLBACK_MS); });
  expect(out.current!.step).toBe('running');
  expect(onRunning).toHaveBeenCalledTimes(1);
});

it('keeps one request_id across a failed start, drops it after a good one', async () => {
  mockApi.startMeditation.mockResolvedValueOnce({ ok: false, kind: 'failed' });
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 9, kind: 'moktak', minutes: 60, status: 'started' } });
  const { out } = mount({ kind: 'moktak' });
  await act(async () => { out.current!.begin(); });
  expect(out.current!.step).toBe('idle');
  expect(out.current!.error).toBe('meditations.error.start');
  await act(async () => { out.current!.begin(); });
  const first = (mockApi.startMeditation.mock.calls[0][0] as { requestId: string }).requestId;
  const second = (mockApi.startMeditation.mock.calls[1][0] as { requestId: string }).requestId;
  expect(second).toBe(first); // the retry is the same sitting
});

it('waits out TOO_EARLY and retries three times before erring', async () => {
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 10, kind: 'moktak', minutes: 60, status: 'started' } });
  mockApi.finishMeditation.mockResolvedValue({ ok: false, kind: 'tooEarly', secondsLeft: 5 });
  const { out } = mount({ kind: 'moktak' });
  await act(async () => { out.current!.begin(); });
  await act(async () => { jest.advanceTimersByTime(SETTLE_FALLBACK_MS); });
  act(() => out.current!.finish({ taps: 108 }));
  await settle();
  expect(out.current!.step).toBe('finishing');
  expect(mockApi.finishMeditation).toHaveBeenCalledTimes(1);
  await act(async () => { jest.advanceTimersByTime(5000); });
  await settle();
  expect(mockApi.finishMeditation).toHaveBeenCalledTimes(2);
  await act(async () => { jest.advanceTimersByTime(5000); });
  await settle();
  expect(mockApi.finishMeditation).toHaveBeenCalledTimes(3);
  // The third refusal is final: the error shows, no fourth ask is armed.
  expect(out.current!.error).toBe('meditations.error.finish');
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(mockApi.finishMeditation).toHaveBeenCalledTimes(3);
  expect(mockApi.finishMeditation).toHaveBeenCalledWith({ id: 10, taps: 108 });
});

it('carries the server reward and level_up into the result', async () => {
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 11, kind: 'snow_mountain', minutes: 3, status: 'started' } });
  mockApi.finishMeditation.mockResolvedValue({
    ok: true,
    reward: { xp: 30, gold: 15, energy: 30, percent: 100, dayIndex: 1 },
    levelUp: true,
    levelBefore: 1,
    garden: null,
  });
  const { out } = mount({ kind: 'snow_mountain', autoBegin: 3 });
  await settle();
  act(() => out.current!.settle());
  await settle();
  act(() => out.current!.finish());
  await settle();
  expect(out.current!.step).toBe('result');
  expect(out.current!.result).toMatchObject({ reward: { xp: 30, gold: 15 }, levelUp: true, levelBefore: 1 });
});

it('leaving asks nothing of the server — abandon is just leaving', async () => {
  mockApi.startMeditation.mockResolvedValue({ ok: true, session: { id: 12, kind: 'moktak', minutes: 60, status: 'started' } });
  const { out } = mount({ kind: 'moktak' });
  await act(async () => { out.current!.begin(); });
  await act(async () => { jest.advanceTimersByTime(SETTLE_FALLBACK_MS); });
  expect(out.current!.step).toBe('running');
  act(() => out.current!.leave());
  expect(out.current!.step).toBe('idle');
  await act(async () => { jest.advanceTimersByTime(60_000); });
  expect(mockApi.finishMeditation).not.toHaveBeenCalled();
});
