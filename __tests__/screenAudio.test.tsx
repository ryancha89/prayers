import React from 'react';
import Renderer, { act } from 'react-test-renderer';
import { useScreenAudio } from '../src/shared/audio/useScreenAudio';

const mockListeners = new Map<string, Set<(e?: any) => void>>();
const mockNav = {
  isFocused: () => true,
  addListener: (event: string, fn: (e?: any) => void) => {
    if (!mockListeners.has(event)) mockListeners.set(event, new Set());
    mockListeners.get(event)!.add(fn);
    return () => mockListeners.get(event)!.delete(fn);
  },
};
jest.mock('@react-navigation/native', () => ({ useNavigation: () => mockNav }));
const emit = (event: string, data?: any) => mockListeners.get(event)?.forEach(fn => fn(data));

test.each(['blur', 'beforeRemove', 'transitionStart'])('%s silences before unmount and blocks late speech', event => {
  let voice!: ReturnType<typeof useScreenAudio>;
  const stop = jest.fn();
  const enter = jest.fn();
  function Screen() { voice = useScreenAudio(stop, enter); return null; }
  let tree!: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<Screen />); });
  expect(voice.active.current).toBe(true);
  act(() => emit(event, { data: { closing: true } }));
  expect(stop).toHaveBeenCalledTimes(1);
  expect(voice.active.current).toBe(false);
  act(() => { emit('blur'); emit('beforeRemove'); });
  expect(stop).toHaveBeenCalledTimes(1);
  act(() => emit('focus'));
  expect(voice.active.current).toBe(true);
  expect(enter).toHaveBeenCalledTimes(2);
  act(() => tree.unmount());
  expect(stop).toHaveBeenCalledTimes(2);
});

test('a rerender keeps audio playing and the back button can silence synchronously', () => {
  let voice!: ReturnType<typeof useScreenAudio>;
  const first = jest.fn(), latest = jest.fn();
  function Screen({ stop }: { stop: () => void }) { voice = useScreenAudio(stop); return null; }
  let tree!: Renderer.ReactTestRenderer;
  act(() => { tree = Renderer.create(<Screen stop={first} />); });
  act(() => tree.update(<Screen stop={latest} />));
  expect(first).not.toHaveBeenCalled();
  act(() => voice.silence());
  expect(latest).toHaveBeenCalledTimes(1);
  expect(voice.active.current).toBe(false);
  act(() => tree.unmount());
  expect(latest).toHaveBeenCalledTimes(1);
});
