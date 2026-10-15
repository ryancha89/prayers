/**
 * The ways into the 3D world (spec 004) that need a real navigator to prove: the 월드 tab is the
 * SECOND tab (홈 · 월드 · 대화 · 아카이브 · 마이), and pressing it opens the root `World` screen over
 * the tabs instead of a page of its own. (The no-player fallback is worldMockFallback.test.tsx.)
 */
import React from 'react';
import { Text as RNText } from 'react-native';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({
  sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn(), send: jest.fn() },
  preload: jest.fn(),
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/coins/api/coinsApi', () => ({ refreshCoins: jest.fn(), buyCoins: jest.fn() }));
jest.mock('../src/features/journey/player/beatVoice', () => ({
  BEAT_LINES: [], dropPendingBeatLines: jest.fn(), openStoryboard: jest.fn(),
  prefetchBeatLines: jest.fn(), sayBeatLine: jest.fn(), stopBeatVoice: jest.fn(),
}));
// The tab pages themselves are not under test; each is a label.
jest.mock('../src/features/home/screens/HomeScreen', () => ({ HomeScreen: () => null }));
jest.mock('../src/features/conversations/screens/ConversationsScreen', () => ({ ConversationsScreen: () => null }));
jest.mock('../src/features/archive/screens/ArchiveScreen', () => ({ ArchiveScreen: () => null }));
jest.mock('../src/features/profile/screens/MyPageScreen', () => ({ MyPageScreen: () => null }));

import { NavigationContainer, createNavigationContainerRef } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { BottomTabNavigator } from '../src/navigation/BottomTabNavigator';
import type { RootStackParamList } from '../src/navigation/types';
import { useLanguageStore } from '../src/shared/i18n';

const Stack = createNativeStackNavigator<RootStackParamList>();
const WorldStub = () => <RNText>WORLD</RNText>;

beforeEach(() => useLanguageStore.setState({ lang: 'ko' }));

describe('the 월드 tab', () => {
  it('is second, and opens the World screen over the tabs', async () => {
    const ref = createNavigationContainerRef<RootStackParamList>();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = ReactTestRenderer.create(
        <NavigationContainer ref={ref}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Tabs" component={BottomTabNavigator} />
            <Stack.Screen name="World" component={WorldStub} />
          </Stack.Navigator>
        </NavigationContainer>,
      );
    });
    const labels = tree.root
      .findAll(n => n.type === RNText && typeof n.props.children === 'string')
      .map(n => n.props.children as string)
      .filter(l => ['홈', '월드', '대화', '아카이브', '마이'].includes(l));
    expect(labels).toEqual(['홈', '월드', '대화', '아카이브', '마이']);

    const tab = tree.root.findAll(n => typeof n.props.onPress === 'function' && n.findAll(c => c.props.children === '월드').length > 0)[0];
    await act(async () => { tab.props.onPress({ preventDefault() {} }); });
    expect(ref.getCurrentRoute()?.name).toBe('World');
    // The tab never became the focused page underneath.
    const tabs = ref.getRootState().routes[0].state;
    expect(tabs?.routes[tabs.index ?? 0]?.name).toBe('Home');
    act(() => tree.unmount());
  });
});

describe('the speaker rule', () => {
  it('counts World as a Unity screen: no SESSION_END posted into it on arrival, no app bed, no mini player', () => {
    const { UNITY_SCREENS } = require('../src/App');
    expect(UNITY_SCREENS.has('World')).toBe(true);
  });
  it('counts MyRoom (the world’s 개인실 door) as a Unity screen too', () => {
    const { UNITY_SCREENS } = require('../src/App');
    expect(UNITY_SCREENS.has('MyRoom')).toBe(true);
  });
});
