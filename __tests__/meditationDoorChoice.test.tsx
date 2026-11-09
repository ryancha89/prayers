/**
 * The meditation room entered through the World's door (27-10, "vào thẳng phòng rồi chọn"): the room
 * itself offers its sessions — breathing here, or the sleep guide — where the World used to show
 * them in a sheet over the hub. From Home (no `fromDoor`) it still opens on the breathing's Begin.
 *
 * The room offered five for a few days and is back to TWO (09-11, "xóa những tab dư ở medition").
 * The absent three are asserted absent on purpose: each is a PLACE, reached as a place (the garden
 * through its own hall door, Moktak and SnowMountain through their own routes), and listing a place
 * among this room's sittings is what made the band read as duplicated tabs on the phone. Their
 * routes still exist, so nothing stops a card being added back — this test is what makes that a
 * decision rather than an accident.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), bellIn: jest.fn(), bellOut: jest.fn() },
}));
jest.mock('../src/shared/audio/backgroundMusic', () => ({
  backgroundMusic: { start: jest.fn(), pause: jest.fn(), stop: jest.fn(), release: jest.fn(), duck: jest.fn() },
  meditationBed: () => 'meditation',
}));
jest.mock('../src/features/meditation/guideVoice', () => ({ guideVoice: { play: jest.fn(), pause: jest.fn(), stop: jest.fn() } }));
jest.mock('../src/shared/device/keepAwake', () => ({ holdScreenAwake: () => () => {} }));
jest.mock('../src/features/meditation/sleepAudio', () => ({ sleepAudio: { available: () => true } }));
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn(), replace: jest.fn(), addListener: () => () => {} };
let mockParams: { fromDoor?: boolean } | undefined;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: () => {},
}));
jest.mock('../src/features/counseling/bridge', () => ({ isNativeUnity: () => false, nativeUnityBridge: {} }));
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));

import { MeditationRoomScreen } from '../src/features/meditation/screens/MeditationRoomScreen';

let tree: ReactTestRenderer.ReactTestRenderer;
const byId = (id: string) => tree.root.findAll(n => n.props.testID === id && !!n.props.onPress);

// Not unmounted: the room's exit animation runs on teardown and needs a native node a test has not got.
afterEach(() => { mockNavigation.replace.mockClear(); });

it('through the door: the sessions, chosen in the room; the sleep guide takes the room’s place', async () => {
  mockParams = { fromDoor: true };
  await act(async () => { tree = ReactTestRenderer.create(<MeditationRoomScreen />); });
  expect(byId('med-choice-breathe').length).toBeGreaterThan(0);
  expect(byId('med-choice-sleep').length).toBeGreaterThan(0);
  await act(async () => byId('med-choice-sleep')[0].props.onPress());
  expect(mockNavigation.replace).toHaveBeenCalledWith('SleepGuide');
});

it('through the door: the room offers its two sittings and nothing else', async () => {
  mockParams = { fromDoor: true };
  await act(async () => { tree = ReactTestRenderer.create(<MeditationRoomScreen />); });
  expect(byId('med-choice-garden')).toHaveLength(0);
  expect(byId('med-choice-moktak')).toHaveLength(0);
  expect(byId('med-choice-snow')).toHaveLength(0);
});

it('from Home: no choice, the breathing’s own Begin', async () => {
  mockParams = undefined;
  await act(async () => { tree = ReactTestRenderer.create(<MeditationRoomScreen />); });
  expect(byId('med-choice-breathe')).toHaveLength(0);
});
