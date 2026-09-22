import { SAJU_ACCESS_TOKEN } from '../../counseling/api/devToken';
import { devlog } from '../../../shared/devlog';
import { getUserAuth, invalidateGameToken } from '../store/authStore';
import { ensureGameToken } from './session';

/**
 * The headers every saju_server call carries — one place, because there are now two ways in and
 * picking the wrong one is a 401 that reads as "the server is down".
 *
 *   1. `Game-Token` — a 24h credential issued for this account. The path a RELEASE build takes:
 *      nothing secret is compiled into the bundle, and a stolen token is one user for one day.
 *   2. `Saju-Authorization: Bearer-<SAJU_ACCESS_TOKEN>` — the app-wide shared secret. Dev only,
 *      and only as a fallback, because a secret that ships in a bundle is a secret everyone has.
 *
 * `User-Auth` rides along with both. Path 1 resolves the user from the token itself, but several
 * controllers (game_controller, saju_controller#tickets) read the uid header directly, and sending
 * it costs nothing.
 *
 * Returns null when the app has no way to authenticate at all — callers must treat that as "do not
 * send the request", not as an error to retry.
 */
let warned = false;

export async function apiHeaders(): Promise<Record<string, string> | null> {
  const uid = getUserAuth();
  const base: Record<string, string> = { 'Content-Type': 'application/json' };
  if (uid) base['User-Auth'] = uid;

  const token = await ensureGameToken();
  if (token) return { ...base, 'Game-Token': token };

  if (__DEV__ && SAJU_ACCESS_TOKEN && uid) {
    return { ...base, 'Saju-Authorization': `Bearer-${SAJU_ACCESS_TOKEN}` };
  }

  if (__DEV__ && !warned) {
    warned = true;
    const line = uid
      ? '[auth] signed in as ' +
        uid +
        ' but no Game-Token could be fetched and devToken.ts is empty — every server call will be ' +
        'skipped and the room will use its scripted replies.'
      : '[auth] nobody is signed in, so no server call can be made.';
    console.warn(line);
    devlog(line);
  }
  return null;
}

/**
 * A server call that survives its own credential dying.
 *
 * WHY THIS EXISTS. Every call site used to be `const h = await apiHeaders(); fetch(url, {headers: h})`,
 * and that shape cannot recover from the one failure the credential actually has. The game token
 * lives in the server's Redis with a 24h TTL; the client only knows its own copy of the expiry. A
 * Redis restart, a flush, an eviction or a different backend leaves the client holding a token the
 * server has never heard of. `apiHeaders` returns the moment it HAS a token — so it does not send
 * the `Saju-Authorization` fallback either — and `Api::V1::BaseController#authenticate` refuses
 * the request outright. It never falls back to `User-Auth`; that header is only read later, by
 * `current_user`.
 *
 * Measured on 2026-09-21: entering the room answered 401 to `consultations/recall`, `saju/tickets`
 * and `consultations` while the same uid answered 200 the moment a fresh token was minted.
 *
 * So: a 401 is treated as the token having expired, which is what it is. The token is thrown away,
 * a new one is minted by `apiHeaders` on the way back through, and the call is retried ONCE. Once,
 * because the second 401 is about the account rather than the credential, and a client that keeps
 * retrying an answer the server keeps giving is a loop.
 *
 * Returns null under exactly the condition `apiHeaders` does — there is no way to authenticate at
 * all — so callers keep treating that as "do not send", not as an error.
 */
export async function authedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response | null> {
  const headers = await apiHeaders();
  if (!headers) return null;

  const send = (h: Record<string, string>) =>
    fetch(url, { ...init, headers: { ...h, ...(init.headers as Record<string, string>) } });

  const res = await send(headers);
  // Only a game token is worth retrying. A 401 carrying the shared dev secret means that secret is
  // wrong, and minting a token would not change it; a 401 carrying nothing cannot be retried at all.
  if (res.status !== 401 || !headers['Game-Token']) return res;

  devlog('[auth] 401 with a game token — the server does not know it; minting a new one');
  invalidateGameToken();

  const fresh = await apiHeaders();
  // No new credential to be had (offline, or game/token itself refused) — hand back the 401 rather
  // than a null the caller would read as "not signed in".
  if (!fresh || fresh['Game-Token'] === headers['Game-Token']) return res;

  return send(fresh);
}
