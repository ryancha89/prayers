/**
 * 29-10: the room's coin check used a hard-coded 10, while the server lets turns through free with
 * consult coins off or (development) a wallet that cannot pay — so a dev- account with 0 coins was
 * sent to the coin card for every question. The price now comes from prayers/tickets_balance.
 */
const mockFetch = jest.fn();
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: (...a: unknown[]) => mockFetch(...a) }));
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://srv' }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ CONSULT_COST: 10 }));
import { canAffordTurn, consultCostOf, fetchConsultPrice } from '../src/features/counseling/api/consultPrice';

const reply = (body: unknown, ok = true) => mockFetch.mockResolvedValueOnce({ ok, json: async () => body });

beforeEach(() => mockFetch.mockReset());

it('reads the server price, 0 included; an old server without one keeps 10', () => {
  expect(consultCostOf({ consult_cost: 0 })).toBe(0);
  expect(consultCostOf({ consult_cost: 10 })).toBe(10);
  expect(consultCostOf({ coin_balance: 3 })).toBe(10);
  expect(consultCostOf({ consult_cost: 'free' })).toBe(10);
  expect(consultCostOf(null)).toBe(10);
});

it('a free turn goes out on an empty wallet; a priced one does not', () => {
  expect(canAffordTurn(0, 0)).toBe(true);
  expect(canAffordTurn(0, 10)).toBe(false);
  expect(canAffordTurn(9, 10)).toBe(false);
  expect(canAffordTurn(10, 10)).toBe(true);
  // Not known yet: the server is the one to refuse.
  expect(canAffordTurn(null, 10)).toBe(true);
});

it('fetches balance and price from tickets_balance', async () => {
  reply({ success: true, tickets_size: 0, coin_balance: 0, consult_cost: 0, pro_consult_cost: 0 });
  await expect(fetchConsultPrice()).resolves.toEqual({ balance: 0, cost: 0 });
  expect(mockFetch.mock.calls[0][0]).toBe('http://srv/api/v1/prayers/tickets_balance');

  reply({ success: true, coin_balance: 25 });
  await expect(fetchConsultPrice()).resolves.toEqual({ balance: 25, cost: 10 });
});

it('no answer is null, so the caller keeps what it had', async () => {
  reply({}, false);
  await expect(fetchConsultPrice()).resolves.toBeNull();
  mockFetch.mockResolvedValueOnce(null);
  await expect(fetchConsultPrice()).resolves.toBeNull();
  mockFetch.mockRejectedValueOnce(new Error('offline'));
  await expect(fetchConsultPrice()).resolves.toBeNull();
});
