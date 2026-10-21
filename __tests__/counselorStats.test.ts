import { fetchCounselorStats, refreshCounselorStats } from '../src/features/counselors/api/counselorStats';
import { useCounselorStats } from '../src/features/counselors/store/counselorStatsStore';

const mockFetch = jest.fn();
jest.mock('../src/features/auth/api/headers', () => ({
  authedFetch: (...args: unknown[]) => mockFetch(...args),
}));
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://api' }));

const answer = (status: number, body: unknown) => ({ ok: status === 200, status, json: async () => body });

beforeEach(() => {
  mockFetch.mockReset();
  useCounselorStats.setState({ counts: null });
});

it('reads the counts by card id from prayers/counselors/stats, dropping junk and zeros', async () => {
  mockFetch.mockResolvedValue(answer(200, { success: true, counts: { yuna: 37, theo: '2', jiho: 0, x: 'nope' } }));
  await expect(fetchCounselorStats()).resolves.toEqual({ yuna: 37, theo: 2 });
  expect(mockFetch.mock.calls[0][0]).toBe('http://api/api/v1/prayers/counselors/stats');
  expect(mockFetch.mock.calls[0][1].headers).toEqual({ 'Cache-Control': 'no-cache' });
});

it('is null when the server does not answer, and the store keeps what it had', async () => {
  useCounselorStats.setState({ counts: { yuna: 5 } });
  mockFetch.mockResolvedValue(answer(500, {}));
  await refreshCounselorStats();
  expect(useCounselorStats.getState().counts).toEqual({ yuna: 5 });

  mockFetch.mockRejectedValue(new Error('offline'));
  await expect(fetchCounselorStats()).resolves.toBeNull();
});

it('fills the store on a real answer', async () => {
  mockFetch.mockResolvedValue(answer(200, { success: true, counts: { yunjung: 5 } }));
  await refreshCounselorStats();
  expect(useCounselorStats.getState().counts).toEqual({ yunjung: 5 });
});
