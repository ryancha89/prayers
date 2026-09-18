import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
// Reconciled at the API layer, not inside the store: importing it there would close a cycle
// (authStore -> languageSync -> prayersServer -> auth/api/headers -> authStore).
import { syncAccountLanguage } from '../../settings/languageSync';
import {
  getUserAuth,
  signedIn,
  storeGameToken,
  validGameToken,
  type AuthProvider,
} from '../store/authStore';

/**
 * Sign-in against saju_server, and the credential every later call rides on.
 *
 * The contract is not invented here — it is the one saju_front has used in production:
 *   POST /api/v1/auth/apple/callback   { auth: <the provider's own response> }
 *   POST /api/v1/auth/google/callback  { auth: ... }
 *     → { result: 'loggedin' | 'signup_failed', user_auth, name, free_ticket_allocated, ... }
 *
 * ⚠️ These two endpoints are the ONLY ones that need no credential of their own
 * (`Api::V1::Auth::OmniauthCallbacksController` does not inherit the `Saju-Authorization` gate,
 * verified against the running server). That is what makes a secret-free release build possible:
 * sign in → get `user_auth` → exchange it for a 24h `Game-Token` → use that everywhere else.
 */

interface CallbackResponse {
  result?: string;
  user_auth?: string;
  name?: string;
}

async function callback(
  provider: Exclude<AuthProvider, 'dev'>,
  auth: unknown,
): Promise<{ userAuth: string; displayName: string | null }> {
  const res = await fetch(`${apiBase()}/api/v1/auth/${provider}/callback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ auth }),
  });

  // The server answers 200 with `result: 'signup_failed'` rather than an error status, so the
  // status alone is not the test — reading only `res.ok` would sign the player in as `undefined`.
  const body = (await res.json().catch(() => null)) as CallbackResponse | null;
  if (!res.ok || !body || body.result === 'signup_failed' || !body.user_auth) {
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

/**
 * The local-only door, kept deliberately behind `__DEV__`.
 *
 * A `dev-` uid is auto-provisioned by the server ONLY in development, and topped back up to 100
 * tickets on every request. That is exactly what a developer wants and exactly what must never
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
 * `GET /api/v1/game/token` takes the uid in `User-Auth` and NOTHING else — it inherits
 * ApplicationController on purpose (see the comment at the top of game_controller.rb), which is
 * what lets a signed-in client bootstrap without an embedded secret.
 */
export async function ensureGameToken(): Promise<string | null> {
  const existing = validGameToken();
  if (existing) return existing;

  const uid = getUserAuth();
  if (!uid) return null;

  try {
    const res = await fetch(`${apiBase()}/api/v1/game/token`, { headers: { 'User-Auth': uid } });
    const body = (await res.json().catch(() => null)) as TokenResponse | null;
    if (!res.ok || !body?.success || !body.token) {
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
