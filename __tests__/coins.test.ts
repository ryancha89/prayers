/**
 * The coin wallet and its shop (01-10): the server owns the balance and verifies every purchase;
 * the client consumes a store purchase only after the server said yes, so a refused one is
 * re-delivered rather than lost. A replay of the same store transaction adds nothing.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/tickets/providers/purchase', () => ({
  storeAvailable: jest.fn(() => true),
  buyProduct: jest.fn(),
  finishPurchase: jest.fn(async () => {}),
  productPrice: jest.fn(async () => null),
}));

import { authedFetch } from '../src/features/auth/api/headers';
import { buyProduct, finishPurchase, storeAvailable } from '../src/features/tickets/providers/purchase';
import { buyCoins, fetchCoins } from '../src/features/coins/api/coinsApi';
import { useCoins } from '../src/features/coins/store/coinStore';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const purchase = { platform: 'ios', productId: 'prayers_coin_1200', purchaseToken: 'jws', transactionId: 't-1', raw: { id: 't-1' } };

beforeEach(() => {
  fetchMock.mockReset();
  (buyProduct as jest.Mock).mockReset().mockResolvedValue(purchase);
  (finishPurchase as jest.Mock).mockClear();
  (storeAvailable as jest.Mock).mockReturnValue(true);
  useCoins.setState({ balance: null, products: [], shopOpen: false });
});

it('reads the wallet and the four products', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, {
    coin_balance: 120,
    products: [
      { product_id: 'prayers_coin_500', coins: 500, price_krw: 1500, bonus_pct: 0 },
      { product_id: 'prayers_coin_1200', coins: 1200, price_krw: 3300, bonus_pct: 20 },
    ],
  }));
  const w = await fetchCoins();
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/coins$/);
  expect(w).toEqual({
    balance: 120,
    products: [
      { productId: 'prayers_coin_500', coins: 500, priceKrw: 1500, bonusPct: 0 },
      { productId: 'prayers_coin_1200', coins: 1200, priceKrw: 3300, bonusPct: 20 },
    ],
  });
});

it('store purchase: the server verifies, THEN it is consumed, and the balance is the server\'s', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, coins_added: 1200, coin_balance: 1320 }));
  const r = await buyCoins('prayers_coin_1200', { dev: false });
  expect(r).toEqual({ ok: true, coinsAdded: 1200, balance: 1320 });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    platform: 'ios', product_id: 'prayers_coin_1200', purchase_token: 'jws', transaction_id: 't-1',
  });
  expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/coins\/purchase$/);
  expect(finishPurchase).toHaveBeenCalledWith(purchase);
  expect(useCoins.getState().balance).toBe(1320);
});

it('PURCHASE_INVALID: nothing added, and the purchase is NOT consumed', async () => {
  fetchMock.mockResolvedValueOnce(reply(422, { error_code: 'PURCHASE_INVALID' }));
  const r = await buyCoins('prayers_coin_1200', { dev: false });
  expect(r).toEqual({ ok: false, reason: 'invalid' });
  expect(finishPurchase).not.toHaveBeenCalled();
  expect(useCoins.getState().balance).toBeNull();
});

it('a replayed transaction adds 0 and is consumed (it was already counted)', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, coins_added: 0, coin_balance: 1320 }));
  const r = await buyCoins('prayers_coin_1200', { dev: false });
  expect(r).toEqual({ ok: true, coinsAdded: 0, balance: 1320 });
  expect(finishPurchase).toHaveBeenCalledTimes(1);
});

it('a cancelled store sheet asks the server nothing', async () => {
  (buyProduct as jest.Mock).mockRejectedValueOnce(new Error('cancelled'));
  expect(await buyCoins('prayers_coin_500', { dev: false })).toEqual({ ok: false, reason: 'cancelled' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('no store in the build: unavailable, not a broken button', async () => {
  (storeAvailable as jest.Mock).mockReturnValue(false);
  expect(await buyCoins('prayers_coin_500', { dev: false })).toEqual({ ok: false, reason: 'unavailable' });
  expect(buyProduct).not.toHaveBeenCalled();
});

it('dev builds go through the server\'s dev platform, no store', async () => {
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, coins_added: 500, coin_balance: 620 }));
  const r = await buyCoins('prayers_coin_500', { dev: true });
  expect(r).toMatchObject({ ok: true, balance: 620 });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({ platform: 'dev', product_id: 'prayers_coin_500' });
  expect(buyProduct).not.toHaveBeenCalled();
});
