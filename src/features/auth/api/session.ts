import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
// Reconciled at the API layer, not inside the store: importing it there would close a cycle
// (authStore -> languageSync -> prayersServer -> auth/api/headers -> authStore).
import { syncAccountLanguage } from '../../settings/languageSync';
import {
  getUserAuth,
  PRAYERS_UID_PREFIX,
  PRAYERS_TOKEN_PREFIX,
  signedIn,
  storeGameToken,
  validGameToken,
  type AuthProvider,
} from '../store/authStore';

/**
 * Sign-in against saju_server's PRAYERS-ONLY accounts (`prayers_users`, 2026-10-16), and the
 * credential every later call rides on. Prayers no longer shares saju_front's `users` table:
 *
 *   POST /api/v1/prayers/auth/apple/callback   { auth: <the provider's own response> }
 *   POST /api/v1/prayers/auth/google/callback  { auth: ... }
 *   POST /api/v1/prayers/auth/kakao/callback   { auth: ... }
 *   POST /api/v1/prayers/auth/reviewer         { email, password }   (App/Play Store review)
 *     → 200 { result: 'loggedin', user_auth: 'pr_…', name, provider } | { result: 'signup_failed' }
 *
 * Unlike the shared callbacks, the server VERIFIES the provider token (JWKS signature, issuer,
 * expiry, audience). These endpoints need no credential of their own — they ARE the credential
 * exchange: sign in → `pr_` uid → `GET /api/v1/prayers/game/token` → a 24h `pgt_` Game-Token for
 * everything else. A shared `users` uid never resolves to a Prayers account.
 */

interface CallbackResponse {
  result?: string;
  user_auth?: string;
  name?: string;
}

async function callback(
  provider: 'apple' | 'google' | 'kakao',
  auth: unknown,
): Promise<{ userAuth: string; displayName: string | null }> {
  return exchange(`/api/v1/prayers/auth/${provider}/callback`, { auth });
}

async function exchange(
  path: string,
  payload: unknown,
): Promise<{ userAuth: string; displayName: string | null }> {
  const res = await fetch(`${apiBase()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  // The server answers 200 with `result: 'signup_failed'` rather than an error status, so the
  // status alone is not the test — reading only `res.ok` would sign the player in as `undefined`.
  const body = (await res.json().catch(() => null)) as CallbackResponse | null;
  if (
    !res.ok ||
    !body ||
    body.result !== 'loggedin' ||
    !body.user_auth ||
    !body.user_auth.startsWith(PRAYERS_UID_PREFIX)
  ) {
    throw new Error(`sign-in refused (${res.status} ${body?.result ?? 'no result'})`);
  }

  return { userAuth: body.user_auth, displayName: body.name ?? null };
}

export async function signInWithApple(appleResponse: unknown) {
  const { userAuth, displayName } = await callback('apple', appleResponse);
  signedIn({ userAuth, provider: 'apple', displayName });
  await ensureGameToken();
  void syncAccountLanguage();
  return userAuth;
}

export async function signInWithGoogle(googleResponse: unknown) {
  const { userAuth, displayName } = await callback('google', googleResponse);
  signedIn({ userAuth, provider: 'google', displayName });
  await ensureGameToken();
  void syncAccountLanguage();
  return userAuth;
}

export async function signInWithKakao(kakaoResponse: unknown) {
  const { userAuth, displayName } = await callback('kakao', kakaoResponse);
  signedIn({ userAuth, provider: 'kakao', displayName });
  await ensureGameToken();
  void syncAccountLanguage();
  return userAuth;
}

/** Kakao through the server (providers/kakaoWebSignIn.ts): the redirect's ticket → the account. */
export async function signInWithKakaoTicket(ticket: string) {
  const { userAuth, displayName } = await exchange('/api/v1/prayers/auth/kakao/ticket', { ticket });
  signedIn({ userAuth, provider: 'kakao', displayName });
  await ensureGameToken();
  void syncAccountLanguage();
  return userAuth;
}

/**
 * The store-review door: one server-configured email + password (PRAYERS_REVIEWER_EMAIL /
 * PRAYERS_REVIEWER_PASSWORD_DIGEST). A refusal is `401 { result: 'signup_failed' }` (429 when rate
 * limited), which `exchange` turns into a throw like every other refused sign-in.
 */
export async function signInAsReviewer(email: string, password: string) {
  const { userAuth, displayName } = await exchange('/api/v1/prayers/auth/reviewer', {
    email: email.trim(),
    password,
  });
  signedIn({ userAuth, provider: 'reviewer', displayName });
  await ensureGameToken();
  void syncAccountLanguage();
  return userAuth;
}

/**
 * The local-only door, kept deliberately behind `__DEV__`.
 *
 * A `dev-` uid is auto-provisioned by the server ONLY in development, as a PrayersUser with
 * provider 'dev' — both `GET /api/v1/prayers/game/token` and a bare `User-Auth: dev-…` create it on
 * first use, so it gets a real `pgt_` token like any other account. That is exactly what a developer wants and exactly what must never
 * reach a player, so it lives here rather than in the store, where it would look like one sign-in
 * option among three.
 */
export function signInAsDeveloper(uid?: string) {
  if (!__DEV__) throw new Error('the developer sign-in does not exist outside a dev build');
  const id =
    uid ??
    'dev-' +
      Array.from(
        { length: 20 },
        () => 'abcdefghijklmnopqrstuvwxyz0123456789'[Math.floor(Math.random() * 36)],
      ).join('');
  signedIn({ userAuth: id, provider: 'dev', displayName: 'Developer' });
  void syncAccountLanguage();
  return id;
}

interface TokenResponse {
  success?: boolean;
  token?: string;
  expires_at?: string;
}

/**
 * Fetch a game token when there is no usable one. Returns null when it cannot be had, which is a
 * normal state, not a failure: `apiHeaders` then falls back to the dev secret, and a release build
 * simply has no credential and says so once.
 *
 * `GET /api/v1/prayers/game/token` takes the `pr_` uid in `User-Auth` and NOTHING else (the uid is
 * a server-issued random secret), which is what lets a signed-in client bootstrap without an
 * embedded secret. It answers a `pgt_` token; an unknown, deleted or non-`pr_` uid gets 401
 * (a `dev-` uid is provisioned in development only).
 */
export async function ensureGameToken(): Promise<string | null> {
  const existing = validGameToken();
  if (existing) return existing;

  const uid = getUserAuth();
  if (!uid) return null;

  try {
    const res = await fetch(`${apiBase()}/api/v1/prayers/game/token`, { headers: { 'User-Auth': uid } });
    const body = (await res.json().catch(() => null)) as TokenResponse | null;
    // Only a Prayers token (`pgt_`) is any use: the shared `/api/v1/game/token` kind resolves to no
    // Prayers account on the server, so storing one would 401 every call for a day.
    if (!res.ok || !body?.success || !body.token || !body.token.startsWith(PRAYERS_TOKEN_PREFIX)) {
      if (__DEV__) devlog(`[auth] game/token refused (${res.status}) for ${uid}`);
      return null;
    }
    const expires = Date.parse(body.expires_at ?? '');
    storeGameToken(body.token, Number.isFinite(expires) ? expires : Date.now() + 23 * 3600_000);
    return body.token;
  } catch {
    return null;
  }
}
