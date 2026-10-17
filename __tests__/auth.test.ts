/**
 * The identity layer: who the app says it is, and what credential it says it with.
 *
 * This is the seam that used to be a `dev-` uid minted on the device — an id the server only
 * auto-provisions in development (and tops back up to 100 tickets on every request), which made
 * every release build a 401 and made the ticket gate untestable. The tests below pin the two things
 * that decide whether a build can talk to production at all: that a signed-in client prefers its
 * own 24h game token over any embedded secret, and that a signed-out client sends nothing.
 */
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
import { authedFetch } from '../src/features/auth/api/headers';
import {
  signInAsDeveloper,
  signInAsReviewer,
  signInWithApple,
  signInWithGoogle,
  signInWithKakao,
  ensureGameToken,
} from '../src/features/auth/api/session';
import {
  getUserAuth,
  isUsableUserAuth,
  signedIn,
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
    storeGameToken('pgt_1', Date.now() + 3_600_000);

    const headers = await apiHeaders();

    expect(headers?.['Game-Token']).toBe('pgt_1');
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
    const spy = stubFetch({ success: true, token: 'pgt_fresh', expires_at: expires });

    expect(await ensureGameToken()).toBe('pgt_fresh');
    expect(spy.mock.calls[0][0]).toBe(`${apiBase()}/api/v1/prayers/game/token`);
    // The uid alone opens that endpoint — that is what makes a secret-free bootstrap possible.
    expect((spy.mock.calls[0][1]?.headers as Record<string, string>)['User-Auth']).toBe('dev-abc');
    expect(useAuthStore.getState().gameToken).toBe('pgt_fresh');
  });

  it('refuses a token that is not a Prayers (pgt_) token — the shared kind resolves to no account', async () => {
    signInAsDeveloper('dev-abc');
    stubFetch({ success: true, token: 'abc123sharedtoken', expires_at: new Date(Date.now() + 3_600_000).toISOString() });

    expect(await ensureGameToken()).toBeNull();
    expect(useAuthStore.getState().gameToken).toBeNull();
  });

  it('re-uses a live token instead of asking again every call', async () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('pgt_1', Date.now() + 3_600_000);
    const spy = stubFetch({ success: true, token: 'pgt_other' });

    await apiHeaders();
    await apiHeaders();

    expect(spy).not.toHaveBeenCalled();
  });
});

describe('validGameToken', () => {
  it('treats a token that expires within the minute as already gone', () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('pgt_1', Date.now() + 30_000);
    // A token that dies mid-request is a 401 the player reads as the counselor going quiet.
    expect(validGameToken()).toBeNull();

    storeGameToken('pgt_1', Date.now() + 120_000);
    expect(validGameToken()).toBe('pgt_1');
  });
});

/* ── signing in ─────────────────────────────────────────────────────────────── */

describe('signInWithApple', () => {
  it('sends the provider response verbatim and keeps the uid it gets back', async () => {
    const spy = stubFetch({ result: 'loggedin', user_auth: 'pr_apple9', name: 'Linh', provider: 'apple' });
    const appleResponse = { identityToken: 'jwt', authorizationCode: 'code', email: 'a@b.c' };

    await signInWithApple(appleResponse);

    expect(spy.mock.calls[0][0]).toBe(`${apiBase()}/api/v1/prayers/auth/apple/callback`);
    // Verbatim: User.from_apple_omniauth reads identityToken/authorizationCode/fullName/email off
    // this object, and any field renamed in transit arrives as nil.
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ auth: appleResponse });
    expect(getUserAuth()).toBe('pr_apple9');
    expect(useAuthStore.getState().displayName).toBe('Linh');
  });

  it('refuses a 200 that says signup_failed — the server does not use an error status for it', async () => {
    stubFetch({ result: 'signup_failed' });
    await expect(signInWithApple({})).rejects.toThrow(/signup_failed/);
    expect(getUserAuth()).toBeNull();
  });

  it('does not inherit the previous account’s token when a different one signs in', async () => {
    signInAsDeveloper('dev-abc');
    storeGameToken('pgt_old', Date.now() + 3_600_000);
    stubFetch({ result: 'loggedin', user_auth: 'pr_apple9' });

    await signInWithApple({ identityToken: 'jwt' });

    expect(useAuthStore.getState().gameToken).not.toBe('pgt_old');
  });

  it('refuses a uid that is not a Prayers account (a shared users uid)', async () => {
    stubFetch({ result: 'loggedin', user_auth: 'legacy-shared-uid' });
    await expect(signInWithApple({})).rejects.toThrow(/refused/);
    expect(getUserAuth()).toBeNull();
  });
});

describe('Google / Kakao', () => {
  it.each([
    ['google', signInWithGoogle, { idToken: 'jwt', user: { name: 'N' } }],
    ['kakao', signInWithKakao, { idToken: 'jwt', uid: '123' }],
  ] as const)('%s posts the provider response to the Prayers callback', async (provider, fn, auth) => {
    const spy = stubFetch({ result: 'loggedin', user_auth: 'pr_x', provider });
    await fn(auth);
    expect(spy.mock.calls[0][0]).toBe(`${apiBase()}/api/v1/prayers/auth/${provider}/callback`);
    expect(JSON.parse(spy.mock.calls[0][1]?.body as string)).toEqual({ auth });
    expect(useAuthStore.getState().provider).toBe(provider);
  });
});

describe('signInAsReviewer', () => {
  it('posts email + password and signs in as the reviewer, then mints a pgt_ token', async () => {
    const fn: FetchMock = jest.fn((url: string) =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () =>
          url.endsWith('/game/token')
            ? { success: true, token: 'pgt_rev', expires_at: new Date(Date.now() + 3_600_000).toISOString() }
            : { result: 'loggedin', user_auth: 'pr_rev', name: 'App Reviewer', provider: 'reviewer' },
      } as Response),
    );
    (globalThis as unknown as { fetch: FetchMock }).fetch = fn;

    await signInAsReviewer(' reviewer@example.com ', 'secret');

    expect(fn.mock.calls[0][0]).toBe(`${apiBase()}/api/v1/prayers/auth/reviewer`);
    expect(JSON.parse(fn.mock.calls[0][1]?.body as string)).toEqual({ email: 'reviewer@example.com', password: 'secret' });
    expect(useAuthStore.getState()).toMatchObject({
      userAuth: 'pr_rev',
      provider: 'reviewer',
      displayName: 'App Reviewer',
      gameToken: 'pgt_rev',
    });
    expect(fn.mock.calls[1][0]).toBe(`${apiBase()}/api/v1/prayers/game/token`);
  });

  it('a 401 signup_failed leaves nobody signed in', async () => {
    stubFetch({ result: 'signup_failed' }, 401);
    await expect(signInAsReviewer('x@y.z', 'nope')).rejects.toThrow(/401/);
    expect(getUserAuth()).toBeNull();
  });
});

/* ── accounts from before the Prayers account split ─────────────────────────── */

describe('isUsableUserAuth', () => {
  it('keeps pr_ uids, keeps dev- only in a dev build, drops anything else', () => {
    expect(isUsableUserAuth('pr_abc')).toBe(true);
    expect(isUsableUserAuth('legacy-uid')).toBe(false);
    expect(isUsableUserAuth(null)).toBe(false);
    expect(isUsableUserAuth('dev-abc')).toBe(true);
    const g = globalThis as unknown as { __DEV__: boolean };
    const dev = g.__DEV__;
    try {
      g.__DEV__ = false;
      expect(isUsableUserAuth('dev-abc')).toBe(false);
      expect(isUsableUserAuth('pr_abc')).toBe(true);
    } finally {
      g.__DEV__ = dev;
    }
  });

  it('a stored shared-users uid is not restored on rehydrate', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    await AsyncStorage.setItem(
      'prayers.auth.v1',
      JSON.stringify({ state: { userAuth: 'legacy-uid', provider: 'apple', gameToken: 'old', gameTokenExpiresAt: Date.now() + 3_600_000 }, version: 0 }),
    );
    await useAuthStore.persist.rehydrate();
    expect(getUserAuth()).toBeNull();

    await AsyncStorage.setItem(
      'prayers.auth.v1',
      JSON.stringify({ state: { userAuth: 'pr_keep', provider: 'apple', gameToken: 'oldshared', gameTokenExpiresAt: Date.now() + 3_600_000 }, version: 0 }),
    );
    await useAuthStore.persist.rehydrate();
    expect(getUserAuth()).toBe('pr_keep');
    // A non-pgt_ token from an older build is dropped so a Prayers one is minted.
    expect(useAuthStore.getState().gameToken).toBeNull();
  });
});

/* ── the 401 retry ──────────────────────────────────────────────────────────── */

describe('authedFetch retry', () => {
  it('re-mints at prayers/game/token and resends with the new pgt_ token', async () => {
    signedIn({ userAuth: 'pr_u', provider: 'apple' });
    storeGameToken('pgt_dead', Date.now() + 3_600_000);
    const fn: FetchMock = jest.fn((url: string, init?: RequestInit) => {
      if (url.endsWith('/api/v1/prayers/game/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({ success: true, token: 'pgt_new', expires_at: new Date(Date.now() + 3_600_000).toISOString() }),
        } as Response);
      }
      const tok = (init?.headers as Record<string, string>)['Game-Token'];
      const status = tok === 'pgt_dead' ? 401 : 200;
      return Promise.resolve({ ok: status === 200, status, json: async () => ({}) } as Response);
    });
    (globalThis as unknown as { fetch: FetchMock }).fetch = fn;

    const res = await authedFetch(`${apiBase()}/api/v1/prayers/coins`);

    expect(res?.status).toBe(200);
    const sent = fn.mock.calls.filter(c => c[0].endsWith('/coins')).map(c => c[1]?.headers as Record<string, string>);
    expect(sent.map(h => h['Game-Token'])).toEqual(['pgt_dead', 'pgt_new']);
    expect(sent[1]['User-Auth']).toBe('pr_u');
  });
});
