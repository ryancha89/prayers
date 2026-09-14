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
import { backgroundMusic } from './shared/audio/backgroundMusic';
import { preload as preloadSfx } from './shared/audio/sfx';

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

/** Whether the app's own music may play. The splash has a cue of its own and the two would
 *  overlap, so nothing starts until it is done. */
let musicAllowed = false;

/**
 * One speaker, one owner, decided by the route.
 *
 * Inside the room Unity owns the mix — the counselor's track, her voice, the ritual — so the app's
 * music stops. Everywhere else Unity is silenced (it may still be resident) and the app plays its
 * own bed, so choosing a counselor is no longer done in silence.
 *
 * Idempotent both ways: safe when Unity never booted, and safe to call on every navigation change,
 * which is exactly how it is wired.
 */
// The four taps are opened at import, not on first press: see sfx.preload().
preloadSfx();

const syncAudioToRoute = () => {
  const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
  const inUnity = !!route && UNITY_SCREENS.has(route.name);

  if (!inUnity) nativeUnityBridge.stopAllAudio();

  if (inUnity || !musicAllowed) backgroundMusic.stop();
  else backgroundMusic.start();
};

const App: React.FC = () => {
  const [splashDone, setSplashDone] = useState(false);
  const onSplashDone = useCallback(() => {
    setSplashDone(true);
    // The splash chime has finished; the bed can come up under whatever screen is showing.
    musicAllowed = true;
    syncAudioToRoute();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
        <NavigationContainer
          ref={navigationRef}
          theme={navTheme}
          onReady={syncAudioToRoute}
          onStateChange={syncAudioToRoute}>
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
