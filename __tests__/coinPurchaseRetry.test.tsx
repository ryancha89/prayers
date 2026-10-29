/**
 * A coin purchase the store charged for but the server did not confirm (29-10). It used to come back
 * as 'failed' with "Please try again", nothing retried until the next launch, and players paid twice.
 * Pinned here:
 *  · the shop says the payment was received, never "try again",
 *  · the purchase stays unfinished and is confirmed again in this session — on a backoff and on every
 *    return to the foreground — and is credited and consumed once,
 *  · the same pack cannot be bought again while it waits,
 *  · the dev platform (no money taken) still reports a refusal as a refusal.
 */
import React from 'react';
import { AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/tickets/providers/purchase', () => ({
  storeAvailable: jest.fn(() => true),
  buyProduct: jest.fn(),
  finishPurchase: jest.fn(async () => {}),
  productPrice: jest.fn(async () => null),
  storePrices: jest.fn(async () => ({})),
  onStorePurchase: jest.fn(() => () => {}),
  unfinishedPurchases: jest.fn(async () => []),
}));

import { authedFetch } from '../src/features/auth/api/headers';
import { buyProduct, finishPurchase, unfinishedPurchases } from '../src/features/tickets/providers/purchase';
import {
  buyCoins,
  CONFIRM_RETRY_MS,
  resetCoinConfirmsForTests,
  startCoinPurchaseRecovery,
} from '../src/features/coins/api/coinsApi';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useInbox } from '../src/features/myroom/inbox/inboxStore';
import { CoinPackList } from '../src/features/coins/components/CoinPackList';
import { useLanguageStore } from '../src/shared/i18n';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const purchase = { platform: 'ios', productId: 'prayer_coin_1000', purchaseToken: 'jws', transactionId: 't-1', raw: { id: 't-1' } };
const PRODUCTS = [
  { productId: 'prayer_coin_500', baseCoins: 500, coins: 530, priceKrw: 5500, bonusPct: 6 },
  { productId: 'prayer_coin_1000', baseCoins: 1000, coins: 1100, priceKrw: 11000, bonusPct: 10 },
];
const WALLET = {
  coin_balance: 220,
  products: PRODUCTS.map(p => ({ product_id: p.productId, base_coins: p.baseCoins, coins: p.coins, price_krw: p.priceKrw, bonus_pct: p.bonusPct })),
};
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const purchasePosts = () => fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/coins/purchase'));
const coinNotes = () => useInbox.getState().items.filter(i => i.kind === 'coins');

let foreground: ((s: string) => void) | null = null;
let foregroundRemoved = 0;

beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'en' });
  jest.useFakeTimers();
  fetchMock.mockReset();
  (buyProduct as jest.Mock).mockReset().mockResolvedValue(purchase);
  (finishPurchase as jest.Mock).mockClear();
  (unfinishedPurchases as jest.Mock).mockReset().mockResolvedValue([]);
  foreground = null;
  foregroundRemoved = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    foreground = cb;
    return { remove: () => { foregroundRemoved += 1; foreground = null; } };
  }) as never);
  resetCoinConfirmsForTests();
  useCoins.setState({ balance: 220, products: PRODUCTS, shopOpen: false, lateCredit: null });
  useInbox.setState({ items: [] } as never);
});
afterEach(() => {
  resetCoinConfirmsForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('a dropped confirm is held, retried on the backoff, then credited and consumed once', async () => {
  fetchMock
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce(reply(503, null))
    .mockResolvedValueOnce(reply(200, { success: true, coins_added: 1100, coin_balance: 1320 }));
  expect(await buyCoins('prayer_coin_1000', { dev: false })).toEqual({ ok: false, reason: 'awaiting' });
  expect(finishPurchase).not.toHaveBeenCalled();
  expect(useCoins.getState().awaiting).toEqual(['prayer_coin_1000']);

  await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]); });
  await flush();
  expect(purchasePosts()).toHaveLength(2);           // 503: still held
  expect(finishPurchase).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[1]); });
  await flush();
  expect(purchasePosts()).toHaveLength(3);
  // The same store transaction every time: the server's ledger is what keeps it to one credit.
  expect(purchasePosts().map(c => JSON.parse(c[1].body).transaction_id)).toEqual(['t-1', 't-1', 't-1']);
  expect(finishPurchase).toHaveBeenCalledTimes(1);
  expect(finishPurchase).toHaveBeenCalledWith(purchase);
  expect(useCoins.getState().balance).toBe(1320);
  expect(useCoins.getState().awaiting).toEqual([]);
  expect(useCoins.getState().lateCredit).toMatchObject({ productId: 'prayer_coin_1000', coinsAdded: 1100 });
  expect(coinNotes()).toHaveLength(1);
  // Nothing left to confirm: no more timers, and the foreground hook is gone.
  expect(foregroundRemoved).toBe(1);
  await act(async () => { jest.advanceTimersByTime(10 * 60_000); });
  expect(purchasePosts()).toHaveLength(3);
});

it('coming back to the foreground confirms at once, without waiting for the backoff', async () => {
  fetchMock
    .mockResolvedValueOnce(reply(500, null))
    .mockResolvedValueOnce(reply(200, { success: true, coins_added: 1100, coin_balance: 1320 }));
  await buyCoins('prayer_coin_1000', { dev: false });
  expect(foreground).not.toBeNull();
  await act(async () => { foreground!('active'); });
  await flush();
  expect(purchasePosts()).toHaveLength(2);
  expect(finishPurchase).toHaveBeenCalledTimes(1);
  expect(useCoins.getState().balance).toBe(1320);
});

it('a replay that adds 0 (already credited) is consumed and announces nothing', async () => {
  fetchMock
    .mockResolvedValueOnce(reply(502, null))
    .mockResolvedValueOnce(reply(200, { success: true, coins_added: 0, coin_balance: 1320 }));
  await buyCoins('prayer_coin_1000', { dev: false });
  await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]); });
  await flush();
  expect(finishPurchase).toHaveBeenCalledTimes(1);
  expect(coinNotes()).toHaveLength(0);
});

it('the same pack cannot be bought again while one waits; another pack can', async () => {
  fetchMock.mockResolvedValueOnce(reply(422, { error_code: 'PURCHASE_INVALID' }));
  await buyCoins('prayer_coin_1000', { dev: false });
  expect(await buyCoins('prayer_coin_1000', { dev: false })).toEqual({ ok: false, reason: 'awaiting' });
  expect(buyProduct).toHaveBeenCalledTimes(1);

  (buyProduct as jest.Mock).mockResolvedValueOnce({ ...purchase, productId: 'prayer_coin_500', transactionId: 't-2' });
  fetchMock.mockResolvedValueOnce(reply(200, { success: true, coins_added: 530, coin_balance: 750 }));
  expect(await buyCoins('prayer_coin_500', { dev: false })).toEqual({ ok: true, coinsAdded: 530, balance: 750 });
});

it('the dev platform took no money: a refusal is still "invalid", nothing is held', async () => {
  fetchMock.mockResolvedValueOnce(reply(422, { error_code: 'PURCHASE_INVALID' }));
  expect(await buyCoins('prayer_coin_500', { dev: true })).toEqual({ ok: false, reason: 'invalid' });
  expect(useCoins.getState().awaiting).toEqual([]);
});

it('an unfinished purchase the launch could not confirm is retried in the session too', async () => {
  (unfinishedPurchases as jest.Mock).mockResolvedValueOnce([purchase]);
  fetchMock
    .mockResolvedValueOnce(reply(503, null))
    .mockResolvedValueOnce(reply(200, { success: true, coins_added: 1100, coin_balance: 1320 }));
  const stop = startCoinPurchaseRecovery();
  await flush();
  expect(useCoins.getState().awaiting).toEqual(['prayer_coin_1000']);
  await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]); });
  await flush();
  expect(finishPurchase).toHaveBeenCalledTimes(1);
  expect(useCoins.getState().awaiting).toEqual([]);
  stop();
});

describe('the coin shop', () => {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
  });
  const row = (id: string) => tree!.root.findAll(n => n.props.testID === `coin-pack-${id}` && typeof n.props.onPress === 'function')[0];
  const shown = () => JSON.stringify(tree!.toJSON());

  it('says the payment was received — never "try again" — and holds the pack until it lands', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/coins/purchase') ? Promise.reject(new Error('offline')) : reply(200, WALLET));
    await act(async () => { tree = ReactTestRenderer.create(<CoinPackList />); });
    await flush();
    await act(async () => { row('prayer_coin_1000').props.onPress(); });
    await flush();
    expect(shown()).toContain('Payment received. Your PC will arrive shortly.');
    expect(shown()).not.toContain('try again');
    expect(row('prayer_coin_1000').props.disabled).toBe(true);
    expect(row('prayer_coin_500').props.disabled).toBe(false);
    // A second tap on the held pack opens no second store sheet.
    await act(async () => { row('prayer_coin_1000').props.onPress(); });
    expect(buyProduct).toHaveBeenCalledTimes(1);

    // The connection comes back: the retry credits it and the note says so.
    fetchMock.mockImplementation(async () => reply(200, { success: true, coins_added: 1100, coin_balance: 1320 }));
    await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]); });
    await flush();
    expect(shown()).toContain('1,100');
    expect(shown()).not.toContain('Payment received');
    expect(row('prayer_coin_1000').props.disabled).toBe(false);
  });

  it('opened again while a payment waits, it says so', async () => {
    fetchMock.mockImplementation(async () => reply(200, WALLET));
    useCoins.setState({ awaiting: ['prayer_coin_1000'] });
    await act(async () => { tree = ReactTestRenderer.create(<CoinPackList />); });
    await flush();
    expect(shown()).toContain('Payment received. Your PC will arrive shortly.');
    expect(row('prayer_coin_1000').props.disabled).toBe(true);
  });
});
