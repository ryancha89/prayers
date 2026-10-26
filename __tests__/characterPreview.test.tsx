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

it('the camera switch asks Unity for tracking and shows what Unity says', async () => {
  await act(async () => byId('character-camera').props.onPress());
  expect(mockBridge.setFaceTracking).toHaveBeenLastCalledWith(true);
  expect(texts()).toContain('Starting the camera…');
  await act(async () => mockListeners.forEach(l => l({ type: 'CHARACTER_TRACKING', payload: { state: 'unsupported' } })));
  expect(texts().some(s => s.startsWith("Face tracking isn't available"))).toBe(true);
  // Unsupported flips the switch back: the button offers "on" again, and a tap asks again.
  expect(texts()).toContain('Turn camera on');
  await act(async () => byId('character-camera').props.onPress());
  expect(mockBridge.setFaceTracking).toHaveBeenLastCalledWith(true);
});

it('closes the preview on the way out', async () => {
  act(() => tree.unmount());
  expect(mockBridge.closeCharacterPreview).toHaveBeenCalledTimes(1);
});
