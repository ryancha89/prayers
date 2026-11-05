/**
 * Firebase Analytics (project prayers-c80e9, 2026-11-05) — usage statistics only.
 *
 * What it is NOT: advertising or tracking. The advertising ID, IDFV/SSAID, ad storage and ad
 * personalisation are all off (firebase.json), so iOS needs no App Tracking Transparency prompt.
 * No user id and no personal data are ever set: events say what happened ("a consultation
 * started"), never who it happened to — so the App Privacy label lists analytics data as NOT
 * linked to the user. Keep it that way: never pass a uid, name, email, question or birth date here.
 *
 * Behind a guarded require like the sign-in providers: a build or test without the native module
 * simply records nothing.
 */
type AnalyticsModule = {
  getAnalytics(): unknown;
  logEvent(instance: unknown, name: string, params?: Record<string, string | number>): Promise<void>;
  logScreenView(instance: unknown, params: { screen_name: string; screen_class: string }): Promise<void>;
};

let mod: AnalyticsModule | null | undefined;

function load(): AnalyticsModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('@react-native-firebase/analytics') as AnalyticsModule;
    if (typeof mod?.getAnalytics !== 'function') mod = null;
  } catch {
    mod = null;
  }
  return mod;
}

let lastScreen: string | null = null;

/** One screen_view per change of route (automatic screen reporting is off: it only sees the
 *  single native activity / view controller, not React Navigation's screens). */
export function trackScreen(name: string | null | undefined): void {
  if (!name || name === lastScreen) return;
  lastScreen = name;
  const a = load();
  if (!a) return;
  // Statistics must never take a screen down: a native error can throw before the promise exists.
  try {
    a.logScreenView(a.getAnalytics(), { screen_name: name, screen_class: name }).catch(() => {});
  } catch {}
}

export type AnalyticsEvent =
  | { name: 'login'; params: { method: string } }
  | { name: 'ai_consent'; params: { action: 'granted' | 'withdrawn' } }
  | { name: 'consultation_message'; params: { counselor: string } }
  | { name: 'coins_credited'; params: { product: string; coins: number } };

export function track(e: AnalyticsEvent): void {
  const a = load();
  if (!a) return;
  try {
    a.logEvent(a.getAnalytics(), e.name, e.params).catch(() => {});
  } catch {}
}

/** Test seam: forget the cached module and the last screen. */
export function resetAnalyticsForTests(): void {
  mod = undefined;
  lastScreen = null;
}
