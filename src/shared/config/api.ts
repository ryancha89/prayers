import { Platform } from 'react-native';

/**
 * Where the app talks to saju_server, and how it proves who it is.
 *
 * THIS FILE EXISTS BECAUSE A RELEASE BUILD USED TO HAVE NO SERVER AT ALL. The base was
 * `__DEV__ ? 'http://localhost:4000' : undefined`, so every call outside a dev bundle returned null
 * and the room quietly fell back to its scripted replies — an app that looks like it works and has
 * never once spoken to the backend.
 *
 * The hosts are saju_front's (`src/api/index.js`), because it is the app that has been talking to
 * this server in production for years. Copying its values is deliberate: a second opinion about
 * which host is production is how half a release ends up pointed at staging.
 *
 * ⚠️ `localhost` is not the same address on every simulator. iOS shares the Mac's loopback; the
 * Android emulator reaches the host machine at 10.0.2.2 and resolves `localhost` to the emulator
 * itself, where nothing is listening. saju_front learned this; the Prayers app had the iOS spelling
 * hard-coded, which is why it only ever worked on one of the two.
 */
const DEV_HOST = Platform.OS === 'android' ? 'http://10.0.2.2:4000' : 'http://127.0.0.1:4000';
const PROD_HOST = 'https://api.perpetualtalk.com';
const STAGING_HOST = 'https://staging.perpetualtalk.com';

/** Point a dev build at staging without editing this file. */
let override: string | null = null;

/** Testing seam; also how a QA build can be pointed at staging at runtime. */
export function setApiBaseOverride(url: string | null) {
  override = url && url.length > 0 ? url.replace(/\/+$/, '') : null;
}

export const stagingApiBase = STAGING_HOST;

export function apiBase(): string {
  if (override) return override;
  return __DEV__ ? DEV_HOST : PROD_HOST;
}
