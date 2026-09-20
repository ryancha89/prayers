import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { HomeScreen } from '../src/features/home/screens/HomeScreen';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { useLanguageStore } from '../src/shared/i18n';
import { CategoryTabs } from '../src/features/counselors/components/CategoryTabs';
import { CounselorGrid } from '../src/features/counselors/components/CounselorGrid';
import { HomeHeader } from '../src/features/counselors/components/HomeHeader';
import { fetchTicketBalance } from '../src/features/counseling/api/tickets';

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
jest.mock('../src/features/counseling/api/tickets', () => ({ fetchTicketBalance: jest.fn() }));
jest.mock('../src/features/conversations/syncConversations', () => ({
  syncConversationsFromServer: async () => null,
}));

let tree: ReactTestRenderer.ReactTestRenderer;
beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  await useConversationsStore.persist.rehydrate();
  mockNavigate.mockClear();
  useLanguageStore.setState({ lang: 'ko' });
  useConversationsStore.setState({ order: [], byId: {} });
  jest.mocked(fetchTicketBalance).mockResolvedValue({ tickets: 12, normal: 12, pro: 0 });
});
afterEach(() => { if (tree) act(() => tree.unmount()); });
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
  act(() => tree.root.findByType(CounselorGrid).props.ListFooterComponent.props.onPress());
  expect(mockNavigate).toHaveBeenCalledWith('MeditationRoom');
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

it('shows the real ticket balance and never invents minutes or a zero balance on failure', async () => {
  await render();
  expect(tree.root.findByType(HomeHeader).props.balanceLabel).toBe('Prayer Ticket 12장');
  act(() => tree.root.findByType(HomeHeader).props.onPressBalance());
  expect(mockNavigate).toHaveBeenCalledWith('Tickets');
  act(() => tree.unmount());
  jest.mocked(fetchTicketBalance).mockResolvedValue(null);
  await render();
  expect(tree.root.findByType(HomeHeader).props.balanceLabel).not.toMatch(/0|12/);
  expect(tree.root.findAll(p =>
    p.props.accessibilityLabel?.startsWith('이어서 이야기하기'),
  )).toHaveLength(0);
});
