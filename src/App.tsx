import React, { useCallback, useState } from 'react';
import { StatusBar } from 'react-native';
import {
  NavigationContainer,
  DarkTheme,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { nativeUnityBridge } from './features/counseling/bridge';
import { RootStackParamList } from './navigation/types';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from './shared/theme';
import { RootNavigator } from './navigation/RootNavigator';
import { SplashScreen } from './shared/components/SplashScreen';

const queryClient = new QueryClient();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.bg,
    card: colors.bgElevated,
    primary: colors.violet,
    text: colors.textPrimary,
    border: 'rgba(255,255,255,0.06)',
    notification: colors.trending,
  },
};

const navigationRef = createNavigationContainerRef<RootStackParamList>();

/** Screens where embedded Unity (and its BGM) is allowed to be audible. */
const UNITY_SCREENS = new Set(['CounselingRoom', 'UnityEntry']);

/** Anywhere outside the consultation room — app start, home, cards, whatever —
 *  Unity audio must be dead. Idempotent, safe when Unity never booted. */
const enforceUnitySilence = () => {
  const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
  if (!route || !UNITY_SCREENS.has(route.name)) nativeUnityBridge.stopAllAudio();
};

const App: React.FC = () => {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => setSplashDone(true), []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <NavigationContainer
          ref={navigationRef}
          theme={navTheme}
          onReady={enforceUnitySilence}
          onStateChange={enforceUnitySilence}>
          <RootNavigator />
        </NavigationContainer>
        {/* Overlay splash: the home screen is already mounted beneath, so the
            final fade lands directly on the main screen (storyboard 4.0s). */}
        {!splashDone && <SplashScreen onDone={onSplashDone} />}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

export default App;
