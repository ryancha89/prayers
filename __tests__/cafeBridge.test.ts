/**
 * The cafe's in-scene events reach their listeners. CAFE_DECK_READY ends in `_READY` but is not a scene
 * handshake: the stale-READY filter once dropped it and the tarot stuck at "spreading" (21-10).
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';

function cafeBridge() {
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: () => {} });
  bridge.openCafe({ lang: 'ko' });
  bridge.receiveFromUnity(JSON.stringify({ type: 'CAFE_READY', payload: { guest: 'g', spots: [] } }));
  const seen: string[] = [];
  bridge.onEvent(e => seen.push(e.type));
  return { bridge, seen };
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('passes CAFE_DECK_READY on to the table', () => {
  const { bridge, seen } = cafeBridge();
  bridge.receiveFromUnity(JSON.stringify({ type: 'CAFE_DECK_READY', payload: {} }));
  expect(seen).toContain('CAFE_DECK_READY');
});

it('still drops a late READY from another scene', () => {
  const { bridge, seen } = cafeBridge();
  bridge.receiveFromUnity(JSON.stringify({ type: 'MYROOM_READY' }));
  expect(seen).not.toContain('MYROOM_READY');
});
