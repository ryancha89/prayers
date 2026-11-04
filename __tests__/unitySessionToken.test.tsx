/**
 * SESSION_INIT hands the embedded player the account's own credential (29-10).
 *
 * The Unity player used to carry the server's static Saju-Authorization secret in its Resources —
 * readable from the App Store build. It no longer ships, so the room's Rails calls (chat, voice, mic)
 * run on the per-user `pgt_` Game-Token, and the app hands over the one it holds. Pinned here:
 *  · a live token goes out as `gameToken`, beside `auth`,
 *  · an expired one does not (Unity then mints its own from `auth`) — never a stale credential.
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
import { signedIn, storeGameToken, signedOut } from '../src/features/auth/store/authStore';
import { localizeCounselors } from '../src/features/counselors/data/mockCounselors';
import { useLanguageStore } from '../src/shared/i18n';
import { useSceneTransition } from '../src/shared/transition/sceneTransition';

const OPEN = localizeCounselors('en').find(c => !c.comingSoon && c.id !== 'nabi')!;
let tree: ReactTestRenderer.ReactTestRenderer | null = null;

const enter = async () => {
  mockParams = { counselorId: OPEN.id, subjectId: 'self' };
  await act(async () => { tree = ReactTestRenderer.create(<UnityEntryScreen />); });
};

beforeEach(async () => {
  await useLanguageStore.persist.rehydrate();
  useLanguageStore.setState({ lang: 'en' });
  useSceneTransition.setState({ active: null });
  signedIn({ userAuth: 'pr_account', displayName: 'Linh', provider: 'dev' });
  jest.clearAllMocks();
});
afterEach(() => {
  if (tree) act(() => tree!.unmount());
  tree = null;
  signedOut();
});

describe('SESSION_INIT credentials', () => {
  it('carries the live pgt_ Game-Token beside the account uid', async () => {
    storeGameToken('pgt_live', Date.now() + 60 * 60 * 1000);
    await enter();
    expect(mockOpenRoom).toHaveBeenCalledTimes(1);
    expect(mockOpenRoom.mock.calls[0][0]).toMatchObject({ auth: 'pr_account', gameToken: 'pgt_live' });
  });

  it('does not hand over an expired token — Unity mints its own from auth', async () => {
    storeGameToken('pgt_stale', Date.now() - 1000);
    await enter();
    expect(mockOpenRoom).toHaveBeenCalledTimes(1);
    expect(mockOpenRoom.mock.calls[0][0]).toMatchObject({ auth: 'pr_account', gameToken: '' });
  });
});
