/**
 * The end of the 2027 journey: Ending → Collection → (내 컬렉션 보기) Result, and back again.
 * 01-10 on the simulator: back from the result stopped the player, the collection then rendered
 * `null` — a black page with no back button and no way out.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

const mockNav = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  replace: jest.fn(),
  addListener: () => () => {},
  getState: jest.fn(() => ({ routes: [{ name: 'Tabs' }, { name: 'JourneyCollection' }, { name: 'JourneyResult' }] })),
};
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNav,
  useFocusEffect: () => {},
}));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => { store.set(k, v); },
      removeItem: async (k: string) => { store.delete(k); },
    },
  };
});
jest.mock('react-native-safe-area-context', () => {
  const { View } = jest.requireActual('react-native');
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

import { JourneyCollectionScreen } from '../src/features/journey/screens/JourneyCollectionScreen';
import { JourneyResultScreen } from '../src/features/journey/screens/JourneyResultScreen';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';

const pressBack = (tree: ReactTestRenderer.ReactTestRenderer) => {
  const back = tree.root.findAll(n => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
  act(() => back.props.onPress());
};

describe('leaving the end of the journey', () => {
  beforeEach(() => {
    mockNav.goBack.mockClear();
    mockNav.getState.mockClear();
  });

  it('back from the result opened by the collection keeps the journey', () => {
    useJourneyPlayer.setState({
      journeyId: 'newyear-2027', counselorId: 'theo_01', tone: 'sudam', lang: 'en',
      content: {
        journey: 'newyear-2027', year: 2027, counselor: 'sudam', chapters: [],
        summary: { bestMonths: [5], cautionMonths: [9], keywords: ['a'], months: [] },
      } as any,
    });
    const stop = jest.spyOn(useJourneyPlayer.getState(), 'stop');
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<JourneyResultScreen />); });
    pressBack(tree);
    expect(stop).not.toHaveBeenCalled();
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
    stop.mockRestore();
  });

  it('an empty collection still has a way out', () => {
    useJourneyPlayer.setState({ journeyId: null });
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<JourneyCollectionScreen />); });
    expect(tree.toJSON()).not.toBeNull();
    pressBack(tree);
    expect(mockNav.goBack).toHaveBeenCalledTimes(1);
    act(() => tree.unmount());
  });
});
