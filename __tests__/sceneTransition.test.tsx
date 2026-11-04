/**
 * The shared loading screen into every 3D place (27-10): picture, intro and a tip, up from the moment a
 * place's screen mounts until Unity answers that place's READY — never under MIN_MS, never over MAX_MS.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }) }));
type L = (e: { type: string }) => void;
const mockListeners: L[] = [];
let mockNative = true;
jest.mock('../src/features/counseling/bridge', () => ({
  isNativeUnity: () => mockNative,
  nativeUnityBridge: { onEvent: (l: L) => { mockListeners.push(l); return () => { mockListeners.splice(mockListeners.indexOf(l), 1); }; } },
}));

import { MAX_MS, MIN_MS, PLACES, beginSceneTransition, pickTip, useSceneTransition } from '../src/shared/transition/sceneTransition';
import { SceneTransitionOverlay } from '../src/shared/transition/SceneTransitionOverlay';
import { Text } from '../src/shared/components/Text';

let tree: ReactTestRenderer.ReactTestRenderer;
const texts = () => tree.root.findAllByType(Text).map(n => [].concat(n.props.children).join(''));
const emit = (type: string) => act(() => { [...mockListeners].forEach(l => l({ type })); });

beforeEach(() => {
  jest.useFakeTimers();
  mockNative = true;
  useSceneTransition.setState({ active: null });
  act(() => { tree = ReactTestRenderer.create(<SceneTransitionOverlay />); });
});
afterEach(() => { act(() => tree.unmount()); jest.useRealTimers(); });

it('shows the place, its line and a tip, and stays up until that place is READY and the tip has been readable', () => {
  act(() => beginSceneTransition('cafe'));
  expect(texts()).toContain('Coffee Shop');
  expect(texts()).toContain('A warm cup, an empty chair, and a card waiting to be turned.');
  expect(texts().some(s => s.startsWith('Tip'))).toBe(true);   // the one-line tip: 'Tip · …'
  emit('WORLD_READY');                                  // another place's READY: not this one
  expect(useSceneTransition.getState().active).not.toBeNull();
  emit('CAFE_READY');
  expect(useSceneTransition.getState().active).not.toBeNull();   // not before MIN_MS
  act(() => { jest.advanceTimersByTime(MIN_MS + 10); });
  expect(useSceneTransition.getState().active).toBeNull();
});

it('a counselor room carries the counselor’s name', () => {
  act(() => beginSceneTransition('counsel', { name: 'Yuna' }));
  expect(texts()).toContain('Yuna');
  expect(texts()).toContain('Yuna is waiting for you in the counseling room.');
});

it('a place that never answers lets the player go after MAX_MS', () => {
  act(() => beginSceneTransition('journey'));
  act(() => { jest.advanceTimersByTime(MAX_MS + 10); });
  expect(useSceneTransition.getState().active).toBeNull();
});

it('a late close from an earlier visit does not close this one', () => {
  act(() => beginSceneTransition('world'));
  const first = useSceneTransition.getState().active!.seq;
  act(() => beginSceneTransition('myroom'));
  act(() => useSceneTransition.getState().end(first));
  expect(useSceneTransition.getState().active?.place).toBe('myroom');
});

it('without the embedded player there is no load to cover', () => {
  mockNative = false;
  act(() => beginSceneTransition('world'));
  expect(useSceneTransition.getState().active).toBeNull();
});

it('never the same tip twice in a row, and only tips that exist for the place or everywhere', () => {
  let prev = pickTip('cafe', () => 0);
  for (let i = 0; i < 20; i++) {
    const tip = pickTip('cafe', () => (i % 7) / 7);
    expect(tip).not.toBe(prev);
    expect(tip.startsWith('transition.tip.')).toBe(true);
    prev = tip;
  }
  expect(Object.values(PLACES).every(p => p.ready.endsWith('_READY'))).toBe(true);
});
