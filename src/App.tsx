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
import { create } from 'zustand';
import { JourneyMiniPlayer } from './features/journey/components/JourneyMiniPlayer';
import { CoinShopSheet } from './features/coins/components/CoinShopSheet';
import { useJourneyPlayer } from './features/journey/player/journeyPlayer';

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
// ⚠️ MeditationRoom is in here since 21-09, when that room became a Unity scene. Leave it out and
// `stopAllAudio()` fires on arrival — it posts SESSION_END, which is Unity's teardown — so the
// room would be silenced the instant the player walked into it. The app's own bed still stops:
// `inUnity` and `selfScored` lead to the same `backgroundMusic.stop()`, and the meditation loop
// is started by the screen on Begin, exactly as before.
// World (spec 004) since 02-10: the hub is a Unity scene like the rooms — same speaker rule, no mini
// player over it, and above all no SESSION_END posted into it on arrival.
export const UNITY_SCREENS = new Set(['CounselingRoom', 'UnityEntry', 'MeditationRoom', 'World', 'MyRoom']);
/** Screens that host the Unity player but NOT as a room that owns the sound: the train journey
 *  (spec 003) draws its cabin in Unity while its own narration keeps playing. They must not tear
 *  Unity down (stopAllAudio → SESSION_END), and must not pause the journey either — which is why
 *  they are not in UNITY_SCREENS. */
const UNITY_SCENERY_SCREENS = new Set(['Journey']);

/**
 * Screens whose audio is NOT the route's business.
 *
 * The meditation room is the one place where the music is the content rather than the background,
 * and content starts when the player says so. So the route rule does half the job — it silences the
 * app's bed on the way in — and the screen does the other half: the loop starts on Begin, pauses on
 * Pause, and is dropped on the way out. A bed that came up with the screen would be playing at
 * someone still deciding whether they have ten minutes.
 */
const SELF_SCORED_SCREENS = new Set(['MeditationRoom']);

/** Whether the app's own music may play. The splash has a cue of its own and the two would
 *  overlap, so nothing starts until it is done. */
let musicAllowed = false;

/**
 * The app's own bed (`prayers_ambient`) under the ordinary screens — OFF since 26-09 ("앱 배경음
 * 안나오게해"). Only the app bed: the meditation room's music is that session's content and is
 * started by the screen itself, and the rooms' music is Unity's. The track and all of the plumbing
 * stay, so bringing it back is this one line.
 *
 * ON again 28-09, softer (0.22, set in backgroundMusic.ts) — asked for "nhạc nhẹ nhẹ". Off while a
 * journey owns the speaker: the journey plays this SAME track as its own bed, and two copies of one
 * loop out of phase is a flanger, not music.
 */
const APP_BED_ENABLED = true;

/** Journey states whose own audio (bed + carriage + narration) is live. Paused/done hand it back. */
const JOURNEY_SOUNDING = new Set(['boarding', 'platform', 'playing', 'transition']);

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

/** The route on screen, for what floats above the navigator (the journey's mini player). */
const useCurrentRoute = create<{ name: string | null }>(() => ({ name: null }));

/** Screens the mini player stays off: the journey's own screens, and the rooms that own the sound. */
const NO_MINI_PLAYER = new Set(['Journey', 'JourneyResult', 'JourneyEnding', 'JourneyCollection', 'JourneyCounselor', 'JourneyPass', 'Login', 'ProfileSetup']);

const syncAudioToRoute = () => {
  const route = navigationRef.isReady() ? navigationRef.getCurrentRoute() : undefined;
  const inUnity = !!route && UNITY_SCREENS.has(route.name);
  useCurrentRoute.setState({ name: route?.name ?? null });

  if (!inUnity && !(route && UNITY_SCENERY_SCREENS.has(route.name))) nativeUnityBridge.stopAllAudio();

  const selfScored = !!route && SELF_SCORED_SCREENS.has(route.name);

  // A journey's narration must not talk over a counsellor or the meditation bell: it pauses there
  // and waits in the mini player.
  if (inUnity || selfScored) useJourneyPlayer.getState().pause();

  const journeySounding =
    (!!route && UNITY_SCENERY_SCREENS.has(route.name)) || JOURNEY_SOUNDING.has(useJourneyPlayer.getState().status);

  if (inUnity || selfScored || journeySounding || !musicAllowed || !APP_BED_ENABLED) backgroundMusic.stop();
  else backgroundMusic.start('app');
};

// The journey keeps playing from the mini player on other screens, so its start/stop must hand the
// speaker over even when no navigation happens.
useJourneyPlayer.subscribe((st, prev) => {
  if (JOURNEY_SOUNDING.has(st.status) !== JOURNEY_SOUNDING.has(prev.status)) syncAudioToRoute();
});

const App: React.FC = () => {
  const [splashDone, setSplashDone] = useState(false);
  const routeName = useCurrentRoute(s => s.name);
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
        <JourneyMiniPlayer
          aboveTabs={routeName === 'Home' || routeName === 'Conversations' || routeName === 'Archive' || routeName === 'My'}
          hidden={
            !splashDone ||
            routeName == null ||
            NO_MINI_PLAYER.has(routeName) ||
            UNITY_SCREENS.has(routeName) ||
            SELF_SCORED_SCREENS.has(routeName)
          }
          onOpen={() => navigationRef.isReady() && navigationRef.navigate('Journey')}
        />
        {/* One coin shop for the whole app: the header pills and the journey's locks open it. */}
        <CoinShopSheet />
        {/* Overlay splash: the home screen is already mounted beneath, so the
            final fade lands directly on the main screen (storyboard 4.0s). */}
        {!splashDone && <SplashScreen onDone={onSplashDone} />}
      </SafeAreaProvider>
    </QueryClientProvider>
  );
};

export default App;
