import { NativeModules, UIManager } from 'react-native';
import { devlog } from '../../../shared/devlog';
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
 *
 * 2026-09-03 — this now points at the REAL Rails server on :4000, not the canned stub on :4001.
 *
 * What changed: :4000's only dead part was its model credentials (Gemini's key 401s, and
 * OPENAI_ACCESS_TOKEN is a placeholder), so every consultation ended as 503 API_ERROR.
 * `Tools/LocalLlmBridge/local_llm_bridge.py` now serves an OpenAI-compatible endpoint on :4002
 * backed by the locally-authenticated `codex exec` CLI, and saju_server/.env points
 * OPENAI_URI_BASE at it. Only the model transport is local — auth, the ticket ledger, the chart,
 * prompt assembly, ChatSummary history and every DB write are the real server's.
 *
 * Two processes have to be up in dev, or the room falls back to the "connection interrupted"
 * notice:
 *     python3 Tools/LocalLlmBridge/local_llm_bridge.py       # :4002
 *     (cd saju_server && bundle exec rails server -p 4000)   # :4000
 *
 * Voice: ConsultationTts posts to /api/v1/prayers/tts (the only tts route Rails has — it used to
 * ask for /api/v1/game/tts, which 404s, and degraded to silence rather than erroring). It still
 * needs GEMINI_API_KEY in saju_server/.env; without one the room is silent but nothing breaks.
 *
 * The stub is still there (`Tools/FakeSajuServer/fake_saju_server.py`, :4001) for offline work and
 * for its failure modes (essay / partial / error / noticket / slow), which :4000 cannot be asked
 * to produce on demand.
 */
export const unityApiBase = __DEV__ ? 'http://localhost:4000' : undefined;

if (__DEV__) {
  const line = `[unity-bridge] native Unity ${hasNativeUnity ? 'DETECTED' : 'absent — using mock'}`;
  console.log(line);
  // Through devlog as well: the console mirror only wraps warn/error (log is far too chatty to
  // ship wholesale), and this one line answers the question that costs the most time to answer any
  // other way — whether this build is talking to the embedded player or quietly to the mock.
  devlog(line);
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
