import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { apiHeaders, authedFetch } from '../../auth/api/headers';

/**
 * The profile photo on the server — the Prayers account's own profile (`prayers_users`, 2026-10-16;
 * no longer the shared `Api::V1::ProfilesController` row saju_front shows).
 *
 *   POST  /api/v1/prayers/profile/upload_profile_image  multipart `profile_image` → `{ok, url}`.
 *         Upload only; the server drops this account's previous copy under profiles/.
 *   PATCH /api/v1/prayers/profile/update_profile_image  `{profile: {image_path}}` — points the
 *         account at it (null clears it).
 *   GET   /api/v1/prayers/profile                       the account, `image_path` included.
 *
 * All three find the account by the `pgt_` Game-Token that `apiHeaders` sends.
 */
const BASE = () => `${apiBase()}/api/v1/prayers/profile`;

/** The account headers minus the JSON Content-Type: multipart must set its own boundary. */
const withoutContentType = (h: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(h).filter(([k]) => k !== 'Content-Type'));

/** The CDN url of the uploaded copy; null on any failure (no network, no credential, a 4xx/5xx). */
export async function uploadAvatar(localUri: string): Promise<string | null> {
  const h = await apiHeaders();
  if (!h) return null;
  const form = new FormData();
  form.append('profile_image', { uri: localUri, name: 'avatar.jpg', type: 'image/jpeg' } as any);
  try {
    const res = await fetch(`${BASE()}/upload_profile_image`, { method: 'POST', headers: withoutContentType(h), body: form });
    let body: any = null;
    try { body = await res.json(); } catch {}
    if (res.ok && body?.ok && typeof body.url === 'string') return body.url;
    devlog(`[avatar] upload ${res.status} ${body?.error ?? ''}`);
    return null;
  } catch (e) {
    devlog(`[avatar] upload threw ${String(e)}`);
    return null;
  }
}

/** Point the Profile row at `url` (null clears it). True when the server took it. */
export async function linkAvatar(url: string | null): Promise<boolean> {
  try {
    const res = await authedFetch(`${BASE()}/update_profile_image`, {
      method: 'PATCH',
      body: JSON.stringify({ profile: { image_path: url } }),
    });
    if (!res) return false;
    if (!res.ok) devlog(`[avatar] link ${res.status}`);
    return res.ok;
  } catch (e) {
    devlog(`[avatar] link threw ${String(e)}`);
    return false;
  }
}

/** The row's `image_path`: a url, null when it has none, undefined when the server could not be asked. */
export async function fetchAvatarUrl(): Promise<string | null | undefined> {
  try {
    const res = await authedFetch(BASE());
    if (!res || !res.ok) return undefined;
    const body: any = await res.json();
    const path = body?.image_path ?? body?.profile?.image_path;
    return typeof path === 'string' && /^https?:\/\//.test(path) ? path : null;
  } catch {
    return undefined;
  }
}
