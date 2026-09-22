/**
 * A game token can die without the clock running out.
 *
 * The token lives in the server's Redis (GameToken.issue → setex, 24h). The client only ever knew
 * its OWN copy of the expiry, so a Redis restart, a flush, an eviction or a different backend left
 * it holding a credential the server had never heard of. Three things then lined up badly:
 * `apiHeaders` returns as soon as it HAS a token, so the `Saju-Authorization` fallback was not sent
 * either; `authenticate` refuses a bad Game-Token outright and never falls back to `User-Auth`; and
 * nothing invalidated the token on 401. Every call answered 401 until the local clock happened to
 * run out — up to 23 hours — and `fetchRecall` swallows its failure, so the counselor simply forgot
 * the previous session with nothing on screen to say why.
 *
 * Measured against the running server on 2026-09-21: a token the server does not know answers 401
 * even with a valid `User-Auth` beside it.
 */
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
    },
  };
});
jest.mock('../src/features/settings/languageSync', () => ({ syncAccountLanguage: () => {} }));

import { authedFetch } from '../src/features/auth/api/headers';
import { signInAsDeveloper } from '../src/features/auth/api/session';
import {
  signedOut,
  storeGameToken,
  useAuthStore,
} from '../src/features/auth/store/authStore';

type Call = { url: string; init: RequestInit };

/**
 * A server that refuses one named token and accepts anything else — which is exactly the shape of
 * the bug: the credential is not malformed, it is simply not in Redis any more.
 */
function serverRejecting(deadToken: string) {
  const calls: Call[] = [];
  const fn = jest.fn((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const sent = (init.headers as Record<string, string>)?.['Game-Token'];
    const status = sent === deadToken ? 401 : 200;
    return Promise.resolve({
      ok: status === 200,
      status,
      json: async () => ({ success: status === 200 }),
    } as Response);
  });
  (globalThis as unknown as { fetch: typeof fn }).fetch = fn;
  return { calls, fn };
}

/** `GET /api/v1/game/token` is a bare fetch inside ensureGameToken, not an authedFetch. */
function mintsTokenThen(freshToken: string, rest: (url: string, init: RequestInit) => Promise<Response>) {
  const calls: Call[] = [];
  const fn = jest.fn((url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/api/v1/game/token')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          token: freshToken,
          expires_at: new Date(Date.now() + 23 * 3600_000).toISOString(),
        }),
      } as Response);
    }
    return rest(url, init);
  });
  (globalThis as unknown as { fetch: typeof fn }).fetch = fn;
  return { calls, fn };
}

const tokenOf = (c: Call) => (c.init.headers as Record<string, string>)?.['Game-Token'];

beforeEach(() => {
  signedOut();
  jest.restoreAllMocks();
});

describe('authedFetch, when the server has forgotten the token', () => {
  it('throws the dead token away, mints a new one and retries once', async () => {
    signInAsDeveloper('dev-stale');
    storeGameToken('dead-token', Date.now() + 20 * 3600_000); // client still believes in it

    const { calls } = mintsTokenThen('fresh-token', (_url, init) => {
      const sent = (init.headers as Record<string, string>)?.['Game-Token'];
      const status = sent === 'dead-token' ? 401 : 200;
      return Promise.resolve({ ok: status === 200, status, json: async () => ({}) } as Response);
    });

    const res = await authedFetch('http://localhost:4000/api/v1/prayers/consultations/recall');

    expect(res?.status).toBe(200);

    const recalls = calls.filter(c => c.url.includes('/recall'));
    expect(recalls.map(tokenOf)).toEqual(['dead-token', 'fresh-token']);
    // The new token replaced the dead one in the store, so the NEXT call starts out valid.
    expect(useAuthStore.getState().gameToken).toBe('fresh-token');
  });

  it('retries at most once — a second 401 is about the account, not the credential', async () => {
    signInAsDeveloper('dev-gone');
    storeGameToken('dead-token', Date.now() + 20 * 3600_000);

    // Every token is refused, including the freshly minted one.
    const { calls } = mintsTokenThen('fresh-token', () =>
      Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response),
    );

    const res = await authedFetch('http://localhost:4000/api/v1/saju/tickets');

    expect(res?.status).toBe(401);
    expect(calls.filter(c => c.url.includes('/saju/tickets'))).toHaveLength(2);
  });

  it('leaves a 401 that carried no game token alone', async () => {
    // Signed in, but the token store is empty: apiHeaders falls back to the dev shared secret,
    // and minting a token would not change an answer that is about the secret.
    signInAsDeveloper('dev-secret-only');

    const { calls } = serverRejecting('never-sent');
    (globalThis as unknown as { fetch: jest.Mock }).fetch = jest.fn(
      (url: string, init: RequestInit) => {
        calls.push({ url, init });
        if (url.endsWith('/api/v1/game/token')) {
          return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
        }
        return Promise.resolve({ ok: false, status: 401, json: async () => ({}) } as Response);
      },
    );

    const res = await authedFetch('http://localhost:4000/api/v1/prayers/settings');

    expect(res?.status).toBe(401);
    expect(calls.filter(c => c.url.includes('/prayers/settings'))).toHaveLength(1);
  });

  it('does not retry a call that succeeded', async () => {
    signInAsDeveloper('dev-fine');
    storeGameToken('good-token', Date.now() + 20 * 3600_000);

    const { calls } = serverRejecting('some-other-token');

    const res = await authedFetch('http://localhost:4000/api/v1/prayers/topics');

    expect(res?.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it('still returns null when nobody is signed in, so callers do not send', async () => {
    const { calls } = serverRejecting('anything');
    expect(await authedFetch('http://localhost:4000/api/v1/saju/me')).toBeNull();
    expect(calls).toHaveLength(0);
  });
});
