/**
 * The journey mini player floats over every screen (App.tsx). Sim 02-10, landscape: it sat on top of
 * CounselorDetail's docked "Start Counseling" bar. A screen with a bottom bar reports its height
 * (useBottomDock) and the mini player rides above it, clear of the island on either side.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { StyleSheet } from 'react-native';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
const mockInsets = { top: 0, right: 62, bottom: 21, left: 62 };
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => mockInsets,
}));

import { JourneyMiniPlayer } from '../src/features/journey/components/JourneyMiniPlayer';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { useBottomDock } from '../src/shared/layout/bottomDock';
import { MiniPlayerSpacer, useMiniPlayerInset } from '../src/shared/layout/miniPlayerInset';

const barStyle = (tree: ReactTestRenderer.ReactTestRenderer) =>
  StyleSheet.flatten(tree.root.findAll(n => n.props.accessibilityRole === 'button')[0].props.style);

describe('the journey mini player', () => {
  beforeEach(() => {
    useJourneyPlayer.setState({ journeyId: 'newyear-2027', counselorId: 'yunjung_01', status: 'playing', chapterIndex: 0 });
  });
  afterEach(() => useBottomDock.getState().set(0));

  it('rides above a screen’s docked bottom bar, and comes back down when it goes', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<JourneyMiniPlayer aboveTabs={false} hidden={false} onOpen={() => {}} />); });
    expect(barStyle(tree).bottom).toBe(21 + 8);
    act(() => useBottomDock.getState().set(96));
    expect(barStyle(tree).bottom).toBe(96 + 8);
    act(() => useBottomDock.getState().set(0));
    expect(barStyle(tree).bottom).toBe(21 + 8);
  });

  it('keeps clear of the Dynamic Island on either long side in landscape', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<JourneyMiniPlayer aboveTabs={false} hidden={false} onOpen={() => {}} />); });
    const s = barStyle(tree);
    expect(s.left).toBeGreaterThanOrEqual(62);
    expect(s.right).toBeGreaterThanOrEqual(62);
  });

  // Sim 12-10, Conversations: the last rows sat under the bar with no way to scroll them free.
  it('tells the scrolling screens how much it covers, and gives it back when it hides', () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    act(() => { tree = ReactTestRenderer.create(<JourneyMiniPlayer aboveTabs hidden={false} onOpen={() => {}} />); });
    const bar = tree.root.findAll(n => n.props.accessibilityRole === 'button')[0];
    act(() => bar.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 360, height: 64 } } }));
    expect(useMiniPlayerInset.getState().height).toBe(64 + 16);

    let spacer!: ReactTestRenderer.ReactTestRenderer;
    act(() => { spacer = ReactTestRenderer.create(<MiniPlayerSpacer />); });
    expect(StyleSheet.flatten(spacer.root.findByProps({ testID: 'mini-player-spacer' }).props.style).height).toBe(80);

    act(() => tree.update(<JourneyMiniPlayer aboveTabs hidden onOpen={() => {}} />));
    expect(useMiniPlayerInset.getState().height).toBe(0);
    expect(spacer.toJSON()).toBeNull();
  });
});
