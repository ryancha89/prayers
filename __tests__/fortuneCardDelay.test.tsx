import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { FortuneCardOverlay } from '../src/features/journey/components/FortuneCardOverlay';

jest.useFakeTimers();

const card = { key: 'k1', months: [8], title: 'Hold back', stars: 2, saveable: true, holdMs: 6000 } as any;
const el = (c = card, onDone = jest.fn()) =>
  <FortuneCardOverlay card={c} year={2027} onDone={onDone} onSave={() => {}} delayMs={1500} />;

test('a delayed month card is not there until its delay is over, then rises once', () => {
  let r: any;
  act(() => { r = create(el()); });
  expect(r.root.findAllByType(Text)).toHaveLength(0);
  // JourneyScreen re-renders every position tick with a fresh `card` object of the same key.
  for (let t = 0; t < 1600; t += 250) {
    act(() => { r.update(el({ ...card })); jest.advanceTimersByTime(250); });
  }
  expect(r.root.findAllByType(Text).length).toBeGreaterThan(0);
});

test('the wait comes out of the hold: the card leaves when an undelayed one would', () => {
  const onDone = jest.fn();
  act(() => { create(el(card, onDone)); });
  act(() => { jest.advanceTimersByTime(1500); });
  act(() => { jest.advanceTimersByTime(4400); });
  expect(onDone).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(200 + 500); });
  expect(onDone).toHaveBeenCalled();
});
