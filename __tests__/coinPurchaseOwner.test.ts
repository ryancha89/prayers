/**
 * A paid-but-unconfirmed coin purchase belongs to the account that paid, across a relaunch (11-11).
 *
 * The store keeps an unfinished transaction and re-delivers it on the next launch to whoever is
 * signed in. A paid, the confirm never landed, A signed out, B signed in on the same phone — and the
 * launch recovery posted A's receipt with B's token, so B was credited. Pinned here: B's launch does
 * not even ask, the transaction stays unfinished, and A's next sign-in still gets the coins.
 */
const storage: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: async (k: string) => storage[k] ?? null,
    setItem: async (k: string, v: string) => { storage[k] = v; },
    removeItem: async (k: string) => { delete storage[k]; },
  },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
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
import { finishPurchase, unfinishedPurchases } from '../src/features/tickets/providers/purchase';
import {
  resetCoinConfirmsForTests,
  startCoinPurchaseRecovery,
  stopCoinConfirms,
} from '../src/features/coins/api/coinsApi';
import { resetPurchaseOwnersForTests } from '../src/features/coins/api/purchaseOwner';
import { useAuthStore } from '../src/features/auth/store/authStore';
import { useCoins } from '../src/features/coins/store/coinStore';

const fetchMock = authedFetch as jest.Mock;
const purchase = { platform: 'ios', productId: 'prayer_coin_1000', purchaseToken: 'jws', transactionId: 't-77', raw: { id: 't-77' } };
const purchasePosts = () => fetchMock.mock.calls.filter(c => String(c[0]).endsWith('/coins/purchase'));
const credited = { status: 200, ok: true, json: async () => ({ success: true, coins_added: 1100, coin_balance: 1320 }) };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };

const signIn = (uid: string) => useAuthStore.setState({ userAuth: uid, provider: 'dev', displayName: null, gameToken: null, gameTokenExpiresAt: null });

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  (finishPurchase as jest.Mock).mockClear();
  (unfinishedPurchases as jest.Mock).mockReset().mockResolvedValue([]);
  for (const k of Object.keys(storage)) delete storage[k];
  resetCoinConfirmsForTests();
  resetPurchaseOwnersForTests();
  useCoins.setState({ balance: 220, awaiting: [], lateCredit: null, notice: null });
});

afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('does not credit the next account on this device with a purchase it did not pay for', async () => {
  // A pays; the server cannot be reached, so the purchase is held and the device records the owner.
  signIn('pr_aaa');
  fetchMock.mockResolvedValue(null);
  (unfinishedPurchases as jest.Mock).mockResolvedValueOnce([purchase]);
  startCoinPurchaseRecovery();
  await flush();
  expect(purchasePosts()).toHaveLength(1);
  expect(finishPurchase).not.toHaveBeenCalled();

  // A signs out, B signs in, the app is relaunched: the store offers the same transaction again.
  stopCoinConfirms();
  resetCoinConfirmsForTests();
  resetPurchaseOwnersForTests(); // the in-memory cache is gone, the stored record is not
  signIn('pr_bbb');
  fetchMock.mockReset().mockResolvedValue(credited);
  (unfinishedPurchases as jest.Mock).mockResolvedValueOnce([purchase]);
  startCoinPurchaseRecovery();
  await flush();

  expect(purchasePosts()).toHaveLength(0);
  expect(finishPurchase).not.toHaveBeenCalled();
  expect(useCoins.getState().balance).toBe(220);

  // A signs in again on the same phone: the coins are theirs, credited and consumed once.
  stopCoinConfirms();
  resetCoinConfirmsForTests();
  resetPurchaseOwnersForTests();
  signIn('pr_aaa');
  fetchMock.mockReset().mockResolvedValue(credited);
  (unfinishedPurchases as jest.Mock).mockResolvedValueOnce([purchase]);
  startCoinPurchaseRecovery();
  await flush();

  expect(purchasePosts()).toHaveLength(1);
  expect(finishPurchase).toHaveBeenCalledTimes(1);
  expect(useCoins.getState().balance).toBe(1320);
});

it('credits a transaction no account on this device ever claimed (the store tells us nothing)', async () => {
  signIn('pr_ccc');
  fetchMock.mockResolvedValue(credited);
  (unfinishedPurchases as jest.Mock).mockResolvedValueOnce([purchase]);
  startCoinPurchaseRecovery();
  await flush();
  expect(purchasePosts()).toHaveLength(1);
  expect(finishPurchase).toHaveBeenCalledTimes(1);
});
