/**
 * A held direction key is ONE message, and the release is the load-bearing one.
 *
 * Unity keeps the last direction it was given (MapPlayerController.SetRemoteMove), so the press
 * sends a vector and the release sends {0,0}. Miss the release and the player keeps walking — into
 * a wall, out of the room's reach test, for the rest of the session — with nothing on screen
 * suggesting anything is wrong. That is what these tests are for.
 *
 * They also pin the AXES: y is forward, not screen-down. Getting that backwards walks the player
 * away from the counselor when they press up, which reads as "the controls are inverted" rather
 * than as a sign convention nobody wrote down.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

const mockSent: { type: string; payload?: { x: number; y: number } }[] = [];
jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({
    sendEvent: (e: { type: string; payload?: { x: number; y: number } }) => mockSent.push(e),
    onEvent: () => () => {},
    openCounselingRoom: async () => {},
    closeCounselingRoom: async () => {},
  }),
  isNativeUnity: () => true,
}));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { WalkControls } from '../src/features/counseling/components/WalkControls';

beforeEach(() => {
  mockSent.length = 0;
});

function mount() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<WalkControls visible />);
  });
  return tree;
}

/** Found by accessibility label rather than component type: RN wraps Pressable in memo and
 *  forwardRef, which findAllByType does not see through in the test renderer. */
function key(tree: ReactTestRenderer.ReactTestRenderer, label: string) {
  return tree.root.find(
    n => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === label,
  );
}

it('sends forward while up is held, and a stop when it is let go', () => {
  const tree = mount();

  act(() => key(tree, 'up').props.onPressIn());
  expect(mockSent).toEqual([{ type: 'WALK_INPUT', payload: { x: 0, y: 1 } }]);

  act(() => key(tree, 'up').props.onPressOut());
  expect(mockSent[mockSent.length - 1]).toEqual({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } });
});

it('holds one message per press, not a stream', () => {
  const tree = mount();

  act(() => key(tree, 'right').props.onPressIn());

  // A stick sent ~20 a second. A key sends one, because Unity remembers it.
  expect(mockSent).toHaveLength(1);
  expect(mockSent[0].payload).toEqual({ x: 1, y: 0 });
});

it('stops the player when the controls go away mid-press', () => {
  const tree = mount();
  act(() => key(tree, 'up').props.onPressIn());
  mockSent.length = 0;

  // The walk ends the moment the player sits; the controls unmount under a finger that is still
  // down, and that finger will never send its release.
  act(() => tree.unmount());

  expect(mockSent).toContainEqual({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } });
});

/**
 * What is held is a SET, not the last key touched.
 *
 * Both of these were stutters the player felt and could not explain: a thumb rolling from one key
 * to the next stopped the character dead, and anything off-axis had to be walked as a staircase.
 */
it('keeps walking when one of two held keys is released', () => {
  const tree = mount();

  act(() => key(tree, 'up').props.onPressIn());
  act(() => key(tree, 'right').props.onPressIn());
  mockSent.length = 0;

  act(() => key(tree, 'right').props.onPressOut());

  // Up is still under a finger, so this is a change of direction — NOT a stop.
  expect(mockSent).toEqual([{ type: 'WALK_INPUT', payload: { x: 0, y: 1 } }]);
});

it('walks the diagonal when two keys are held, at the same speed as a straight line', () => {
  const tree = mount();

  act(() => key(tree, 'up').props.onPressIn());
  act(() => key(tree, 'right').props.onPressIn());

  const last = mockSent[mockSent.length - 1].payload!;
  expect(last.x).toBeCloseTo(Math.SQRT1_2, 5);
  expect(last.y).toBeCloseTo(Math.SQRT1_2, 5);
  // Unity honours the magnitude, so an un-normalised diagonal would sprint at 1.41×.
  expect(Math.hypot(last.x, last.y)).toBeCloseTo(1, 5);
});

it('stops only when the last finger comes up', () => {
  const tree = mount();

  act(() => key(tree, 'up').props.onPressIn());
  act(() => key(tree, 'left').props.onPressIn());
  act(() => key(tree, 'up').props.onPressOut());
  mockSent.length = 0;

  act(() => key(tree, 'left').props.onPressOut());
  expect(mockSent).toEqual([{ type: 'WALK_INPUT', payload: { x: 0, y: 0 } }]);
});

it('does not repeat a vector that has not changed', () => {
  const tree = mount();

  act(() => key(tree, 'up').props.onPressIn());
  mockSent.length = 0;

  // Opposite keys cancel to {0,0}; releasing one returns to the vector already in flight, and a
  // second identical message is noise on the channel the reading travels on.
  act(() => key(tree, 'down').props.onPressIn());
  act(() => key(tree, 'down').props.onPressOut());

  expect(mockSent).toEqual([
    { type: 'WALK_INPUT', payload: { x: 0, y: 0 } },
    { type: 'WALK_INPUT', payload: { x: 0, y: 1 } },
  ]);
});
