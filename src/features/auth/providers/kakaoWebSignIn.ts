import { NativeModules, Platform } from 'react-native';
import { apiBase } from '../../../shared/config/api';

/**
 * Kakao login through OUR server (10-17), the iOS way in.
 *
 * The Kakao iOS SDK gets an authorization code fine, but its token exchange is refused by Kakao with
 * KOE009 "IOS bundleId validation failed" — with the bundle id registered on the one native key
 * (captured from the SDK's own log). The web flow has no bundle-id check: the system login sheet
 * opens Kakao's authorize page with the REST API key, Kakao redirects to the server's
 * `auth/kakao/web_callback`, the server exchanges the code (REST key + client secret), signs the
 * player in and redirects to `prayersauth://kakao?ticket=…`. The ticket is traded for the `pr_` uid
 * by `signInWithKakaoTicket` — the uid itself never travels in a URL.
 *
 * Kakao Developers needs the callback registered as a Redirect URI on the REST API key, for both
 * hosts `apiBase()` can be (production and the dev server).
 */
const KAKAO_REST_KEY = 'c2f041b96439b4133fa8ce9c1feb20fd';
const SCHEME = 'prayersauth';

type WebAuthModule = { start(url: string, scheme: string): Promise<string> };
const webAuth = (): WebAuthModule | null => (NativeModules.WebAuth as WebAuthModule | undefined) ?? null;

export function kakaoWebSignInAvailable(): boolean {
  return Platform.OS === 'ios' && webAuth() != null;
}

export const kakaoWebRedirectUri = () => `${apiBase()}/api/v1/prayers/auth/kakao/web_callback`;

/** Opens Kakao's login, returns the server's one-time ticket. Throws "cancelled" on a cancel. */
export async function requestKakaoWebTicket(): Promise<string> {
  const auth = webAuth();
  if (!auth) throw new Error('WebAuth is not in this build.');
  const state = Math.random().toString(36).slice(2, 12);
  const url =
    'https://kauth.kakao.com/oauth/authorize' +
    `?client_id=${KAKAO_REST_KEY}` +
    `&redirect_uri=${encodeURIComponent(kakaoWebRedirectUri())}` +
    '&response_type=code' +
    `&state=${state}`;
  const back = await auth.start(url, SCHEME);
  const query = parseQuery(back);
  if (query.state !== state) throw new Error('kakao web: state mismatch');
  if (query.error) throw new Error(`kakao web: ${query.error}`);
  if (!query.ticket) throw new Error('kakao web: no ticket');
  return query.ticket;
}

function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const q = url.split('?')[1] ?? '';
  for (const part of q.split('&')) {
    if (!part) continue;
    const [k, v = ''] = part.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}
