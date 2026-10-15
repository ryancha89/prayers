/**
 * The meditation room is a Unity scene now (21-09). Two ways that can fail without anything
 * throwing, and this file is both of them.
 *
 * 1. THE MESSAGE NEVER LEAVES. `sendEvent` queues everything until `ready`, and `ready` is set by
 *    UNITY_READY — which the meditation room never sends, because it has no counselor to be ready
 *    with. Routed the ordinary way, MEDITATION_INIT would sit in the outbox for the whole session
 *    and the room would simply never open, with nothing in the log to say why. So it posts
 *    directly, and that is what the first test holds.
 *
 * 2. THE ROOM IS SILENCED ON ARRIVAL. App.tsx's navigation guard calls `stopAllAudio()` for every
 *    screen outside UNITY_SCREENS, and that call posts SESSION_END — Unity's teardown. Leave
 *    'MeditationRoom' out of the set and the player walks into the room and the room switches
 *    itself off behind them.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import { UNITY_SCREENS } from '../src/App';

type Posted = { gameObject: string; method: string; message: string };

function bridgeWithView() {
  const posted: Posted[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({
    postMessage: (gameObject, method, message) => posted.push({ gameObject, method, message }),
  });
  const types = () => posted.map(p => JSON.parse(p.message).type);
  return { bridge, types };
}

it('sends MEDITATION_INIT straight away, without waiting to be ready', () => {
  const { bridge, types } = bridgeWithView();

  // Nothing has made this bridge `ready` — no UNITY_READY has arrived and none is coming.
  bridge.openMeditationRoom();

  expect(types()).toContain('MEDITATION_INIT');
});

it('closes the room on the way out', () => {
  const { bridge, types } = bridgeWithView();

  bridge.openMeditationRoom();
  bridge.closeMeditationRoom();

  expect(types()).toEqual(['MEDITATION_INIT', 'MEDITATION_END']);
});

it('keeps the transport open once the room answers', () => {
  const { bridge, types } = bridgeWithView();

  bridge.openMeditationRoom();
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDITATION_READY' }));
  // Anything sent afterwards must go out rather than queue — the room has proved it is listening.
  bridge.sendEvent({ type: 'SESSION_END' });

  expect(types()).toEqual(['MEDITATION_INIT', 'SESSION_END']);
});

it('counts the meditation room as a Unity screen, so the nav guard does not silence it', () => {
  expect(UNITY_SCREENS.has('MeditationRoom')).toBe(true);
});

/**
 * The player can boot UNDERNEATH this opening too.
 *
 * Measured on device 21-09: MEDITATION_INIT went out at 19.393 into a UnityView whose runtime was
 * still coming up, the player announced BRIDGE_READY at 20.420, and MEDITATION_READY never came —
 * the screen sat on its fallback photo with the real room never loading. The consultation path had
 * just been fixed for exactly this; the meditation path has no `payload` to hang the same repeat
 * on, so it needs a pending flag of its own.
 */
it('says MEDITATION_INIT again when the player boots afterwards', () => {
  const { bridge, types } = bridgeWithView();

  bridge.openMeditationRoom();
  bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));

  expect(types().filter(t => t === 'MEDITATION_INIT')).toHaveLength(2);
});

it('stops repeating once the room answers', () => {
  const { bridge, types } = bridgeWithView();

  bridge.openMeditationRoom();
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDITATION_READY' }));
  // A later BRIDGE_READY (another room's boot) must not reopen a room that is already up.
  bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));

  expect(types().filter(t => t === 'MEDITATION_INIT')).toHaveLength(1);
});

/* ── 24-09: the room could stay on its photo, and the girl in it now follows the session ── */

it('repeats MEDITATION_INIT until the room answers, then stops', () => {
  jest.useFakeTimers();
  try {
    const { bridge, types } = bridgeWithView();
    bridge.openMeditationRoom();
    // The first one was lost (it went to a view that was leaving). Nothing else will resend it.
    jest.advanceTimersByTime(1500);
    expect(types().filter(t => t === 'MEDITATION_INIT')).toHaveLength(2);

    bridge.receiveFromUnity(JSON.stringify({ type: 'MEDITATION_READY' }));
    jest.advanceTimersByTime(10_000);
    expect(types().filter(t => t === 'MEDITATION_INIT')).toHaveLength(2);
  } finally {
    jest.useRealTimers();
  }
});

it('gives up after a bounded number of retries', () => {
  jest.useFakeTimers();
  try {
    const { bridge, types } = bridgeWithView();
    bridge.openMeditationRoom();
    jest.advanceTimersByTime(60_000);
    expect(types().filter(t => t === 'MEDITATION_INIT')).toHaveLength(1 + 4);
  } finally {
    jest.useRealTimers();
  }
});

it('sends MEDITATION_INIT again when a new view registers', () => {
  const posted: string[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: () => {} });   // the consultation's view, about to go
  bridge.openMeditationRoom();
  bridge.registerView({ postMessage: (_g, _m, msg) => posted.push(JSON.parse(msg).type) });
  expect(posted).toContain('MEDITATION_INIT');
  bridge.closeMeditationRoom();
});

it('re-sends the session state when the room answers', () => {
  const { bridge, types } = bridgeWithView();
  bridge.openMeditationRoom();
  // Begin pressed while the scene is still loading.
  bridge.sendMeditationState({ state: 'breathing', inMs: 4000, holdMs: 4000, outMs: 6000, intoMs: 0 });
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDITATION_READY' }));
  expect(types().filter(t => t === 'MEDITATION_STATE')).toHaveLength(2);
  bridge.closeMeditationRoom();
});

it('tells the room where in the 4-4-6 cycle the session is', () => {
  const { breathSync } = require('../src/features/meditation/session');
  expect(breathSync(0)).toEqual({ inMs: 4000, holdMs: 4000, outMs: 6000, intoMs: 0 });
  // 15 s in = one full 14 s cycle plus one second of the next in-breath.
  expect(breathSync(15_000).intoMs).toBe(1000);
});
