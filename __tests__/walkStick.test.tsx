/**
 * The consultation room's walk-in uses the world's stick (02-10), and its Talk prompt is the
 * world's Enter pill.
 *
 * Pinned here:
 *  · the stick sends WALK_INPUT with y as FORWARD (pushing up walks toward the counselor), and the
 *    release is {0,0} — Unity keeps the last vector, so a missed release walks the player into a
 *    wall for the rest of the session. The same for the controls going away mid-push (the player
 *    sat down under a thumb that is still on the glass) and for unmounting;
 *  · Talk exists only while WALK_STATE says the counselor is in reach, and sends WALK_TALK;
 *  · placement: the stick bottom-left and Talk centred, both inside the safe area — the old Talk sat
 *    bottom-right, under the Dynamic Island in landscape.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn() } }));
const mockSafe = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockSafe,
}));

type Sent = { type: string; payload?: { x: number; y: number } };
const mockSent: Sent[] = [];
const mockListeners = new Set<(e: unknown) => void>();
jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({
    sendEvent: (e: Sent) => mockSent.push(e),
    onEvent: (h: (e: unknown) => void) => {
      mockListeners.add(h);
      return () => mockListeners.delete(h);
    },
  }),
  isNativeUnity: () => true,
}));

import React from 'react';
import { Dimensions, PanResponder, type PanResponderCallbacks } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { WalkControls } from '../src/features/counseling/components/WalkControls';
import { PROMPT_LIFT } from '../src/features/world/components/PromptButton';
import { useLanguageStore } from '../src/shared/i18n';
import { spacing } from '../src/shared/theme';

/** The stick's PanResponder config, captured as it is created, so a gesture can be fed to it
 *  without synthesising the responder system's touch history. */
let stick: PanResponderCallbacks;
const realCreate = PanResponder.create;
beforeEach(() => {
  mockSent.length = 0;
  Object.assign(mockSafe, { top: 0, right: 0, bottom: 0, left: 0 });
  jest.spyOn(PanResponder, 'create').mockImplementation(config => {
    stick = config;
    return realCreate(config);
  });
  useLanguageStore.setState({ lang: 'en' });
});
afterEach(() => jest.restoreAllMocks());

const evt = (x = 60, y = 160) => ({ nativeEvent: { locationX: x, locationY: y } }) as never;
const push = (dx: number, dy: number) =>
  act(() => {
    stick.onPanResponderMove!(evt(), { dx, dy } as never);
  });
const grab = () => act(() => stick.onPanResponderGrant!(evt(), {} as never));
const lift = () => act(() => stick.onPanResponderRelease!(evt(), {} as never));
const fromRoom = (e: unknown) => act(() => mockListeners.forEach(h => h(e)));
const last = () => mockSent[mockSent.length - 1];

function mount(visible = true) {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<WalkControls visible={visible} />);
  });
  return tree;
}
const byTestID = (tree: ReactTestRenderer.ReactTestRenderer, id: string) =>
  tree.root.findAll(n => n.props.testID === id && typeof n.type === 'string');
/** Flattened style of a host node. */
const flat = (n: ReactTestRenderer.ReactTestInstance) =>
  [n.props.style].flat(Infinity).filter(Boolean).reduce((a: object, b: object) => ({ ...a, ...b }), {}) as Record<string, unknown>;

describe('the walk-in stick', () => {
  it('is the world stick, not the old d-pad', () => {
    const tree = mount();
    expect(byTestID(tree, 'world-joystick')).toHaveLength(1);
    expect(tree.root.findAll(n => n.props.accessibilityLabel === 'up')).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('pushing up walks forward (y > 0), and letting go sends the stop', () => {
    const tree = mount();
    grab();
    push(0, -200);
    expect(last()).toEqual({ type: 'WALK_INPUT', payload: { x: 0, y: 1 } });
    lift();
    expect(last()).toEqual({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } });
    act(() => tree.unmount());
  });

  it('a resting thumb inside the dead-zone sends nothing', () => {
    const tree = mount();
    grab();
    push(2, -3);
    expect(mockSent).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('stops the player when the controls are hidden mid-push (the player sat down)', () => {
    const tree = mount();
    grab();
    push(200, 0);
    expect(last().payload).toEqual({ x: 1, y: 0 });
    act(() => tree.update(<WalkControls visible={false} />));
    expect(last()).toEqual({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } });
    expect(byTestID(tree, 'world-joystick')).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('stops the player when the room unmounts mid-push', () => {
    const tree = mount();
    grab();
    push(0, -200);
    mockSent.length = 0;
    act(() => tree.unmount());
    expect(mockSent).toContainEqual({ type: 'WALK_INPUT', payload: { x: 0, y: 0 } });
  });

  it('sits bottom-left inside the safe area, as in the world', () => {
    Object.assign(mockSafe, { left: 62, right: 62, bottom: 21 });
    const tree = mount();
    const wrap = tree.root.findAll(
      n => typeof n.type === 'string' && n.props.pointerEvents === 'box-none' && n.findAll(c => c.props.testID === 'world-joystick').length > 0,
    )[0];
    expect(flat(wrap)).toMatchObject({ position: 'absolute', left: 62 + spacing.xs, bottom: 21 + spacing.xs });
    act(() => tree.unmount());
  });
});

describe('Talk', () => {
  it('appears only while the counselor is in reach, and sends WALK_TALK', () => {
    const tree = mount();
    expect(byTestID(tree, 'walk-talk')).toHaveLength(0);

    fromRoom({ type: 'WALK_STATE', payload: { canTalk: true, personaId: 'theo' } });
    const talk = byTestID(tree, 'walk-talk');
    expect(talk).toHaveLength(1);
    expect(talk[0].props.accessibilityLabel).toBe('Talk');
    // The Pressable itself (a composite), not the host view it renders.
    act(() => tree.root.find(n => n.props.testID === 'walk-talk' && typeof n.props.onPress === 'function').props.onPress());
    expect(last()).toEqual({ type: 'WALK_TALK' });

    fromRoom({ type: 'WALK_STATE', payload: { canTalk: false, personaId: 'theo' } });
    expect(byTestID(tree, 'walk-talk')).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('is gone with the rest of the controls once the walk ends', () => {
    const tree = mount();
    fromRoom({ type: 'WALK_STATE', payload: { canTalk: true, personaId: 'theo' } });
    act(() => tree.update(<WalkControls visible={false} />));
    expect(byTestID(tree, 'walk-talk')).toHaveLength(0);
    act(() => tree.unmount());
  });

  it('is in the player\'s language', () => {
    useLanguageStore.setState({ lang: 'ko' });
    const tree = mount();
    fromRoom({ type: 'WALK_STATE', payload: { canTalk: true, personaId: 'theo' } });
    expect(byTestID(tree, 'walk-talk')[0].props.accessibilityLabel).toBe('대화하기');
    act(() => tree.unmount());
  });

  it.each([
    ['landscape, island on either side', { width: 874, height: 402 }, { left: 62, right: 62, bottom: 21 }, PROMPT_LIFT.landscape],
    ['portrait, above the home indicator', { width: 402, height: 874 }, { left: 0, right: 0, bottom: 34 }, PROMPT_LIFT.portrait],
  ])('is centred inside the safe area — %s', (_name, win, safe, above) => {
    jest.spyOn(Dimensions, 'get').mockImplementation(() => ({ ...win, scale: 3, fontScale: 1 }) as never);
    Object.assign(mockSafe, safe);
    const tree = mount();
    fromRoom({ type: 'WALK_STATE', payload: { canTalk: true, personaId: 'theo' } });
    const wrap = tree.root.findAll(
      n => typeof n.type === 'string' && n.findAll(c => c.props.testID === 'walk-talk').length > 0 && flat(n).position === 'absolute',
    )[0];
    expect(flat(wrap)).toMatchObject({ left: safe.left, right: safe.right, bottom: safe.bottom + above, alignItems: 'center' });
    act(() => tree.unmount());
  });
});
