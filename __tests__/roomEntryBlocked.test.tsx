/**
 * A past conversation that cannot open on this phone (29-10). The thread's saved person lives only on
 * the device that saved them, and a counsellor can have no room; UnityEntryScreen used to return
 * quietly under the loading veil — an endless spinner. Pinned here:
 *  · the entry screen says why, with a way back, and never starts the loading veil,
 *  · a pixel counsellor's room (Nabi, drawn by the app) does not wait under a veil for a UNITY_READY
 *    it never sends,
 *  · the Conversations list marks such rows and they do not take the tap.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(async () => null), apiHeaders: jest.fn() }));
jest.mock('../src/features/conversations/syncConversations', () => ({ syncConversationsFromServer: jest.fn(async () => null) }));
const mockOpenRoom = jest.fn();
jest.mock('../src/features/counseling/bridge', () => ({
  isNativeUnity: () => true,
  getUnityBridge: () => ({ onEvent: () => () => {}, openCounselingRoom: mockOpenRoom }),
  nativeUnityBridge: { onEvent: () => () => {} },
  unityApiBase: 'http://localhost:4000',
}));
const mockNav = { replace: jest.fn(), goBack: jest.fn(), navigate: jest.fn(), canGoBack: jest.fn(() => true) };
let mockParams: Record<string, unknown> = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: () => {},
}));

import { UnityEntryScreen } from '../src/features/counseling/screens/UnityEntryScreen';
import { ConversationsScreen } from '../src/features/conversations/screens/ConversationsScreen';
import { useSceneTransition } from '../src/shared/transition/sceneTransition';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { localizeCounselors } from '../src/features/counselors/data/mockCounselors';
import { useLanguageStore } from '../src/shared/i18n';

const OPEN = localizeCounselors('en').find(c => !c.comingSoon)!;
let tree: ReactTestRenderer.ReactTestRenderer | null = null;
// The words on screen (a FlatList's tree does not serialise: its refs are circular).
const shown = () =>
  tree!.root.findAll(n => n.type === ('Text' as never)).map(n => [].concat(n.props.children).join('')).join('\n');
const byTestID = (id: string) => tree!.root.findAll(n => n.props.testID === id && typeof n.type !== 'string');

const enter = async (params: Record<string, unknown>) => {
  mockParams = params;
  await act(async () => { tree = ReactTestRenderer.create(<UnityEntryScreen />); });
};

beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'en' });
  useSceneTransition.setState({ active: null });
  jest.clearAllMocks();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
});

describe('UnityEntryScreen', () => {
  it('a saved person this phone does not have: says so, offers the way back, no veil, no room', async () => {
    await enter({ counselorId: OPEN.id, subjectId: 'subj_from_another_phone', resuming: true });
    expect(shown()).toContain("This conversation can't be opened");
    expect(shown()).toContain("The person in this chat isn't saved on this phone");
    expect(useSceneTransition.getState().active).toBeNull();
    expect(mockOpenRoom).not.toHaveBeenCalled();
    expect(mockNav.replace).not.toHaveBeenCalled();
    await act(async () => { byTestID('unity-entry-back')[0].props.onPress(); });
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
  });

  it('a counsellor the roster does not have: says so', async () => {
    await enter({ counselorId: 'retired_card', subjectId: 'self', resuming: true });
    expect(shown()).toContain("This counselor isn't available right now");
    expect(useSceneTransition.getState().active).toBeNull();
    expect(mockOpenRoom).not.toHaveBeenCalled();
  });

  it('Nabi (a room the app draws) opens with no veil waiting on UNITY_READY', async () => {
    await enter({ counselorId: 'nabi', subjectId: 'self', resuming: true });
    expect(useSceneTransition.getState().active).toBeNull();
    expect(mockNav.replace).toHaveBeenCalledWith('CounselingRoom', expect.objectContaining({ counselorId: 'nabi', subjectId: 'self' }));
  });

  it('a room that can open still gets the loading veil and is opened', async () => {
    await enter({ counselorId: OPEN.id, subjectId: 'self' });
    expect(useSceneTransition.getState().active).toMatchObject({ place: 'counsel', name: OPEN.name });
    expect(mockOpenRoom).toHaveBeenCalledTimes(1);
    expect(byTestID('unity-entry-back')).toHaveLength(0);
  });
});

describe('ConversationsScreen', () => {
  const row = (sessionId: string, counselorId: string, subjectId?: string) => ({
    sessionId, counselorId, counselorName: counselorId, counselorAccent: '#000', subjectId,
    lastMessage: `last line of ${sessionId}`, updatedAt: '2026-10-28T10:00:00Z', messages: [],
  });

  it('marks the rows that cannot open here, and they take no tap', async () => {
    const rows = [
      row('s-self', OPEN.id, 'self'),
      row('s-gone', OPEN.id, 'subj_from_another_phone'),
      row('s-retired', 'retired_card', 'self'),
    ];
    useConversationsStore.setState({ order: rows.map(r => r.sessionId), byId: Object.fromEntries(rows.map(r => [r.sessionId, r])) } as never);
    await act(async () => { tree = ReactTestRenderer.create(<ConversationsScreen />); });
    const pressable = (id: string) => byTestID(`conversation-${id}`)[0];

    expect(pressable('s-self').props.disabled).toBe(false);
    expect(shown()).toContain('last line of s-self');
    expect(pressable('s-gone').props.disabled).toBe(true);
    expect(shown()).not.toContain('last line of s-gone');
    expect(shown()).toContain("The person in this chat isn't saved on this phone");
    expect(pressable('s-retired').props.disabled).toBe(true);
    expect(shown()).toContain("This counselor isn't available right now");

    await act(async () => { pressable('s-self').props.onPress(); });
    expect(mockNav.navigate).toHaveBeenCalledWith('UnityEntry', { counselorId: OPEN.id, subjectId: 'self', resuming: true });
  });
});
