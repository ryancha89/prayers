import { NativeModules, Platform } from 'react-native';

/**
 * Whether the app runs on a simulator / emulator rather than a phone (10-15).
 *
 * What it decides: a dev build buys through the server's `dev` purchase ONLY here. A dev build on a
 * real phone goes through the store (the sandbox account), which is how a purchase is tested before
 * release; a release build always does. `__DEV__` alone cannot tell a simulator from a phone.
 *
 * iOS: the native DeviceKind module's compile-time TARGET_OS_SIMULATOR. Android: the build
 * fingerprint every emulator image carries. Unknown (a build without DeviceKind) reads as a phone —
 * the store is the safe side to fall on.
 */
export function isSimulator(): boolean {
  if (Platform.OS === 'ios') return NativeModules.DeviceKind?.isSimulator === true;
  if (Platform.OS === 'android') {
    const c = (Platform.constants ?? {}) as { Fingerprint?: string; Model?: string };
    const fp = String(c.Fingerprint ?? '');
    const model = String(c.Model ?? '');
    return fp.startsWith('generic') || fp.includes('emulator') || /sdk_gphone|Emulator|Android SDK built for/.test(model);
  }
  return false;
}

/** A dev build on a simulator: purchases go through the server's `dev` platform, not the store. */
export const devPurchases = (): boolean => typeof __DEV__ !== 'undefined' && __DEV__ && isSimulator();
