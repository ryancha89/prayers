/**
 * 29-10: the room's `canAsk` compared the wallet with a hard-coded 10. On local :4000 a dev- account
 * has 0 coins and the server answers its turns free (Prayers::CoinGate, development), yet the mic,
 * the chip and Retry all opened the coin card and sent nothing. The room now gates on the price the
 * server quotes for this player (prayers/tickets_balance `consult_cost`), 10 when it quotes none.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), send: jest.fn(), back: jest.fn() } }));
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
}));
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), pop: jest.fn(), popTo: jest.fn(), getState: () => ({ routes: [] }), addListener: () => () => {} }),
  useRoute: () => ({ params: { counselorId: 'yuna', subjectId: 'self', sessionId: 's1' } }),
}));
jest.mock('../src/features/counseling/api/prayersServer', () => ({ fetchRecall: async () => null }));
jest.mock('../src/features/counseling/bridge', () => ({
  getUnityBridge: () => ({ onEvent: () => () => {}, sendEvent: () => {}, closeCounselingRoom: async () => {}, sendViewInsets: () => {} }),
  isNativeUnity: () => false,
}));
const mockPrice = jest.fn();
jest.mock('../src/features/counseling/api/consultPrice', () => ({
  ...jest.requireActual('../src/features/counseling/api/consultPrice'),
  fetchConsultPrice: () => mockPrice(),
}));
jest.mock('../src/features/coins/api/coinsApi', () => ({ CONSULT_COST: 10, fetchCoins: async () => null, refreshCoins: async () => {} }));
let mockOpts: { canAsk?: () => boolean; coinsShort?: () => Promise<boolean> } = {};
jest.mock('../src/features/counseling/hooks/useConsultationEngine', () => ({
  useConsultationEngine: (opts: typeof mockOpts) => {
    mockOpts = opts;
    return {
      ready: true,
      walking: false,
      state: {
        phaseId: 'P02', screen: 'none', speaker: '', line: '', choices: [], canTap: false, inputEnabled: false,
        notice: null, report: null, tone: '', emotion: 'neutral', transcript: [], suggestion: '', topic: '',
        finished: false, pending: false, speaking: false, mic: { state: 'idle', level: 0, error: '', offered: false },
      },
      remember: () => {},
      micAvailable: false,
    };
  },
}));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { CounselingRoomScreen } from '../src/features/counseling/screens/CounselingRoomScreen';
import { useCoins } from '../src/features/coins/store/coinStore';

async function enter() {
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    tree = ReactTestRenderer.create(<CounselingRoomScreen />);
  });
  return tree;
}

afterEach(() => mockPrice.mockReset());

it('an empty wallet asks freely where the server prices a turn at 0', async () => {
  mockPrice.mockResolvedValue({ balance: 0, cost: 0 });
  const tree = await enter();
  expect(useCoins.getState().balance).toBe(0);
  let ok = false;
  act(() => { ok = mockOpts.canAsk!(); });
  expect(ok).toBe(true);
  await expect(mockOpts.coinsShort!()).resolves.toBe(false);
  act(() => tree.unmount());
});

it('an empty wallet is refused where a turn costs 10 — and when the server does not say', async () => {
  for (const price of [{ balance: 0, cost: 10 }, null]) {
    mockPrice.mockResolvedValue(price);
    useCoins.getState().setBalance(0);
    const tree = await enter();
    let ok = true;
    act(() => { ok = mockOpts.canAsk!(); });
    expect(ok).toBe(false);
    act(() => tree.unmount());
  }
});
