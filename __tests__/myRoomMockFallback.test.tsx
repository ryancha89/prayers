/**
 * My Room without the player (jest, or a build with no Unity framework): the screen is the picture of
 * the room, no UnityView is mounted, and the mock bridge accepts every My Room call the native one
 * does — so World → 개인실 → My Room → back can be walked in a build with no Unity in it.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: mockGoBack, addListener: () => () => {} }),
  useFocusEffect: () => {},
}));
const mockHost = { mounts: 0 };
jest.mock('../src/features/counseling/components/UnityHost', () => ({
  UnityHost: () => {
    mockHost.mounts += 1;
    return null;
  },
}));

import { getMyRoomBridge, isNativeUnity, MockUnityBridge } from '../src/features/counseling/bridge';
import { MyRoomScreen } from '../src/features/myroom/screens/MyRoomScreen';
import { MYROOM_PICTURE } from '../src/features/myroom/picture';
import { useLanguageStore } from '../src/shared/i18n';

it('is the picture of the room: no UnityView, no loading caption, and the mock takes every call', async () => {
  expect(isNativeUnity()).toBe(false);
  useLanguageStore.setState({ lang: 'ja' });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<MyRoomScreen />); });
  expect(mockHost.mounts).toBe(0);
  const picture = tree.root.findAll(n => n.props.testID === 'myroom-picture')[0];
  expect(picture.findAll(n => n.props.source === MYROOM_PICTURE.portrait).length).toBeGreaterThan(0);
  // Nothing is loading: no "loading…" over a picture that is all there will be.
  expect(tree.root.findAll(n => n.props.children === 'お部屋を読み込み中…')).toHaveLength(0);

  const mock = getMyRoomBridge() as MockUnityBridge;
  expect(mock).toBeInstanceOf(MockUnityBridge);
  expect(mock.lastMyRoomInit).toEqual({ lang: 'ja', book: null });
  expect(mock.myRoomOpen).toBe(true);
  mock.sendMyRoomCamera({ zoom: 0.4, yaw: 0.1, pitch: -0.2 });
  expect(mock.myRoomCamera).toEqual({ zoom: 0.4, yaw: 0.1, pitch: -0.2 });

  // The way back lives in the menu sheet since the 07-10 HUD.
  act(() => tree.root.findAll(n => n.props.testID === 'myroom-menu' && typeof n.props.onPress === 'function')[0].props.onPress());
  const back = tree.root.findAll(n => n.props.accessibilityLabel === 'ワールドに戻る' && typeof n.props.onPress === 'function')[0];
  act(() => back.props.onPress());
  expect(mockGoBack).toHaveBeenCalled();
  act(() => tree.unmount());
  expect(mock.myRoomOpen).toBe(false);
  expect(mock.myRoomCamera).toBeNull();
});
