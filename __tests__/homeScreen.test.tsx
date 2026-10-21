import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/features/home/screens/HomeScreen';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { useLanguageStore } from '../src/shared/i18n';
import { CategoryTabs } from '../src/features/counselors/components/CategoryTabs';
import { CounselorGrid } from '../src/features/counselors/components/CounselorGrid';
import { HomeHeader } from '../src/features/counselors/components/HomeHeader';
import { useCoins } from '../src/features/coins/store/coinStore';
import { useCounselorStats } from '../src/features/counselors/store/counselorStatsStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn() } }));
// The wallet is the coin store; the refresh is the server's and not this test's.
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: async () => {} }));
jest.mock('../src/features/conversations/syncConversations', () => ({
  syncConversationsFromServer: async () => null,
}));
// The sleep card shows only where the sound module is linked.
let mockSleepAvailable = true;
jest.mock('../src/features/meditation/sleepAudio', () => ({ sleepAudio: { available: () => mockSleepAvailable } }));
// The server's real per-counsellor counts; each test says what the server "answered".
let mockServerCounts: Record<string, number> | null = null;
jest.mock('../src/features/counselors/api/counselorStats', () => ({
  refreshCounselorStats: jest.fn(async () => {
    const { useCounselorStats: store } = require('../src/features/counselors/store/counselorStatsStore');
    if (mockServerCounts) store.getState().setCounts(mockServerCounts);
  }),
}));

let tree: ReactTestRenderer.ReactTestRenderer;
beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  await useConversationsStore.persist.rehydrate();
  mockNavigate.mockClear();
  useLanguageStore.setState({ lang: 'ko' });
  useConversationsStore.setState({ order: [], byId: {} });
  useCoins.setState({ balance: 1200 });
  useCounselorStats.setState({ counts: null });
  mockServerCounts = null;
});
afterEach(() => { if (tree) act(() => tree.unmount()); });
const render = async () => {
  await act(async () => { tree = ReactTestRenderer.create(<HomeScreen />); });
};

it('tabs 전체 · 사주 · 강의 · 명상: lectures and meditation have tabs of their own (16-10)', async () => {
  await render();
  const tabs = () => tree.root.findByType(CategoryTabs).props.categories.map((c: { key: string }) => c.key);
  expect(tabs()).toEqual(['recommended', 'saju', 'lecture', 'meditation']);
  const pick = (key: string) => act(() => tree.root.findByType(CategoryTabs).props.onChange(key));
  const footerPress = (testID?: string) =>
    tree.root.findAll(n => typeof n.props.onPress === 'function' && (!testID || n.props.testID === testID));

  // A counsellor tab: only those counsellors, nothing else under them.
  pick('saju');
  expect(tree.root.findByType(CounselorGrid).props.counselors.every((c: { category: string }) => c.category === 'saju')).toBe(true);
  expect(tree.root.findByType(CounselorGrid).props.ListFooterComponent).toBeUndefined();

  // 강의: no counsellors, the Schopenhauer series, opened at its first lecture.
  pick('lecture');
  expect(tree.root.findByType(CounselorGrid).props.counselors).toEqual([]);
  act(() => footerPress('lecture-series-card')[0].props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('Lecture', { chapter: 1, line: 0 });

  // 명상: no counsellors, the breathing room and the sleep guide under it.
  pick('meditation');
  expect(tree.root.findByType(CounselorGrid).props.counselors).toEqual([]);
  expect(tree.root.findAll(n => n.props.testID === 'lecture-series-card')).toHaveLength(0);
  act(() => footerPress('meditation-card')[0].props.onPress());
  expect(mockNavigate).toHaveBeenLastCalledWith('MeditationRoom');
  act(() => footerPress('home-sleep')[0].props.onPress());
  expect(mockNavigate).toHaveBeenLastCalledWith('SleepGuide');
});

it('hides the sleep card on a build without the sound module', async () => {
  mockSleepAvailable = false;
  await render();
  act(() => tree.root.findByType(CategoryTabs).props.onChange('meditation'));
  expect(tree.root.findAll(n => n.props.testID === 'home-sleep')).toHaveLength(0);
  mockSleepAvailable = true;
});

it('resumes a real conversation with its original subject, skipping empty or removed counselors', async () => {
  const store = useConversationsStore.getState();
  store.ensureSession({ sessionId: 'real', counselorId: 'yunjung', counselorName: '', counselorAccent: '', subjectId: 'friend' });
  store.appendMessage('real', { id: 'm1', role: 'counselor', text: '지난 이야기', at: new Date().toISOString() });
  store.ensureSession({ sessionId: 'empty', counselorId: 'yunjung', counselorName: '', counselorAccent: '' });
  store.ensureSession({ sessionId: 'removed', counselorId: 'removed', counselorName: '', counselorAccent: '' });
  store.appendMessage('removed', { id: 'm2', role: 'user', text: 'hello', at: new Date().toISOString() });
  await render();
  const button = tree.root.findAll(p =>
    p.props.accessibilityLabel?.startsWith('이어서 이야기하기') && typeof p.props.onPress === 'function',
  )[0];
  expect(button).toBeDefined();
  act(() => button!.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('UnityEntry', {
    counselorId: 'yunjung', subjectId: 'friend', resuming: true,
  });
});

it('shows the Prayer Coins wallet and never invents a zero balance when it is unknown', async () => {
  await render();
  expect(tree.root.findByType(HomeHeader).props.balanceLabel).toBe('Prayer Coins 1,200개');
  act(() => tree.root.findByType(HomeHeader).props.onPressBalance());
  expect(mockNavigate).toHaveBeenCalledWith('Tickets');
  act(() => tree.unmount());
  useCoins.setState({ balance: null });
  await render();
  expect(tree.root.findByType(HomeHeader).props.balanceLabel).not.toMatch(/\d/);
  expect(tree.root.findAll(p =>
    p.props.accessibilityLabel?.startsWith('이어서 이야기하기'),
  )).toHaveLength(0);
});

it('the 3D pill beside the ticket pill opens the world (spec 004)', async () => {
  await render();
  const pill = tree.root.findAll(p => p.props.accessibilityLabel === '3D 월드 열기' && typeof p.props.onPress === 'function')[0];
  expect(pill).toBeDefined();
  act(() => pill.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('World');
});

it('prints exact cumulative counts, including zero only after the server answers', async () => {
  const texts = () => tree.root.findAll(n => n.type === 'Text' as any)
    .map(n => [].concat(n.props.children).join(''));
  // Server silent: no card claims any count (the fake 960K is gone).
  await render();
  expect(texts().some(t => t.startsWith('누적 상담 '))).toBe(false);
  act(() => tree.unmount());

  mockServerCounts = { yuna: 1234, jiho: 7 };
  await render();
  const counts = texts().filter(t => t.startsWith('누적 상담 '));
  expect(counts).toEqual(expect.arrayContaining(['누적 상담 1,234회', '누적 상담 7회', '누적 상담 0회']));
  // Store and language changes rerender the mounted cards without changing their hook order.
  act(() => useCounselorStats.getState().setCounts({ yuna: 1235, jiho: 7 }));
  expect(texts()).toContain('누적 상담 1,235회');
  mockServerCounts = { yuna: 1235, jiho: 7 };
  await act(async () => { useLanguageStore.setState({ lang: 'en' }); });
  expect(texts()).toContain('1,235 consultations total');
});
