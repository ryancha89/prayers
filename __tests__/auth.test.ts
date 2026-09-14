/**
 * The identity layer: who the app says it is, and what credential it says it with.
 *
 * This is the seam that used to be a `dev-` uid minted on the device — an id the server only
 * auto-provisions in development (and tops back up to 100 tickets on every request), which made
 * every release build a 401 and made the ticket gate untestable. The tests below pin the two things
 * that decide whether a build can talk to production at all: that a signed-in client prefers its
 * own 24h game token over any embedded secret, and that a signed-out client sends nothing.
 */
jest.mock(
  '../src/features/counseling/api/devToken',
  () => ({ SAJU_ACCESS_TOKEN: 'test-token' }),
  { virtual: true },
);
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
    },
  };
});

import { apiHeaders } from '../src/features/auth/api/headers';
import { signInAsDeveloper, signInWithApple, ensureGameToken } from '../src/features/auth/api/session';
import {
  getUserAuth,
  signedOut,
  storeGameToken,
  useAuthStore,
  validGameToken,
} from '../src/features/auth/store/authStore';
import { apiBase, setApiBaseOverride } from '../src/shared/config/api';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;

const stubFetch = (body: unknown, status = 200): FetchMock => {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  const fn: FetchMock = jest.fn((_url: string, _init?: RequestInit) => Promise.resolve(res));
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
};

const realFetch = globalThis.fetch;
afterEach(() => {
  (globalThis as unknown as { fetch: typeof realFetch }).fetch = realFetch;
  signedOut();
  setApiBaseOverride(null);
});

/* ── where the app talks ────────────────────────────────────────────────────── */

describe('apiBase', () => {
  it('has a real host outside a dev build — a release used to have none at all', () => {
    const dev = (globalThis as unknown as { __DEV__: boolean }).__DEV__;
    try {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
      expect(apiBase()).toBe('https://api.perpetualtalk.com');
    } finally {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
    }
  });

  it('can be pointed somewhere else at runtime, for a QA build on staging', () => {
    setApiBaseOverride('https://staging.perpetualtalk.com/');
    // Trailing slash trimmed: every call site builds `${base}/api/...` and a double slash is a 404
    // on some proxies and a silent redirect on others.
    expect(apiBase()).toBe('https://staging.perpetualtalk.com');
  });
});

/* ── the credential ─────────────────────────────────────────────────────────── */

describe('apiHeaders', () => {
  it('sends nothing at all when nobody is signed in', async () => {
    expect(await apiHeaders()).toBeNull();
  });

  it('prefers the account game token over the shared secret', async () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('tok-1', Date.now() + 3_600_000);

    const headers = await apiHeaders();

    expect(headers?.['Game-Token']).toBe('tok-1');
    expect(headers?.['User-Auth']).toBe('dev-abc');
    // The whole point: a release bundle carries no app-wide secret.
    expect(headers?.['Saju-Authorization']).toBeUndefined();
  });

  it('falls back to the dev secret when a token cannot be had', async () => {
    signInAsDeveloper('dev-abc');
    stubFetch({ success: false }, 401);   // game/token refuses

    const headers = await apiHeaders();

    expect(headers?.['Saju-Authorization']).toBe('Bearer-test-token');
    expect(headers?.['User-Auth']).toBe('dev-abc');
  });

  it('fetches a token when there is none, and files its expiry', async () => {
    signInAsDeveloper('dev-abc');
    const expires = new Date(Date.now() + 24 * 3_600_000).toISOString();
    const spy = stubFetch({ success: true, token: 'fresh', expires_at: expires });

    expect(await ensureGameToken()).toBe('fresh');
    expect(spy.mock.calls[0][0]).toContain('/api/v1/game/token');
    // The uid alone opens that endpoint — that is what makes a secret-free bootstrap possible.
    expect((spy.mock.calls[0][1]?.headers as Record<string, string>)['User-Auth']).toBe('dev-abc');
    expect(useAuthStore.getState().gameToken).toBe('fresh');
  });

  it('re-uses a live token instead of asking again every call', async () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('tok-1', Date.now() + 3_600_000);
    const spy = stubFetch({ success: true, token: 'other' });

    await apiHeaders();
    await apiHeaders();

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('validGameToken', () => {
  it('treats a token that expires within the minute as already gone', () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('tok-1', Date.now() + 30_000);
    // A token that dies mid-request is a 401 the player reads as the counselor going quiet.
    expect(validGameToken()).toBeNull();

    storeGameToken('tok-1', Date.now() + 120_000);
    expect(validGameToken()).toBe('tok-1');
  });
});

/* ── signing in ─────────────────────────────────────────────────────────────── */

describe('signInWithApple', () => {
  it('sends the provider response verbatim and keeps the uid it gets back', async () => {
    const spy = stubFetch({ result: 'loggedin', user_auth: 'apple-uid-9', name: 'Linh' });
    const appleResponse = { identityToken: 'jwt', authorizationCode: 'code', email: 'a@b.c' };

    await signInWithApple(appleResponse);

    expect(spy.mock.calls[0][0]).toContain('/api/v1/auth/apple/callback');
    // Verbatim: User.from_apple_omniauth reads identityToken/authorizationCode/fullName/email off
    // this object, and any field renamed in transit arrives as nil.
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ auth: appleResponse });
    expect(getUserAuth()).toBe('apple-uid-9');
    expect(useAuthStore.getState().displayName).toBe('Linh');
  });

  it('refuses a 200 that says signup_failed — the server does not use an error status for it', async () => {
    stubFetch({ result: 'signup_failed' });
    await expect(signInWithApple({})).rejects.toThrow(/signup_failed/);
    expect(getUserAuth()).toBeNull();
  });

  it('does not inherit the previous account’s token when a different one signs in', async () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('tok-old', Date.now() + 3_600_000);
    stubFetch({ result: 'loggedin', user_auth: 'apple-uid-9' });

    await signInWithApple({ identityToken: 'jwt' });

    expect(useAuthStore.getState().gameToken).not.toBe('tok-old');
  });
});
