/**
 * The character screen with Unity (26-10): a live 3D pane — CHARACTER_INIT on the way in, SET on a
 * card tap, TRACKING from the camera switch, END on the way out — and the tracking state's line.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ name: 'CharacterSetup' }),
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

type Listener = (e: { type: string; payload?: { state: string } }) => void;
const mockListeners: Listener[] = [];
const mockBridge = {
  onEvent: jest.fn((l: Listener) => { mockListeners.push(l); return () => {}; }),
  openCharacterPreview: jest.fn(),
  setCharacterPreview: jest.fn(),
  setFaceTracking: jest.fn(),
  setCharacterView: jest.fn(),
  confirmCharacter: jest.fn(),
  closeCharacterPreview: jest.fn(),
};
jest.mock('../src/features/counseling/bridge', () => ({
  isNativeUnity: () => true,
  // A getter: jest.mock is hoisted above `const mockBridge`, so read it when used, not at mock time.
  get nativeUnityBridge() { return mockBridge; },
}));

import { CharacterSelectScreen } from '../src/features/character/screens/CharacterSelectScreen';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { Text } from '../src/shared/components/Text';

let tree: ReactTestRenderer.ReactTestRenderer;
const byId = (id: string) => tree.root.find(n => n.props.testID === id && !!n.props.onPress);
const texts = () => tree.root.findAllByType(Text).map(n => [].concat(n.props.children).join(''));

beforeEach(async () => {
  Object.values(mockBridge).forEach(f => f.mockClear());
  mockListeners.length = 0;
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', gender: 'female', isUser: true },
    playerCharacter: undefined,
    playerHair: '',
    creatorSeen: false,
  });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
});

it('opens the preview on the profile’s default, and swaps it on a card tap', async () => {
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(
    expect.objectContaining({ playerGender: 'female', playerCharacter: 'xb_f01' }));
  // One woman since 26-10 (the hanbok one is Yuna's remake): a profile with no gender sees both cards.
  act(() => tree.unmount());
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true } });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  await act(async () => byId('character-xb_m01').props.onPress());
  expect(mockBridge.setCharacterPreview).toHaveBeenLastCalledWith(
    expect.objectContaining({ playerCharacter: 'xb_m01' }));
});

it('the camera is coming soon: shown, disabled, and it never asks Unity for tracking', async () => {
  const cam = tree.root.find(n => n.props.testID === 'character-camera' && 'disabled' in n.props);
  expect(cam.props.disabled).toBe(true);
  expect(texts()).toContain('Turn camera on · Coming soon');
  expect(mockBridge.setFaceTracking).not.toHaveBeenCalled();
});

it('closes the preview on the way out', async () => {
  act(() => tree.unmount());
  expect(mockBridge.closeCharacterPreview).toHaveBeenCalledTimes(1);
});

it('one character for her gender: no step to "choose" it — hair (face shot) → done, then the turn, then the store', async () => {
  jest.useFakeTimers();
  try {
    expect(tree.root.findAll(n => n.props.testID === 'character-step-look')).toHaveLength(0);
    // the first step is the hair, framed on the face
    expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0.8 });
    const next = () => tree.root.find(n => n.props.label === 'Next' && !!n.props.onPress);
    await act(async () => byId('character-hair-C46A86').props.onPress());
    expect(mockBridge.setCharacterPreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ playerCharacter: 'xb_f01', playerHair: '#C46A86' }));
    await act(async () => next().props.onPress());
    expect(texts()).toContain('This is you in Prayers');
    expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0 });
    // the last press: Unity's turn first, the store only after it
    const start = tree.root.find(n => n.props.label === 'Start' && !!n.props.onPress);
    await act(async () => start.props.onPress());
    expect(mockBridge.confirmCharacter).toHaveBeenCalledTimes(1);
    expect(useSubjectsStore.getState().playerCharacter).toBeUndefined();
    await act(async () => { jest.advanceTimersByTime(1300); });
    expect(useSubjectsStore.getState().playerCharacter).toBe('xb_f01');
    expect(useSubjectsStore.getState().playerHair).toBe('#C46A86');
    // an account that picked on the old card screen is shown the creator once; this ends that
    expect(useSubjectsStore.getState().creatorSeen).toBe(true);
  } finally {
    jest.useRealTimers();
  }
});

it('no gender yet: both characters, so the character step comes first', async () => {
  act(() => tree.unmount());
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true } });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(tree.root.findAll(n => n.props.testID === 'character-step-look').length).toBeGreaterThan(0);
  expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith({ yaw: 0, zoom: 0 });
});

it('the back arrow steps back before it leaves', async () => {
  await act(async () => tree.root.find(n => n.props.label === 'Next' && !!n.props.onPress).props.onPress());
  expect(byId('character-back')).toBeTruthy();
  await act(async () => byId('character-back').props.onPress());
  expect(mockBridge.setCharacterView).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 0.8 }));
});

it('the gesture hint is up until a finger turns the body — a step setting its shot is not a touch', async () => {
  // the hair step sent its face shot on mount; the hint must still be there
  expect(mockBridge.setCharacterView).toHaveBeenCalled();
  expect(texts()).toContain('Drag to turn · pinch to see the face');
});

it('no gender, no pick: the creator opens on the first card, never on a body that is not offered', async () => {
  act(() => tree.unmount());
  mockBridge.openCharacterPreview.mockClear();
  useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true }, playerCharacter: undefined });
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
  expect(mockBridge.openCharacterPreview).toHaveBeenCalledWith(expect.objectContaining({ playerCharacter: 'xb_f01' }));
});

it('opening the creator goes through the shared scene transition, as the creator', async () => {
  const { useSceneTransition } = require('../src/shared/transition/sceneTransition');
  expect(useSceneTransition.getState().active?.place).toBe('creator');
});

it('a card switch shows "preparing your character" until Unity has drawn the new body; a hair change does not', async () => {
  jest.useFakeTimers();
  try {
    act(() => tree.unmount());
    useSubjectsStore.setState({ self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', isUser: true }, playerCharacter: undefined });
    await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
    const loading = () => tree.root.findAll(n => n.props.testID === 'character-body-loading').length > 0;
    expect(loading()).toBe(false);                       // the first body rides the scene transition
    await act(async () => byId('character-xb_m01').props.onPress());
    expect(loading()).toBe(true);
    expect(texts()).toContain('Preparing your character…');
    await act(async () => mockListeners.forEach(l => l({ type: 'CHARACTER_BODY', payload: { id: 'xb_m01' } } as never)));
    act(() => { jest.advanceTimersByTime(400); });
    expect(loading()).toBe(false);
  } finally {
    jest.useRealTimers();
  }
});
