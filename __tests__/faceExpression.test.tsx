/**
 * The counselor's face follows the AI reply (26-10, #timeline-truongthinh): the room sends
 * FACE_EXPRESSION {target: counselor} whenever the engine's emotion for the spoken scene changes,
 * and nothing while an undirected reply stays neutral (the room's own [Beat] cues own the face then).
 */
const mockEmotion = { value: 'neutral', tone: '', pending: false };
const mockListeners: Array<(e: { type: string; payload?: unknown }) => void> = [];
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
  useNavigation: () => ({ navigate: jest.fn(), pop: jest.fn(), popTo: jest.fn(), getState: () => ({ routes: [] }), addListener: () => () => {} }),
  useRoute: () => ({ params: { counselorId: 'yuna', subjectId: 'self', sessionId: 's1' } }),
}));
jest.mock('../src/features/counseling/api/prayersServer', () => ({ fetchRecall: async () => null }));
const mockSent: Array<{ type: string; payload?: unknown }> = [];
jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({
    onEvent: (h: (e: { type: string; payload?: unknown }) => void) => { mockListeners.push(h); return () => {}; },
    sendEvent: (e: { type: string; payload?: unknown }) => mockSent.push(e),
    closeCounselingRoom: async () => {},
    sendViewInsets: () => {},
  }),
  isNativeUnity: () => true,
}));
jest.mock('../src/features/counseling/components/UnityHost', () => ({ UnityHost: () => null }));
jest.mock('../src/features/counseling/hooks/useConsultationEngine', () => ({
  useConsultationEngine: () => ({
    ready: true,
    walking: false,
    state: {
      phaseId: 'P02', screen: 'none', speaker: '', line: '', choices: [], canTap: false, inputEnabled: false,
      notice: null, report: null, get tone() { return mockEmotion.tone; }, get emotion() { return mockEmotion.value; }, transcript: [], suggestion: '', topic: '',
      finished: false, get pending() { return mockEmotion.pending; }, speaking: false, mic: { state: 'idle', level: 0, error: '', offered: false },
    },
    remember: () => {},
    micAvailable: false,
  }),
}));


import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { CounselingRoomScreen } from '../src/features/counseling/screens/CounselingRoomScreen';

const faces = () => mockSent.filter(e => e.type === 'FACE_EXPRESSION').map(e => e.payload);

it('sends the emotion on change only, to the counselor', () => {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<CounselingRoomScreen />); });
  expect(faces()).toEqual([]);                      // neutral at the start: nothing to say

  mockEmotion.value = 'happy';
  act(() => tree.update(<CounselingRoomScreen />));
  act(() => tree.update(<CounselingRoomScreen />));  // same emotion again: no repeat
  mockEmotion.value = 'concerned';
  act(() => tree.update(<CounselingRoomScreen />));
  mockEmotion.value = 'neutral';
  act(() => tree.update(<CounselingRoomScreen />));

  expect(faces()).toEqual([                          // no tone on these scenes: the default 0.8
    { target: 'counselor', emotion: 'happy', intensity: 0.8, hold: 0 },
    { target: 'counselor', emotion: 'concerned', intensity: 0.8, hold: 0 },
    { target: 'counselor', emotion: 'neutral', intensity: 1, hold: 0 },
  ]);
  act(() => tree.unmount());
});

it('the camera switch drives the counselor face, and an unsupported camera turns it back off', () => {
  mockSent.length = 0;
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<CounselingRoomScreen />); });
  const cam = () => tree.root.find(n => n.props.testID === 'room-face-cam' && !!n.props.onPress);
  act(() => cam().props.onPress());
  expect(mockSent.filter(e => e.type === 'ROOM_FACE_TRACKING').pop()).toEqual({ type: 'ROOM_FACE_TRACKING', payload: { on: true } });
  expect(cam().props.active).toBe(true);
  act(() => mockListeners.forEach(h => h({ type: 'CHARACTER_TRACKING', payload: { state: 'unsupported' } })));
  expect(cam().props.active).toBe(false);
  act(() => tree.unmount());
  expect(mockSent.filter(e => e.type === 'ROOM_FACE_TRACKING').pop()).toEqual({ type: 'ROOM_FACE_TRACKING', payload: { on: false } });
});

it('a 3D face gets the finer face and strength for its tone, and thinks while the question is out', () => {
  mockSent.length = 0;
  let tree!: ReactTestRenderer.ReactTestRenderer;
  act(() => { tree = ReactTestRenderer.create(<CounselingRoomScreen />); });
  const step = (tone: string, value: string, pending = false) => {
    Object.assign(mockEmotion, { tone, value, pending });
    act(() => tree.update(<CounselingRoomScreen />));
  };
  step('sad', 'concerned');          // the drawn stage folds sad into concerned; the face does not
  step('reassuring', 'happy');       // a soft smile, not the grin
  step('reassuring', 'happy', true); // the next question is out: thinking
  step('positive', 'happy');         // the engine's emotion stands, at the tone's strength
  step('disagree', 'concerned');
  step('agree', 'happy');            // same emotion as `positive`, lighter: sent again
  expect(faces().map(f => { const p = f as { emotion: string; intensity: number }; return `${p.emotion}@${p.intensity}`; }))
    .toEqual(['sad@0.9', 'gentle@0.9', 'thinking@0.7', 'happy@0.8', 'serious@0.8', 'happy@0.55']);
  act(() => tree.unmount());
});
