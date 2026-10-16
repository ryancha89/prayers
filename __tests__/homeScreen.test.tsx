import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/features/home/screens/HomeScreen';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { useLanguageStore } from '../src/shared/i18n';
import { CategoryTabs } from '../src/features/counselors/components/CategoryTabs';
import { CounselorGrid } from '../src/features/counselors/components/CounselorGrid';
import { HomeHeader } from '../src/features/counselors/components/HomeHeader';
import { useCoins } from '../src/features/coins/store/coinStore';

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

let tree: ReactTestRenderer.ReactTestRenderer;
beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  await useConversationsStore.persist.rehydrate();
  mockNavigate.mockClear();
  useLanguageStore.setState({ lang: 'ko' });
  useConversationsStore.setState({ order: [], byId: {} });
  useCoins.setState({ balance: 1200 });
});
afterEach(() => { if (tree) act(() => tree.unmount()); });
const footerCards = () =>
  [].concat(tree.root.findByType(CounselorGrid).props.ListFooterComponent.props.children).filter(Boolean) as any[];
const render = async () => {
  await act(async () => { tree = ReactTestRenderer.create(<HomeScreen />); });
};

it('keeps meditation reachable outside the filtered counselor list', async () => {
  await render();
  const categories = tree.root.findByType(CategoryTabs).props.categories;
  expect(categories.some((c: { key: string }) => c.key === 'meditation')).toBe(false);
  const category = categories.find((c: { key: string }) => c.key !== 'recommended');
  act(() => tree.root.findByType(CategoryTabs).props.onChange(category.key));
  expect(tree.root.findByType(CounselorGrid).props.counselors.every(
    (c: { category: string }) => c.category === category.key,
  )).toBe(true);
  const [meditation, sleep] = footerCards();
  act(() => meditation.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('MeditationRoom');
  // The sleep guide sits directly under it, in the same card.
  expect(sleep.props.style({ pressed: false })).toEqual(meditation.props.style({ pressed: false }));
  act(() => sleep.props.onPress());
  expect(mockNavigate).toHaveBeenLastCalledWith('SleepGuide');
});

it('hides the sleep card on a build without the sound module', async () => {
  mockSleepAvailable = false;
  await render();
  expect(footerCards()).toHaveLength(1);
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
