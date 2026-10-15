/**
 * The 3D world without the player (spec 004): jest, or a build with no Unity framework. The screen
 * must still be the whole 2D experience — the drawn hub's doors open the entrance overlays, Map
 * "arrives" at once on the mock bridge, and the mock accepts every world call the native one does.
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
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [], dropPendingBeatLines: jest.fn(), openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(), sayBeatLine: jest.fn(), stopBeatVoice: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, addListener: () => () => {} }),
  useFocusEffect: () => {},
}));
const mockHost = { mounts: 0 };
jest.mock('../src/features/counseling/components/UnityHost', () => ({
  UnityHost: () => {
    mockHost.mounts += 1;
    return null;
  },
}));

import { getWorldBridge, isNativeUnity, MockUnityBridge } from '../src/features/counseling/bridge';
import { WorldScreen } from '../src/features/world/screens/WorldScreen';
import { useWorldStore } from '../src/features/world/store/worldStore';
import { useLanguageStore } from '../src/shared/i18n';

it('is the drawn hub: no UnityView, its doors open the overlays, and Map arrives at once', async () => {
  expect(isNativeUnity()).toBe(false);
  await useWorldStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'ko' });
  useWorldStore.setState({ position: { x: 1, z: 2, yaw: 3 }, returnZone: null });

  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<WorldScreen />); });
  expect(mockHost.mounts).toBe(0);
  const mock = getWorldBridge() as MockUnityBridge;
  expect(mock).toBeInstanceOf(MockUnityBridge);
  expect(mock.lastWorldInit).toEqual({ lang: 'ko', spawn: { x: 1, z: 2, yaw: 3 } });

  const press = (label: string) => {
    const node = tree.root.findAll(n => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function' && !n.props.disabled)[0];
    if (!node) throw new Error(`no button "${label}"`);
    act(() => node.props.onPress());
  };
  const open = (zone: string) => tree.root.findAll(n => n.props.testID === `world-overlay-${zone}`).length > 0;

  // A door drawn on the hub.
  press('명상의 방');
  expect(open('meditation')).toBe(true);
  press('명상 시작하기 →');
  expect(mockNavigate).toHaveBeenCalledWith('MeditationRoom');
  expect(useWorldStore.getState().returnZone).toBe('meditation');

  // Map → the mock walks there instantly and answers WORLD_ARRIVED.
  press('Map');
  const sheet = tree.root.findAll(n => n.props.testID === 'world-sheet-map')[0];
  act(() => sheet.findAll(n => n.props.accessibilityLabel === '상점' && typeof n.props.onPress === 'function')[0].props.onPress());
  expect(open('shop')).toBe(true);

  // Enter on the mock: no door to open, it is through at once (WORLD_ENTERED).
  const seen: string[] = [];
  const off = mock.onEvent(e => seen.push(e.type));
  mock.sendWorldEnter('journey');
  mock.sendWorldGoto('shop');
  off();
  expect(seen).toEqual(['WORLD_ENTERED', 'WORLD_ARRIVED', 'WORLD_ENTERED']);

  // Every world call is accepted.
  expect(() => {
    mock.sendWorldRun(true);
    mock.sendWorldCamera(0.3, 0.2);
  }).not.toThrow();
  expect(mock.worldRun).toBe(true);
  expect(mock.worldCamera).toEqual({ zoom: 0.3, yaw: 0.2, pitch: 0 });

  act(() => tree.unmount());
  expect(mock.worldOpen).toBe(false);
  // Out of the world altogether: the unused door does not decide the next visit.
  expect(useWorldStore.getState().returnZone).toBeNull();
});
