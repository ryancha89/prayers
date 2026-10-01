/**
 * The train journey's cabin (spec 003) opens the way the meditation room does: JOURNEY_INIT is
 * repeated until the player answers, and the last cabin state is re-sent on JOURNEY_READY, because
 * the first states of a journey are sent while the scene is still loading.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import type { JourneyStatePayload } from '../src/features/counseling/types';

const init = { journeyId: 'newyear-2027', counselorId: 'yunjung', lang: 'ko' };
const state: JourneyStatePayload = {
  scene: 'station', status: 'playing', transitionTo: '', transitionMs: 2800, month: 0, speaking: true, rough: 0,
};

function bridgeWithView() {
  const posted: { type: string; payload?: unknown }[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_g, _m, message) => posted.push(JSON.parse(message)) });
  return { bridge, posted, of: (type: string) => posted.filter(p => p.type === type) };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('repeats JOURNEY_INIT until the cabin answers, then stops', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  expect(of('JOURNEY_INIT')).toHaveLength(1);
  expect(of('JOURNEY_INIT')[0].payload).toEqual(init);

  jest.advanceTimersByTime(1600);
  expect(of('JOURNEY_INIT')).toHaveLength(2);

  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  jest.advanceTimersByTime(10000);
  expect(of('JOURNEY_INIT')).toHaveLength(2);
});

it('re-sends the latest cabin state when the cabin comes up', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  bridge.sendJourneyState({ ...state, scene: 'station' });
  bridge.sendJourneyState({ ...state, scene: 'dawnCity' });
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  const states = of('JOURNEY_STATE');
  expect((states[states.length - 1].payload as JourneyStatePayload).scene).toBe('dawnCity');
});

it('closing sends JOURNEY_END and forgets the journey', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  bridge.closeJourneyRoom();
  expect(of('JOURNEY_END')).toHaveLength(1);
  jest.advanceTimersByTime(10000);
  expect(of('JOURNEY_INIT')).toHaveLength(1);
});

it('sends the voice envelope, and replays it BEFORE the state when the cabin comes up', () => {
  // The state's `speaking` starts the mouth's clock in Unity, so the envelope must already be there.
  const { bridge, posted, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  const voice = { key: '3:0:0', fps: 25, levels: [0, 80, 100, 0], startAt: 0 };
  bridge.sendJourneyVoice(voice);
  expect(of('JOURNEY_VOICE').pop()?.payload).toEqual(voice);
  bridge.sendJourneyState(state);
  posted.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  const order = posted.map(p => p.type);
  expect(order.indexOf('JOURNEY_VOICE')).toBeGreaterThanOrEqual(0);
  expect(order.indexOf('JOURNEY_VOICE')).toBeLessThan(order.indexOf('JOURNEY_STATE'));
});

it('clamps the pinch zoom and re-sends it when the cabin comes up', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  bridge.sendJourneyZoom(1.7);
  expect(of('JOURNEY_ZOOM').pop()?.payload).toEqual({ zoom: 1 });
  bridge.sendJourneyZoom(0.4);
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  expect(of('JOURNEY_ZOOM').pop()?.payload).toEqual({ zoom: 0.4 });
});

it('starts the cabin on the wide view, even for a Unity build that starts elsewhere', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  expect(of('JOURNEY_ZOOM').pop()?.payload).toEqual({ zoom: 0 });
  expect(of('JOURNEY_LOOK')).toHaveLength(0);
});

it('clamps the look-around, re-sends it when the cabin comes up, and forgets it on leaving', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom(init);
  bridge.sendJourneyLook(-2, 0.3);
  expect(of('JOURNEY_LOOK').pop()?.payload).toEqual({ yaw: -1, pitch: 0.3 });
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  expect(of('JOURNEY_LOOK').pop()?.payload).toEqual({ yaw: -1, pitch: 0.3 });

  bridge.closeJourneyRoom();
  const before = of('JOURNEY_LOOK').length;
  bridge.openJourneyRoom(init);
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  expect(of('JOURNEY_LOOK')).toHaveLength(before);
});

it('carries the platform flag on JOURNEY_INIT and posts JOURNEY_BOARD', () => {
  const { bridge, of } = bridgeWithView();
  bridge.openJourneyRoom({ ...init, platform: true });
  expect(of('JOURNEY_INIT')[0].payload).toEqual({ ...init, platform: true });
  bridge.receiveFromUnity(JSON.stringify({ type: 'JOURNEY_READY' }));
  bridge.sendJourneyBoard();
  expect(of('JOURNEY_BOARD')).toHaveLength(1);
});
