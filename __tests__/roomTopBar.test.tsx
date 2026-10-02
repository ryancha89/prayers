/**
 * The consultation room's back and speaker buttons sit inside the safe area in both landscape
 * orientations (02-10). The island is on the RIGHT in landscape-left and on the LEFT in
 * landscape-right; iOS reports the same inset on both sides either way, so the bar pads both.
 * Portrait keeps exactly the status-bar inset it always had.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), send: jest.fn(), back: jest.fn() } }));
const mockSafe = { top: 0, right: 0, bottom: 0, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockSafe,
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), getState: () => ({ routes: [] }), addListener: () => () => {} }),
  useRoute: () => ({ params: { counselorId: 'yuna', subjectId: 'self', sessionId: 's1' } }),
}));
jest.mock('../src/features/counseling/api/prayersServer', () => ({ fetchRecall: async () => null }));
jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({ onEvent: () => () => {}, sendEvent: () => {}, closeCounselingRoom: async () => {}, sendViewInsets: () => {} }),
  isNativeUnity: () => false,
}));
jest.mock('../src/features/counseling/hooks/useConsultationEngine', () => ({
  useConsultationEngine: () => ({
    ready: true,
    walking: false,
    state: {
      phaseId: 'P02', screen: 'none', speaker: '', line: '', choices: [], canTap: false, inputEnabled: false,
      notice: null, report: null, tone: '', emotion: 'neutral', transcript: [], suggestion: '', topic: '',
      finished: false, pending: false, speaking: false, mic: { state: 'idle', level: 0, error: '', offered: false },
    },
    remember: () => {},
    micAvailable: false,
  }),
}));

import React from 'react';
import { Dimensions } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { CounselingRoomScreen } from '../src/features/counseling/screens/CounselingRoomScreen';
import { spacing } from '../src/shared/theme';

afterEach(() => {
  jest.restoreAllMocks();
  Object.assign(mockSafe, { top: 0, right: 0, bottom: 0, left: 0 });
});

function topBar(win: { width: number; height: number }, safe: typeof mockSafe) {
  jest.spyOn(Dimensions, 'get').mockImplementation(() => ({ ...win, scale: 3, fontScale: 1 }) as never);
  Object.assign(mockSafe, safe);
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => {
    tree = ReactTestRenderer.create(<CounselingRoomScreen />);
  });
  const bar = tree.root.findAll(n => n.props.testID === 'room-top-bar' && typeof n.type === 'string');
  expect(bar).toHaveLength(1);
  const style = [bar[0].props.style].flat(Infinity).filter(Boolean).reduce((a: object, b: object) => ({ ...a, ...b }), {});
  act(() => tree.unmount());
  return style as Record<string, number>;
}

it('landscape: both buttons are inset past the island on either side, and off the top edge', () => {
  expect(topBar({ width: 874, height: 402 }, { top: 0, left: 62, right: 62, bottom: 21 })).toMatchObject({
    paddingTop: spacing.sm,
    paddingLeft: 62 + spacing.lg,
    paddingRight: 62 + spacing.lg,
  });
});

it('portrait: the status-bar inset and the old 16pt sides, nothing more', () => {
  expect(topBar({ width: 402, height: 874 }, { top: 62, left: 0, right: 0, bottom: 34 })).toMatchObject({
    paddingTop: 62,
    paddingLeft: spacing.lg,
    paddingRight: spacing.lg,
  });
});
