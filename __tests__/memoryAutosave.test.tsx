/**
 * The Archive editor saves by itself (10-17, user: "아카이브 자동저장하게 해줘"): a moment after typing
 * stops, once per change, never while the form is incomplete, and once more when it goes away.
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';
import { MemoryEditor } from '../src/features/archive/components/MemoryEditor';
import { useLanguageStore } from '../src/shared/i18n';

const setup = (initial?: { content: string; details: Record<string, string> }) => {
  const onAutoSave = jest.fn();
  const onCancel = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(
      <MemoryEditor category="like" initial={initial} onSave={jest.fn()} onCancel={onCancel} onAutoSave={onAutoSave} />,
    );
  });
  const type = (v: string) => act(() => tree.root.findAllByType(TextInput)[0].props.onChangeText(v));
  const status = () => tree.root.findByProps({ testID: 'memory-autosave' }).props.children;
  return { tree, type, status, onAutoSave, onCancel };
};

beforeEach(() => {
  jest.useFakeTimers();
  useLanguageStore.setState({ lang: 'en' });
});
afterEach(() => jest.useRealTimers());

it('saves once, a moment after typing stops', () => {
  const { type, status, onAutoSave } = setup();
  type('Rain');
  type('Rainy days');
  expect(onAutoSave).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(800); });
  expect(onAutoSave).toHaveBeenCalledTimes(1);
  expect(onAutoSave.mock.calls[0][0].content).toBe('Rainy days');
  expect(status()).toBe('Saved');
  act(() => { jest.advanceTimersByTime(2000); });
  expect(onAutoSave).toHaveBeenCalledTimes(1);
});

it('does not save an empty form, nor an unchanged existing entry', () => {
  const empty = setup();
  empty.type('   ');
  act(() => { jest.advanceTimersByTime(800); });
  expect(empty.onAutoSave).not.toHaveBeenCalled();
  act(() => empty.tree.unmount());

  const existing = setup({ content: 'Coffee', details: {} });
  act(() => { jest.advanceTimersByTime(800); });
  act(() => existing.tree.unmount());
  expect(existing.onAutoSave).not.toHaveBeenCalled();
});

it('Done and leaving the screen keep what was just typed', () => {
  const a = setup();
  a.type('Tea');
  act(() => a.tree.root.findByProps({ testID: 'memory-done' }).props.onPress());
  expect(a.onAutoSave).toHaveBeenCalledTimes(1);
  expect(a.onCancel).toHaveBeenCalledTimes(1);
  act(() => a.tree.unmount());
  expect(a.onAutoSave).toHaveBeenCalledTimes(1);

  const b = setup();
  b.type('Walks');
  act(() => b.tree.unmount());
  expect(b.onAutoSave).toHaveBeenCalledTimes(1);
  expect(b.onAutoSave.mock.calls[0][0].content).toBe('Walks');
});
