import React from 'react';
import { Text as RNText, TextInput } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { useLanguageStore } from '../src/shared/i18n';
import { useStoryStore } from '../src/features/story/store/storyStore';

const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ goBack: mockGoBack }) }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return {
    SafeAreaView: View,
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  };
});
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), send: jest.fn(), back: jest.fn() },
}));
// The rendered plates are images; the test needs only their shape.
jest.mock('../src/features/story/data/plates', () => {
  const plate = { image: 1, face: { rect: [0.4, 0.4, 0.6, 0.6], variants: { idle: 2, blink: 3, talk: 4 } } };
  return {
    PLATE_SIZE: { w: 1170, h: 2080 },
    PLATES: { door: { image: 1 }, room: plate, sofa: plate, doorstep: plate, nap: { image: 1 } },
    CHEESE_CARD: 1,
  };
});
jest.mock('../src/features/story/voice/storyVoice', () => ({
  speak: jest.fn(async () => false), stop: jest.fn(), warm: jest.fn(), level: () => 0, speaking: () => false,
}));
jest.mock('../src/features/story/voice/storySpeech', () => ({ available: () => false, listen: jest.fn() }));
const mockTurn = jest.fn();
jest.mock('../src/features/story/api/storyApi', () => ({ storyTurn: (...a: unknown[]) => mockTurn(...a) }));

// The import comes after the jest.mock calls on purpose (the module reads them at load).
import { StoryScreen } from '../src/features/story/screens/StoryScreen';

let tree: ReactTestRenderer.ReactTestRenderer;
const texts = () => tree.root.findAllByType(RNText).map(n => [].concat(n.props.children).join(''));
const button = (label: string) => {
  const hit = tree.root.findAll(n => typeof n.props.onPress === 'function' &&
    n.findAllByType(RNText).some(t => [].concat(t.props.children).join('') === label));
  if (!hit.length) throw new Error(`no button "${label}" in: ${texts().join(' | ')}`);
  return hit[hit.length - 1];
};
const press = (label: string) => act(() => button(label).props.onPress());
const pressAndWait = async (label: string) => {
  const b = button(label);
  await act(async () => { await b.props.onPress(); });
};
/** Lets the typewriter run (each character is a timer scheduled after the previous render). */
const typeOut = () => {
  for (let i = 0; i < 160; i++) act(() => { jest.advanceTimersByTime(40); });
};
/** Taps the story on until the input shows (free talk), finishing each typed line. */
const tapUntilFree = () => {
  for (let i = 0; i < 40 && tree.root.findAllByType(TextInput).length === 0; i++) {
    const layer = tree.root.find(n => n.props.accessibilityLabel === '탭해서 계속' && typeof n.props.onPress === 'function');
    act(() => layer.props.onPress()); // finishes the typing
    act(() => layer.props.onPress()); // next beat
  }
};

beforeEach(() => {
  jest.useFakeTimers();
  useLanguageStore.setState({ lang: 'ko' });
  useStoryStore.setState({ saves: {}, done: {}, voice: false });
  mockTurn.mockReset();
});
afterEach(() => {
  act(() => tree?.unmount());
  jest.useRealTimers();
});

it('plays chapter 1 to free talk, sends a suggestion, and follows the meaning (leave → the doorstep)', async () => {
  act(() => { tree = ReactTestRenderer.create(<StoryScreen />); });
  expect(texts()).toContain('말하는 고양이와 첫 만남');
  press('시작하기');
  typeOut();
  expect(texts().join(' ')).toContain('월요일 아침, 초인종이 울렸다.');

  tapUntilFree();
  // the scripted suggestions are on offer
  expect(texts()).toEqual(expect.arrayContaining(['너 방금 말한 거야?', '누구 허락으로 들어왔어?']));

  mockTurn.mockResolvedValueOnce({
    lines: [{ kind: 'action', text: '귀를 한 번 턴다.' }, { kind: 'say', text: '그럼 나가 주지.' }],
    intent: 'refuse', name: null, mood: 'quiet', suggestions: ['다시 들어와도 돼.'],
  });
  await pressAndWait('누구 허락으로 들어왔어?');
  expect(mockTurn).toHaveBeenCalledWith(expect.objectContaining({ story: 'cheese', stage: 'arrival', message: '누구 허락으로 들어왔어?' }));
  typeOut();
  expect(texts()).toEqual(expect.arrayContaining(['귀를 한 번 턴다.', '그럼 나가 주지.']));

  // tapping on plays the walk to the door and opens the doorstep talk
  tapUntilFree();
  const saved = useStoryStore.getState().saves['cheese-1'].state;
  expect(saved.stage).toBe('doorstep');
  expect(saved.plate).toBe('doorstep');
  expect(saved.permission).toBe('refused');
  expect(texts()).toContain('다시 들어와도 돼.');
});

it('keeps the line in the box when the cat could not answer', async () => {
  act(() => { tree = ReactTestRenderer.create(<StoryScreen />); });
  press('시작하기');
  tapUntilFree();
  mockTurn.mockResolvedValueOnce({ error: 'offline' });
  const input = tree.root.findByType(TextInput);
  act(() => input.props.onChangeText('안녕?'));
  await act(async () => { await input.props.onSubmitEditing(); });
  expect(tree.root.findByType(TextInput).props.value).toBe('안녕?');
  expect(texts().join(' ')).toContain('인터넷 연결을 확인해 주세요');
});
