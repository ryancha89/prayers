/**
 * One store-purchase routine (storeBuy.ts) for every store product. Pinned: coin packs AND the
 * journey pass both go through `buyWithStore`, and each still sends the body its server route has
 * always had — the dev pass confirmation with the platform only, a store one with the receipt — and
 * a purchase the server refused is never consumed.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/tickets/providers/purchase', () => ({
  storeAvailable: jest.fn(() => true),
  buyProduct: jest.fn(),
  finishPurchase: jest.fn(async () => {}),
  productPrice: jest.fn(async () => null),
}));
jest.mock('../src/features/tickets/providers/storeBuy', () => {
  const actual = jest.requireActual('../src/features/tickets/providers/storeBuy');
  return { ...actual, buyWithStore: jest.fn(actual.buyWithStore) };
});

import { authedFetch } from '../src/features/auth/api/headers';
import { buyProduct, finishPurchase, storeAvailable } from '../src/features/tickets/providers/purchase';
import { buyWithStore } from '../src/features/tickets/providers/storeBuy';
import { buyCoins } from '../src/features/coins/api/coinsApi';
import { buyJourneyPass } from '../src/features/journey/api/journeyApi';
import { formatCoins, formatKrw } from '../src/features/coins/format';

const fetchMock = authedFetch as jest.Mock;
const spy = buyWithStore as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const purchase = (productId: string) => ({ platform: 'ios', productId, purchaseToken: 'jws', transactionId: 't-9', raw: { id: 't-9' } });

beforeEach(() => {
  fetchMock.mockReset();
  spy.mockClear();
  (buyProduct as jest.Mock).mockReset().mockImplementation(async (id: string) => purchase(id));
  (finishPurchase as jest.Mock).mockClear();
  (storeAvailable as jest.Mock).mockReturnValue(true);
});

it('coins and the journey pass both go through buyWithStore', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, coins_added: 500, coin_balance: 600 }));
  await buyCoins('prayers_coin_500', { dev: false });
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, owned: true }));
  await buyJourneyPass('newyear-2027', 'prayers_journey_2027', false);
  expect(spy.mock.calls.map(c => [c[0].productId, c[0].dev])).toEqual([
    ['prayers_coin_500', false],
    ['prayers_journey_2027', false],
  ]);
  expect(finishPurchase).toHaveBeenCalledTimes(2);
});

it('the pass: dev confirms with the platform only; the store sends the receipt; a refusal is not consumed', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, owned: true }));
  expect(await buyJourneyPass('newyear-2027', 'prayers_journey_2027', true)).toMatchObject({ ok: true });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/journeys\/newyear-2027\/purchase$/);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ platform: 'dev' });
  expect(buyProduct).not.toHaveBeenCalled();

  fetchMock.mockResolvedValueOnce(reply(200, { success: true, owned: true }));
  await buyJourneyPass('newyear-2027', 'prayers_journey_2027', false);
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
    platform: 'ios', product_id: 'prayers_journey_2027', purchase_token: 'jws', transaction_id: 't-9',
  });

  (finishPurchase as jest.Mock).mockClear();
  fetchMock.mockResolvedValueOnce(reply(422, { success: false, error_code: 'PURCHASE_INVALID', owned: false }));
  expect(await buyJourneyPass('newyear-2027', 'prayers_journey_2027', false)).toEqual({
    ok: false, reason: 'refused', confirmed: { owned: false, error: 'PURCHASE_INVALID' },
  });
  expect(finishPurchase).not.toHaveBeenCalled();
});

it('the pass: a cancelled sheet asks the server nothing; no store is `unavailable`', async () => {
  (buyProduct as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));
  expect(await buyJourneyPass('newyear-2027', 'p', false)).toEqual({ ok: false, reason: 'cancelled' });
  (storeAvailable as jest.Mock).mockReturnValue(false);
  expect(await buyJourneyPass('newyear-2027', 'p', false)).toEqual({ ok: false, reason: 'unavailable' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('one coin format and one won format', () => {
  expect(formatCoins(1200)).toBe((1200).toLocaleString());
  expect(formatCoins(null)).toBe('0');
  expect(formatCoins(NaN)).toBe('0');
  const t = (k: string, p?: Record<string, string | number>) => `${k}:${p?.price}`;
  expect(formatKrw(t as never, 9900)).toBe('journey.pass.krw:9,900');
});
