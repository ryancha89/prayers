/**
 * Tree of Mind's half of the bridge (spec 008): GARDEN_INIT is repeated until GARDEN_READY (the garden
 * never sends UNITY_READY), READY replays the insets and the sitting's state, the growth is folded into
 * the INIT a reload would send, and leaving says GARDEN_END.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';

function garden() {
  const sent: any[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_o, _m, json) => sent.push(JSON.parse(json)) });
  return { bridge, sent, types: () => sent.map(m => m.type) };
}

const INIT = { lang: 'ko', level: 2, progress: 0.5, energy: 0.25, variant: '' };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('opens the garden directly and repeats GARDEN_INIT until the garden answers', () => {
  const { bridge, sent, types } = garden();
  bridge.openGarden(INIT);
  expect(sent[0]).toEqual({ type: 'GARDEN_INIT', payload: INIT });
  jest.advanceTimersByTime(1500);
  expect(types().filter(t => t === 'GARDEN_INIT')).toHaveLength(2);
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_READY' }));
  jest.advanceTimersByTime(6000);
  expect(types().filter(t => t === 'GARDEN_INIT')).toHaveLength(2);
});

it('replays the insets and the sitting on GARDEN_READY', () => {
  const { bridge, sent, types } = garden();
  bridge.openGarden(INIT);
  bridge.sendViewInsets({ top: 0.1, right: 0, bottom: 0.3, left: 0, landscape: false });
  bridge.sendGardenState({ state: 'sitting', inMs: 4000, outMs: 6000, intoMs: 0 });
  sent.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_READY' }));
  expect(types()).toEqual(['VIEW_INSETS', 'GARDEN_STATE']);
  expect(sent[1].payload).toEqual({ state: 'sitting', inMs: 4000, outMs: 6000, intoMs: 0 });
});

it('passes its own events on and drops a late READY from another scene', () => {
  const { bridge } = garden();
  bridge.openGarden(INIT);
  const seen: string[] = [];
  bridge.onEvent(e => seen.push(e.type));
  bridge.receiveFromUnity(JSON.stringify({ type: 'CAFE_READY', payload: { guest: '', spots: [] } }));
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_READY' }));
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_SEATED' }));
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_GROWN', payload: { level: 3 } }));
  expect(seen).toEqual(['GARDEN_READY', 'GARDEN_SEATED', 'GARDEN_GROWN']);
});

it('sends touches with the rhythm on the out-breath only, and folds the growth into the INIT', () => {
  const { bridge, sent, types } = garden();
  bridge.openGarden(INIT);
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_READY' }));
  sent.length = 0;
  bridge.sendGardenTouch(true);
  bridge.sendGardenTouch(false, true);
  expect(sent.map(m => m.payload)).toEqual([{ down: true }, { down: false, inRhythm: true }]);

  bridge.sendGardenGrow({ level: 3, progress: 0.1, energy: 0.5, levelUp: true });
  expect(sent[2]).toEqual({ type: 'GARDEN_GROW', payload: { level: 3, progress: 0.1, energy: 0.5, levelUp: true } });
  // A player that reboots now gets the grown tree in its INIT.
  sent.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
  expect(types()).toEqual([]); // READY already came: nothing pending to resend
  bridge.closeGarden();
  expect(types()).toEqual(['GARDEN_END']);
});

it('resends a pending GARDEN_INIT — with the growth folded in — when the player boots under it', () => {
  const { bridge, sent } = garden();
  bridge.openGarden(INIT);
  bridge.sendGardenGrow({ level: 4, progress: 0, energy: 1, levelUp: true });
  sent.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
  expect(sent).toEqual([{ type: 'GARDEN_INIT', payload: { lang: 'ko', level: 4, progress: 0, energy: 1, variant: '' } }]);
});

it('closes idempotently and only its own scene', () => {
  const { bridge, types } = garden();
  bridge.openCafe({ lang: 'ko' });
  bridge.closeGarden();
  expect(types()).not.toContain('GARDEN_END');
});
