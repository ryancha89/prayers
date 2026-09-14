import { SAJU_ACCESS_TOKEN } from '../../counseling/api/devToken';
import { devlog } from '../../../shared/devlog';
import { getUserAuth } from '../store/authStore';
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
