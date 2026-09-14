import { NativeModules, UIManager } from 'react-native';
import { devlog } from '../../../shared/devlog';
import { apiBase } from '../../../shared/config/api';
import { UnityBridge } from '../types';
import { MockUnityBridge } from './MockUnityBridge';
import { NativeUnityBridge } from './NativeUnityBridge';

/**
 * Single entry point for the Unity bridge (rule §52-7/8). Picks the real
 * native bridge when the RNUnityView native component is linked (i.e. the
 * exported Unity library is present in the android/ios builds), otherwise
 * falls back to the JS mock so the app keeps working without Unity.
 */
/**
 * ⚠️ ASKED EVERY TIME, AND ONLY A `true` IS REMEMBERED.
 *
 * This used to be an IIFE run once at module scope, and the answer — whatever it was — stood for
 * the life of the JS context. That is safe only if the question can never be answered wrongly, and
 * on 2026-09-14 the devlog caught it answered wrongly twice in two minutes: two reloads landing
 * mid-session both logged "absent — using mock" on a build whose framework was demonstrably linked
 * (the cold launch either side of them logged DETECTED).
 *
 * What that costs is the whole game. `absent` silently swaps the embedded player for a JS mock:
 * the room still opens, the flow still runs, the text still appears — and there is no counselor, no
 * voice, no music and no SFX, with nothing on screen saying so. It is indistinguishable from "the
 * audio work did not land", which is exactly how it was reported.
 *
 * So: never freeze a negative. A `false` is treated as "not yet", re-asked on the next call, and the
 * room asks again at the moment it actually needs to know. A `true` is cached because a view
 * manager that exists does not stop existing.
 */
let unityDetected = false;

export function isNativeUnity(): boolean {
  if (unityDetected) return true;
  try {
    unityDetected = UIManager.hasViewManagerConfig('RNUnityView') === true;
  } catch {
    unityDetected = false;
  }
  return unityDetected;
}

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
/**
 * The host the EMBEDDED PLAYER should call, handed to it in SESSION_INIT.
 *
 * Was `__DEV__ ? 'http://localhost:4000' : undefined`, which quietly meant a release build had no
 * server on either side of the bridge. It is now the same host the app itself uses — one answer,
 * in `shared/config/api.ts`, so RN and Unity can never disagree about which backend a build talks
 * to. That disagreement is not theoretical: the two were configured in different files.
 */
export const unityApiBase = apiBase();

if (__DEV__) {
  const line = `[unity-bridge] native Unity ${isNativeUnity() ? 'DETECTED' : 'absent at import — will re-ask'}`;
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
if (isNativeUnity()) {
  NativeModules.UnityLifecycle?.silenceSurvivingUnity()
    .then((alive: boolean) => {
      if (!alive) return;
      nativeUnityBridge.markSurvivor();
      if (__DEV__) console.log('[unity-bridge] surviving Unity instance silenced');
    })
    .catch(() => {});
}

let mockBridge: UnityBridge | null = null;

/**
 * The bridge to talk to, decided WHEN ASKED rather than at import.
 *
 * Same reason as above: a module-scope const would hand out the mock forever on the strength of one
 * bad answer, and a screen that opened five seconds later, on a context where the player is plainly
 * there, would still be talking to it.
 */
export function getUnityBridge(): UnityBridge {
  if (isNativeUnity()) return nativeUnityBridge;
  mockBridge ??= new MockUnityBridge();
  return mockBridge;
}

export { MockUnityBridge } from './MockUnityBridge';
export { NativeUnityBridge } from './NativeUnityBridge';
export type { UnityBridge } from '../types';
