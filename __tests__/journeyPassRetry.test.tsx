/**
 * A journey pass the store charged for but the server did not confirm (29-10) — the same bug the
 * coin packs had (coinPurchaseRetry.test.tsx). `buyJourneyPass` used to hand back the refusal, the
 * pass screen said "try again", and nothing ever retried. Pinned here:
 *  · the answer is 'awaiting' and the store purchase stays unfinished,
 *  · it is confirmed again with the same store transaction — on the backoff and on a return to the
 *    foreground — and consumed once,
 *  · the same pass cannot be bought again while it waits,
 *  · a dev-platform refusal (no money taken) is still a refusal,
 *  · the pass screen says the payment was received, never "try again", and moves on when it lands.
 */
import React from 'react';
import { Alert, AppState } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockNav = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: () => () => {} };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: { journeyId: 'newyear-2027' } }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});
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
jest.mock('../src/features/journey/components/JourneyTrainArt', () => ({ JourneyTrainArt: () => null }));

import { authedFetch } from '../src/features/auth/api/headers';
import { buyProduct, finishPurchase } from '../src/features/tickets/providers/purchase';
import { CONFIRM_RETRY_MS } from '../src/features/coins/api/coinsApi';
import { buyJourneyPass, resetPassConfirmsForTests, usePassPurchases } from '../src/features/journey/api/passPurchase';
import { JourneyPassScreen } from '../src/features/journey/screens/JourneyPassScreen';
import { useLanguageStore } from '../src/shared/i18n';

const fetchMock = authedFetch as jest.Mock;
const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
const PRODUCT = 'prayers_journey_2027';
const purchase = { platform: 'ios', productId: PRODUCT, purchaseToken: 'jws', transactionId: 't-7', raw: { id: 't-7' } };
const OWNED = { success: true, owned: true };
const flush = () => act(async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); });
const passPosts = () => fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/journeys/newyear-2027/purchase'));

let foreground: ((s: string) => void) | null = null;
let foregroundRemoved = 0;

beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'en' });
  jest.useFakeTimers();
  fetchMock.mockReset();
  (buyProduct as jest.Mock).mockReset().mockResolvedValue(purchase);
  (finishPurchase as jest.Mock).mockClear();
  mockNav.replace.mockClear();
  foreground = null;
  foregroundRemoved = 0;
  jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, cb: (s: string) => void) => {
    foreground = cb;
    return { remove: () => { foregroundRemoved += 1; foreground = null; } };
  }) as never);
  resetPassConfirmsForTests();
});
afterEach(() => {
  resetPassConfirmsForTests();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('a dropped confirm is held, retried on the backoff with the same transaction, then consumed once', async () => {
  fetchMock
    .mockRejectedValueOnce(new Error('Network request failed'))
    .mockResolvedValueOnce(reply(503, null))
    .mockResolvedValueOnce(reply(200, OWNED));
  expect(await buyJourneyPass('newyear-2027', PRODUCT, false)).toEqual({ ok: false, reason: 'awaiting' });
  expect(finishPurchase).not.toHaveBeenCalled();
  expect(usePassPurchases.getState().awaiting).toEqual([PRODUCT]);

  await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]); });
  await flush();
  expect(passPosts()).toHaveLength(2);
  expect(finishPurchase).not.toHaveBeenCalled();

  await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[1]); });
  await flush();
  expect(passPosts().map(c => JSON.parse(c[1].body).transaction_id)).toEqual(['t-7', 't-7', 't-7']);
  expect(finishPurchase).toHaveBeenCalledTimes(1);
  expect(finishPurchase).toHaveBeenCalledWith(purchase);
  expect(usePassPurchases.getState()).toMatchObject({ awaiting: [], owned: ['newyear-2027'] });
  // Nothing left to confirm: no more timers, and the foreground hook is gone.
  expect(foregroundRemoved).toBe(1);
  await act(async () => { jest.advanceTimersByTime(10 * 60_000); });
  expect(passPosts()).toHaveLength(3);
});

it('coming back to the foreground confirms at once', async () => {
  fetchMock.mockResolvedValueOnce(reply(500, null)).mockResolvedValueOnce(reply(200, OWNED));
  await buyJourneyPass('newyear-2027', PRODUCT, false);
  expect(foreground).not.toBeNull();
  await act(async () => { foreground!('active'); });
  await flush();
  expect(passPosts()).toHaveLength(2);
  expect(finishPurchase).toHaveBeenCalledTimes(1);
});

it('the same pass cannot be bought again while one waits', async () => {
  fetchMock.mockResolvedValueOnce(reply(422, { success: false, error_code: 'PURCHASE_INVALID', owned: false }));
  await buyJourneyPass('newyear-2027', PRODUCT, false);
  expect(await buyJourneyPass('newyear-2027', PRODUCT, false)).toEqual({ ok: false, reason: 'awaiting' });
  expect(buyProduct).toHaveBeenCalledTimes(1);
});

it('the dev platform took no money: a refusal is still a refusal, nothing is held', async () => {
  fetchMock.mockResolvedValueOnce(reply(422, { success: false, error_code: 'PURCHASE_INVALID', owned: false }));
  expect(await buyJourneyPass('newyear-2027', PRODUCT, true)).toEqual({ ok: false, reason: 'invalid' });
  expect(usePassPurchases.getState().awaiting).toEqual([]);
  expect(foreground).toBeNull();
});

describe('the pass screen', () => {
  let tree: ReactTestRenderer.ReactTestRenderer | null = null;
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = null;
  });
  const buyButton = () => tree!.root.findAll(n => n.props.testID === 'journey-pass-buy' && typeof n.props.onPress === 'function')[0];
  const shown = () => JSON.stringify(tree!.toJSON());

  it('says the payment was received — never "try again" — and moves on when the retry lands', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    fetchMock.mockImplementation(async (url: string) =>
      String(url).endsWith('/access')
        ? reply(200, { success: true, owned: false, price_krw: 9900, product_id: PRODUCT, dev_purchase: false })
        : Promise.reject(new Error('offline')));
    await act(async () => { tree = ReactTestRenderer.create(<JourneyPassScreen />); });
    await flush();
    await act(async () => { buyButton().props.onPress(); });
    await flush();
    expect(alert).not.toHaveBeenCalled();
    expect(shown()).toContain('Payment received.');
    expect(buyButton().props.disabled).toBe(true);
    await act(async () => { buyButton().props.onPress(); });
    expect(buyProduct).toHaveBeenCalledTimes(1);

    fetchMock.mockImplementation(async () => reply(200, OWNED));
    await act(async () => { jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]); });
    await flush();
    expect(finishPurchase).toHaveBeenCalledTimes(1);
    expect(mockNav.replace).toHaveBeenCalledWith('JourneyCounselor', { journeyId: 'newyear-2027' });
  });
});
