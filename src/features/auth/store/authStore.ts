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
 * WHAT IT IS INSTEAD. `userAuth` is the uid saju_server returns from a social sign-in
 * (`POST /api/v1/auth/{apple,google}/callback` → `user_auth`) — the same identity saju_front has
 * used in production for years, and the same value the server already expects in the `User-Auth`
 * header. The app is now a client of an account, not of a device.
 *
 * THE GAME TOKEN IS NOT A SECOND IDENTITY. It is a 24h credential issued for `userAuth`
 * (`GET /api/v1/game/token`), and it is how a release build gets through `Api::V1::BaseController
 * #authenticate` WITHOUT carrying the app-wide `SAJU_ACCESS_TOKEN` in its bundle. A captured game
 * token is one user for one day; a captured shared secret is every user forever.
 */
export type AuthProvider = 'apple' | 'google' | 'dev';

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

/** One minute of slack, so a token cannot expire between the check and the request. */
const EXPIRY_SLACK_MS = 60_000;

export function validGameToken(now = Date.now()): string | null {
  const { gameToken, gameTokenExpiresAt } = useAuthStore.getState();
  if (!gameToken || !gameTokenExpiresAt) return null;
  return gameTokenExpiresAt - EXPIRY_SLACK_MS > now ? gameToken : null;
}
