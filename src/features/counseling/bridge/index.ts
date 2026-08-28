import { NativeModules, UIManager } from 'react-native';
import { UnityBridge } from '../types';
import { MockUnityBridge } from './MockUnityBridge';
import { NativeUnityBridge } from './NativeUnityBridge';

/**
 * Single entry point for the Unity bridge (rule §52-7/8). Picks the real
 * native bridge when the RNUnityView native component is linked (i.e. the
 * exported Unity library is present in the android/ios builds), otherwise
 * falls back to the JS mock so the app keeps working without Unity.
 */
const hasNativeUnity = (() => {
  try {
    return UIManager.hasViewManagerConfig('RNUnityView');
  } catch {
    return false;
  }
})();

/** True when the embedded Unity player is available in this build. */
export const isNativeUnity = hasNativeUnity;

/**
 * Rails host the embedded consultation talks to. Dev: the Mac's local server
 * (the iOS simulator shares the host's localhost). Production wiring lands
 * with the login milestone.
 */
export const unityApiBase = __DEV__ ? 'http://localhost:4000' : undefined;

if (__DEV__) {
  console.log(`[unity-bridge] native Unity ${hasNativeUnity ? 'DETECTED' : 'absent — using mock'}`);
}

/** Always instantiated so UnityHost can wire itself even in mock builds. */
export const nativeUnityBridge = new NativeUnityBridge();

// A JS reload skips React cleanups, so a running Unity instance (and its BGM)
// survives into this fresh context. Silence it natively and, if one survived,
// flip the bridge onto the resume path (see NativeUnityBridge.markSurvivor).
if (hasNativeUnity) {
  NativeModules.UnityLifecycle?.silenceSurvivingUnity()
    .then((alive: boolean) => {
      if (!alive) return;
      nativeUnityBridge.markSurvivor();
      if (__DEV__) console.log('[unity-bridge] surviving Unity instance silenced');
    })
    .catch(() => {});
}

export const unityBridge: UnityBridge = hasNativeUnity
  ? nativeUnityBridge
  : new MockUnityBridge();

export { MockUnityBridge } from './MockUnityBridge';
export { NativeUnityBridge } from './NativeUnityBridge';
export type { UnityBridge } from '../types';
