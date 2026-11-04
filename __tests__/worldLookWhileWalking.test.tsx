/**
 * Look-around while walking (04-11, "when walking running can not control screen angle change").
 *
 * RN grants ONE responder at a time, so while a thumb steers the stick every other finger's events
 * go to the stick too. The stick now relays its first OTHER finger as a look drag (`onOtherDrag`,
 * begin/move/end past a slop), and the follow camera accepts that stream beside its own layer
 * (`FollowCameraControls.look`) — same state, so the next one-finger drag carries on from where the
 * two-finger walk left the camera.
 */
import React from 'react';
import { PanResponder, type PanResponderCallbacks } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { View } from 'react-native';
import { WorldJoystick } from '../src/features/world/components/WorldJoystick';
import { useFollowCamera, type FollowCameraInput } from '../src/features/world/components/useWorldCamera';

jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({ sendEvent: jest.fn(), onEvent: () => () => {} }),
  getWorldBridge: () => ({ sendWorldCamera: jest.fn(), sendWorldTap: jest.fn() }),
}));

let stick: PanResponderCallbacks;
const realCreate = PanResponder.create;
beforeEach(() => {
  jest.spyOn(PanResponder, 'create').mockImplementation(config => {
    stick = config;
    return realCreate(config);
  });
});
afterEach(() => jest.restoreAllMocks());

const grant = () =>
  act(() => stick.onPanResponderGrant!({ nativeEvent: { locationX: 59, locationY: 153, identifier: 1, pageX: 59, pageY: 153 } } as never, {} as never));
const steer = { identifier: 1, pageX: 59, pageY: 103 };
const move = (other?: { x: number; y: number }) =>
  act(() => stick.onPanResponderMove!({ nativeEvent: {
    touches: other ? [steer, { identifier: 2, pageX: other.x, pageY: other.y }] : [steer],
    changedTouches: [],
  } } as never, { dx: 0, dy: -50 } as never));
const downOther = (x: number, y: number) =>
  act(() => stick.onPanResponderStart!({ nativeEvent: { changedTouches: [{ identifier: 2, pageX: x, pageY: y }], touches: [] } } as never, {} as never));
const liftOther = () =>
  act(() => stick.onPanResponderEnd!({ nativeEvent: { changedTouches: [{ identifier: 2 }], touches: [steer] } } as never, {} as never));

describe('the stick relays a second finger as a look drag', () => {
  it('begin after the slop, move while it drags, end when it lifts; a still finger stays a tap', () => {
    const drags: Array<[string, number, number]> = [];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => {
      tree = ReactTestRenderer.create(
        <WorldJoystick visible onOtherDrag={(ph, x, y) => drags.push([ph, x, y])} />,
      );
    });
    grant();
    downOther(600, 300);
    move({ x: 604, y: 302 });            // inside the slop: still maybe a button tap
    expect(drags).toEqual([]);
    move({ x: 640, y: 300 });            // past it: a look drag, begun where the finger went down
    expect(drags[0]).toEqual(['begin', 600, 300]);
    expect(drags[1]).toEqual(['move', 640, 300]);
    move({ x: 660, y: 320 });
    expect(drags[2]).toEqual(['move', 660, 320]);
    liftOther();
    expect(drags[3][0]).toBe('end');
    act(() => tree.unmount());
  });
});

describe('the follow camera accepts the relayed drag', () => {
  it('turns the yaw like its own layer drag would, from the shared camera state', () => {
    const sent: FollowCameraInput[] = [];
    let look!: (phase: 'begin' | 'move' | 'end', x: number, y: number) => void;
    const Harness = () => {
      const cam = useFollowCamera({ enabled: true, home: { zoom: 0.5, yaw: 0, pitch: 0 }, send: c => sent.push(c) });
      look = cam.look;
      return <View {...cam.handlers} />;
    };
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<Harness />); });
    look('begin', 600, 300);
    look('move', 600 + 375, 300);        // the test window is 750 wide: half the width = a quarter turn
    expect(sent.length).toBe(1);
    expect(sent[0].yaw).toBeCloseTo(-0.5, 5);
    expect(sent[0].pitch).toBeCloseTo(0, 5);
    look('end', 975, 300);
    look('move', 999, 300);              // after the end nothing moves
    expect(sent.length).toBe(1);
    act(() => tree.unmount());
  });
});
