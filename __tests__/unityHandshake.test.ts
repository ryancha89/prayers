/**
 * The handshake must not be able to go unanswered.
 *
 * Seen on device 18-09, and the whole log was one line: "[room] the player never answered
 * SESSION_INIT". Both paths that open a session are conditional on state that arrives
 * asynchronously — `everReady` from a native promise, `view` from a React mount — so entering the
 * room in the window before either lands sends nothing at all, and no BRIDGE_READY is coming
 * either, because the surviving player announced itself to a JS context that no longer exists.
 * Nothing throws. The veil sits there for thirty seconds and then walks the player out.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import type { UnitySessionPayload } from '../src/features/counseling/types';

const payload = {
  sessionId: 'session_yuna_self',
  counselor: 'yuna_01',
  subject: { displayName: 'Me' },
} as unknown as UnitySessionPayload;

type Posted = { gameObject: string; method: string; message: string };

function bridgeWithView() {
  const posted: Posted[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({
    postMessage: (gameObject, method, message) => posted.push({ gameObject, method, message }),
  });
  const inits = () => posted.filter(p => JSON.parse(p.message).type === 'SESSION_INIT');
  return { bridge, posted, inits };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('says SESSION_INIT again when nobody answers', async () => {
  const { bridge, inits } = bridgeWithView();

  // The room opens in the window where neither the native promise nor a BRIDGE_READY has landed.
  await bridge.openCounselingRoom(payload);
  expect(inits()).toHaveLength(0);

  jest.advanceTimersByTime(1_500);
  expect(inits()).toHaveLength(1);

  jest.advanceTimersByTime(3_000);
  expect(inits()).toHaveLength(3);

  // ...and then it stops rather than talking to itself forever. The screen's own deadline is what
  // gives the player an answer after this.
  jest.advanceTimersByTime(30_000);
  expect(inits()).toHaveLength(3);
});

it('stops the moment the room is up, and never re-opens a running session', () => {
  const { bridge, inits } = bridgeWithView();
  bridge.openCounselingRoom(payload);

  jest.advanceTimersByTime(1_500);
  expect(inits()).toHaveLength(1);

  bridge.receiveFromUnity(JSON.stringify({ type: 'UNITY_READY' }));
  jest.advanceTimersByTime(30_000);

  // A second SESSION_INIT here would reload the scene under a player who is already in it.
  expect(inits()).toHaveLength(1);
});

it('stops retrying at the first word back, even before the room is up', () => {
  const { bridge, inits } = bridgeWithView();
  bridge.openCounselingRoom(payload);

  // The ordinary cold boot: the player announces itself before the first retry is due, and then
  // takes 5-8 s to load the room. Repeating SESSION_INIT through that load would restart the scene
  // load every 1.5 s and the room would never finish coming up.
  bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
  expect(inits()).toHaveLength(1);

  jest.advanceTimersByTime(10_000);
  expect(inits()).toHaveLength(1);
});

it('opens at once on the resume path, and still retries if that goes unanswered', () => {
  const { bridge, inits } = bridgeWithView();
  bridge.markSurvivor();                 // what silenceSurvivingUnity() resolves into

  bridge.openCounselingRoom(payload);
  expect(inits()).toHaveLength(1);       // no waiting: the survivor will not announce itself

  jest.advanceTimersByTime(1_500);
  expect(inits()).toHaveLength(2);
});

it('gives up cleanly when the room is closed mid-handshake', () => {
  const { bridge, inits } = bridgeWithView();
  bridge.openCounselingRoom(payload);
  bridge.closeCounselingRoom();

  jest.advanceTimersByTime(30_000);
  // Leaving before the player answered must not keep poking it — the next entry opens its own.
  expect(inits()).toHaveLength(0);
});
