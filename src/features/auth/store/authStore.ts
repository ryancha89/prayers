import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Who the player is, for real.
 *
 * WHAT THIS REPLACES. The app used to identify itself with a `dev-` uid minted on the device
 * (`shared/device/deviceId.ts`). That id is not an account: the server only auto-provisions it
 * `if Rails.env.development?` (saju_controller.rb:136), so the same build against production
 * answers 401 to every call — and in development it is topped back up to 100 question tickets on
 * every request (DEV_TICKET_FLOOR), which is why the ticket gate has never once closed in this app.
 * It also cannot survive a reinstall or reach a second device, so any purchase made against it
 * would be lost with the app.
 *
 * WHAT IT IS INSTEAD. `userAuth` is the `pr_` uid saju_server returns from a sign-in
 * (`POST /api/v1/prayers/auth/{apple,google,kakao}/callback` or `/auth/reviewer` → `user_auth`) —
 * a Prayers-only account (`prayers_users`, 2026-10-16), separate from saju_front's `users`, and the
 * value the server expects in the `User-Auth` header. The app is a client of an account, not a device.
 *
 * THE GAME TOKEN IS NOT A SECOND IDENTITY. It is a 24h credential issued for `userAuth`
 * (`GET /api/v1/prayers/game/token` → `pgt_…`), and it is how a release build gets through `Api::V1::BaseController
 * #authenticate` WITHOUT carrying the app-wide `SAJU_ACCESS_TOKEN` in its bundle. A captured game
 * token is one user for one day; a captured shared secret is every user forever.
 */
export type AuthProvider = 'apple' | 'google' | 'kakao' | 'reviewer' | 'dev';

/** A Prayers account id (`prayers_users.uid`), issued by `/api/v1/prayers/auth/*`. */
export const PRAYERS_UID_PREFIX = 'pr_';
/** A Prayers Game-Token, issued by `/api/v1/prayers/game/token`. */
export const PRAYERS_TOKEN_PREFIX = 'pgt_';

/**
 * Whether a stored uid can still sign this device in. Since the Prayers account split (2026-10-16)
 * only `pr_` uids resolve to an account; a shared `users` uid kept from an older build is refused
 * by every account endpoint, so it is dropped on load and the player signs in again. A `dev-` uid
 * stays usable in a dev build (the development server provisions it).
 */
export function isUsableUserAuth(uid: unknown): uid is string {
  if (typeof uid !== 'string' || uid.length === 0) return false;
  if (uid.startsWith(PRAYERS_UID_PREFIX)) return true;
  return __DEV__ && uid.startsWith('dev-');
}

interface AuthState {
  /** The account uid, sent as the `User-Auth` header. Null = nobody is signed in. */
  userAuth: string | null;
  provider: AuthProvider | null;
  displayName: string | null;
  /** 24h credential for `userAuth`. Null until fetched, cleared on sign-out. */
  gameToken: string | null;
  /** Epoch ms. Treated as expired a minute early — a token that dies mid-request is a 401 the
   *  player reads as "the counselor stopped answering". */
  gameTokenExpiresAt: number | null;
}

const empty: AuthState = {
  userAuth: null,
  provider: null,
  displayName: null,
  gameToken: null,
  gameTokenExpiresAt: null,
};

export const useAuthStore = create<AuthState>()(
  persist(() => empty, {
    name: 'prayers.auth.v1',
    storage: createJSONStorage(() => AsyncStorage),
    // An account from before the split (or its non-`pgt_` token) is not restored: nobody is signed
    // in, so the login screen asks again.
    merge: (persisted, current) => {
      const p = (persisted ?? {}) as Partial<AuthState>;
      if (!isUsableUserAuth(p.userAuth)) return { ...current, ...empty };
      const tokenOk = typeof p.gameToken === 'string' && p.gameToken.startsWith(PRAYERS_TOKEN_PREFIX);
      return {
        ...current,
        ...p,
        gameToken: tokenOk ? p.gameToken! : null,
        gameTokenExpiresAt: tokenOk ? p.gameTokenExpiresAt ?? null : null,
      };
    },
  }),
);

/** Non-hook accessors, for the imperative call sites (headers, bridge payload). */
export const getUserAuth = () => useAuthStore.getState().userAuth;
export const isSignedIn = () => useAuthStore.getState().userAuth != null;

export function signedIn(input: {
  userAuth: string;
  provider: AuthProvider;
  displayName?: string | null;
}) {
  // A different account must not inherit the previous one's game token.
  useAuthStore.setState({
    userAuth: input.userAuth,
    provider: input.provider,
    displayName: input.displayName ?? null,
    gameToken: null,
    gameTokenExpiresAt: null,
  });
}

export function signedOut() {
  useAuthStore.setState(empty);
}

export function storeGameToken(token: string, expiresAtMs: number) {
  useAuthStore.setState({ gameToken: token, gameTokenExpiresAt: expiresAtMs });
}

/**
 * Throw away the current game token, because the SERVER would not take it.
 *
 * ⚠️ THE CLOCK IS NOT THE ONLY WAY A TOKEN DIES. `validGameToken` only ever asked "has my own
 * expiry passed?", but the token lives in the server's Redis (GameToken.issue → setex), and Redis
 * forgets things the client's clock knows nothing about: a restart, a flush, an eviction, a
 * different machine. In that window the client holds a token it believes in and the server has
 * never heard of — and because `apiHeaders` returns as soon as it HAS a token, the request goes
 * out with the dead one and without the fallback credential, `authenticate` refuses it, and
 * nothing here noticed. Every call then 401s until the local clock happens to run out, which can
 * be another 23 hours.
 *
 * So a 401 is the second expiry signal, and this is how it is spent. Clearing the token is enough
 * to fix the next call: `ensureGameToken` mints a fresh one the moment `validGameToken` says null.
 */
export function invalidateGameToken() {
  useAuthStore.setState({ gameToken: null, gameTokenExpiresAt: null });
}

/** One minute of slack, so a token cannot expire between the check and the request. */
const EXPIRY_SLACK_MS = 60_000;

export function validGameToken(now = Date.now()): string | null {
  const { gameToken, gameTokenExpiresAt } = useAuthStore.getState();
  if (!gameToken || !gameTokenExpiresAt) return null;
  return gameTokenExpiresAt - EXPIRY_SLACK_MS > now ? gameToken : null;
}
