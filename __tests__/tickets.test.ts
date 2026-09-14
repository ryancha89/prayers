/**
 * Question tickets: the only way this product sells them, and the two places it must not lie.
 *
 * Until now the app read a balance on the way into a room, refused entry at zero, and offered a
 * Back button — while MyPage showed a wallet of 120 credits that was a constant in a file.
 */
jest.mock(
  '../src/features/counseling/api/devToken',
  () => ({ SAJU_ACCESS_TOKEN: '' }),
  { virtual: true },
);
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
      getAllKeys: async () => [...store.keys()],
    },
  };
});

import {
  TIER_GRANT,
  activateSubscription,
  claimDaily,
  fetchSubscription,
  productIdFor,
} from '../src/features/tickets/api/subscription';
import { purchaseAvailable } from '../src/features/tickets/providers/purchase';
import { signInAsDeveloper } from '../src/features/auth/api/session';
import { signedOut, storeGameToken } from '../src/features/auth/store/authStore';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;
const stubFetch = (body: unknown, status = 200): FetchMock => {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  const fn: FetchMock = jest.fn((_u: string, _i?: RequestInit) => Promise.resolve(res));
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
};

const realFetch = globalThis.fetch;
beforeEach(() => {
  signInAsDeveloper('dev-buyer');
  storeGameToken('tok', Date.now() + 3_600_000);
});
afterEach(() => {
  (globalThis as unknown as { fetch: typeof realFetch }).fetch = realFetch;
  signedOut();
});

test('the product id matches what the server parses a tier out of', () => {
  // TicketSubscriptionService.tier_from_product_id matches the bare word inside the id. A rename
  // to "prayers_lite" here would still purchase — and then activate as `unknown_product`.
  for (const tier of ['lite', 'standard', 'max'] as const) {
    expect(productIdFor(tier)).toContain(tier);
    expect(productIdFor(tier)).toMatch(/^savis_/);
  }
});

test('reads the subscription and the balance the room gate uses', async () => {
  const spy = stubFetch({
    success: true,
    ticket_sub: { tier: 'standard', active: true, expires_at: '2026-10-14T00:00:00Z', daily: 9 },
    tickets_balance: 42,
  });

  const status = await fetchSubscription();

  expect(spy.mock.calls[0][0]).toContain('/api/v1/ticket_subscription/status');
  expect(status).toEqual({
    tier: 'standard',
    active: true,
    expiresAt: '2026-10-14T00:00:00Z',
    daily: 9,
    balance: 42,
  });
});

test('claim is safe to call when there is nothing to claim', async () => {
  // The server answers 200 for "not subscribed" and "already collected today" on purpose, so the
  // client can call it on every visit. Reading a 200 as success would announce tickets nobody got.
  stubFetch({ success: false, error_code: 'not_subscribed', tickets_balance: 0 });
  expect(await claimDaily()).toBe(0);

  stubFetch({ success: true, granted: 9, tickets_balance: 51 });
  expect(await claimDaily()).toBe(9);
});

test('activation is refused unless the server says success', async () => {
  stubFetch({ success: false, error_code: 'unknown_product' });
  expect(await activateSubscription({ productId: 'savis_lite' })).toBe(false);

  const spy = stubFetch({ success: true, granted: 30 });
  expect(await activateSubscription({ productId: 'savis_lite', transactionId: 'tx-1' })).toBe(true);
  const body = JSON.parse(spy.mock.calls[0][1]?.body as string);
  expect(body).toMatchObject({ product_id: 'savis_lite', transaction_id: 'tx-1', platform: 'ios' });
  // No expires_at invented client-side: the server reads the real one off the store receipt, and a
  // date made up here is a date its ledger would then trust.
  expect(body.expires_at).toBeUndefined();
});

test('nothing is sent when nobody is signed in', async () => {
  signedOut();
  const spy = stubFetch({ success: true });
  expect(await fetchSubscription()).toBeNull();
  expect(await activateSubscription({ productId: 'savis_max' })).toBe(false);
  expect(await claimDaily()).toBe(0);
  expect(spy).not.toHaveBeenCalled();
});

test('the tiers say what the server grants', () => {
  // Mirrored from TicketSubscriptionService::TIERS so the screen can name the offer before the
  // store has loaded. If the server's numbers move, this is the line that has to move with them.
  expect(TIER_GRANT.lite).toEqual({ start: 30, daily: 3 });
  expect(TIER_GRANT.standard).toEqual({ start: 90, daily: 9 });
  expect(TIER_GRANT.max).toEqual({ start: 500, daily: 50 });
});

test('the store is honestly reported as absent until the pod is installed', () => {
  // Same shape as Apple Sign In: no pod, no products in App Store Connect, so the screen says so
  // rather than showing a button that always fails.
  expect(purchaseAvailable()).toBe(false);
});
