/**
 * Spec 010's half of the bridge (contract.md §2): MEDI_INIT is remembered and repeated until
 * MEDI_READY (every 1.5 s, max 4 — the GARDEN_INIT discipline), READY replays the insets and the
 * session's state, a booting player gets the pending INIT again, and leaving says MEDI_END —
 * only from its own scene.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';

function stage() {
  const sent: any[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_o, _m, json) => sent.push(JSON.parse(json)) });
  return { bridge, sent, types: () => sent.map(m => m.type) };
}

const INIT = { experience: 'moktak' as const, lang: 'ko', haptics: true };

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('opens the experience directly and repeats MEDI_INIT until the scene answers — max 4 retries', () => {
  const { bridge, sent, types } = stage();
  bridge.openMeditation(INIT);
  expect(sent[0]).toEqual({ type: 'MEDI_INIT', payload: INIT });
  jest.advanceTimersByTime(1500);
  expect(types().filter(t => t === 'MEDI_INIT')).toHaveLength(2);
  // Left unanswered it gives up after four retries, not never.
  jest.advanceTimersByTime(60_000);
  expect(types().filter(t => t === 'MEDI_INIT')).toHaveLength(5);
});

it('stops repeating once MEDI_READY lands', () => {
  const { bridge, types } = stage();
  bridge.openMeditation(INIT);
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDI_READY' }));
  jest.advanceTimersByTime(60_000);
  expect(types().filter(t => t === 'MEDI_INIT')).toHaveLength(1);
});

it('replays the insets and the session state on MEDI_READY', () => {
  const { bridge, sent, types } = stage();
  bridge.openMeditation({ experience: 'snow_mountain', lang: 'en', breath: { inMs: 4000, holdMs: 4000, outMs: 6000 } });
  bridge.sendViewInsets({ top: 0.1, right: 0, bottom: 0.3, left: 0, landscape: false });
  bridge.sendMediState({ state: 'running' });
  sent.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDI_READY' }));
  expect(types()).toEqual(['VIEW_INSETS', 'MEDI_STATE']);
  expect(sent[1].payload).toEqual({ state: 'running' });
});

it('resends a pending MEDI_INIT when the player boots under it (BRIDGE_READY)', () => {
  const { bridge, sent } = stage();
  bridge.openMeditation(INIT);
  sent.length = 0;
  bridge.receiveFromUnity(JSON.stringify({ type: 'BRIDGE_READY' }));
  expect(sent).toEqual([{ type: 'MEDI_INIT', payload: INIT }]);
});

it('passes its own events on and drops a late READY from another scene', () => {
  const { bridge } = stage();
  bridge.openMeditation(INIT);
  const seen: string[] = [];
  bridge.onEvent(e => seen.push(e.type));
  bridge.receiveFromUnity(JSON.stringify({ type: 'GARDEN_READY' }));
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDI_READY' }));
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDI_EVENT', payload: { name: 'strike', count: 7 } }));
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDI_EVENT', payload: { name: 'final_bell' } }));
  expect(seen).toEqual(['MEDI_READY', 'MEDI_EVENT', 'MEDI_EVENT']);
});

it('sends taps as they land and says MEDI_END on the way out', () => {
  const { bridge, sent, types } = stage();
  bridge.openMeditation(INIT);
  bridge.receiveFromUnity(JSON.stringify({ type: 'MEDI_READY' }));
  sent.length = 0;
  bridge.sendMediTap(1, true);
  bridge.sendMediTap(1, false);
  expect(sent.map(m => m.payload)).toEqual([{ count: 1, counted: true }, { count: 1, counted: false }]);
  bridge.closeMeditation();
  expect(types()).toContain('MEDI_END');
});

it('closes idempotently and only its own scene', () => {
  const { bridge, types } = stage();
  bridge.openCafe({ lang: 'ko' });
  bridge.closeMeditation();
  expect(types()).not.toContain('MEDI_END');
});
