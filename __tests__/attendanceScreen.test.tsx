import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockParams: { justChecked?: { granted: number } } = {};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
  useFocusEffect: (cb: () => void) => require('react').useEffect(cb, [cb]),
}));
jest.mock('react-native-safe-area-context', () => ({ SafeAreaView: ({ children }: any) => children }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/tickets/api/attendance', () => ({
  localDate: () => '2026-09-27',
  fetchAttendance: async () => ({ checkedToday: true, dailyCoins: 20, coinBalance: 120, daysTotal: 1 }),
  fetchAttendanceMonth: async () => ({ year: 2026, month: 9, days: [{ date: '2026-09-27', coins: 20 }], count: 1, coins: 20 }),
  checkIn: jest.fn(),
}));

import { AttendanceScreen } from '../src/features/tickets/screens/AttendanceScreen';

const text = (tree: ReactTestRenderer.ReactTestRenderer) =>
  tree.root.findAllByType(require('react-native').Text).map(n => [].concat(n.props.children).join('')).join(' | ');

describe('the check-in page', () => {
  it('says the check-in happened, and shows the stamp, the wallet and the rules', async () => {
    mockParams.justChecked = { granted: 20 };
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(<AttendanceScreen />);
    });
    await act(async () => {});
    const all = text(tree);
    expect(all).toContain('Checked in!');
    expect(all).toContain('You got 20 PC!');
    expect(all).toContain('120 Prayer Coins');
    expect(all).toContain('This month: checked in 1');
    expect(all).toContain('How check-in works');
    // a whole month of days was drawn
    expect(all).toContain('30');
  });
});
