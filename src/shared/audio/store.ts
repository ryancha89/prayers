import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Whether the app plays its own background music.
 *
 * The music obeys the hardware silent switch already (the player uses the Ambient category), but a
 * switch is not a setting: a player who wants the app quiet while their phone is not should not
 * have to mute the whole device, and one who wants everything else audible should not have to give
 * up notifications to silence us.
 *
 * ON by default, because a bed nobody turned on is the point of having written one — and because
 * the alternative, shipping a music feature switched off, is indistinguishable from shipping it
 * broken.
 *
 * Only the APP's bed is governed here. Inside the consultation Unity owns the mix — the counselor's
 * track, her voice, the ritual — and that is a different thing to silence; if this switch ever has
 * to cover it, it has to travel over the bridge, not be read from here.
 */
interface SoundState {
  musicEnabled: boolean;
  setMusicEnabled: (on: boolean) => void;
  toggleMusic: () => void;
  /**
   * The interface sounds — taps, choices, send. A SEPARATE switch from the music, not a tidier
   * single one, because they are answers to different questions: people turn music off to listen
   * to something else while they read, and a tap that still clicks is feedback, not noise. The
   * reverse is also real — a bed is welcome where a stream of ticks is not.
   */
  sfxEnabled: boolean;
  setSfxEnabled: (on: boolean) => void;
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set, get) => ({
      musicEnabled: true,
      setMusicEnabled: on => set({ musicEnabled: !!on }),
      toggleMusic: () => set({ musicEnabled: !get().musicEnabled }),
      sfxEnabled: true,
      setSfxEnabled: on => set({ sfxEnabled: !!on }),
    }),
    {
      name: 'prayers.sound.v1',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const saved = persisted as Partial<SoundState> | undefined;
        // Anything but a stored `false` means on: a corrupted or half-written preference should
        // leave the app sounding the way it does out of the box.
        return {
          ...current,
          musicEnabled: saved?.musicEnabled !== false,
          sfxEnabled: saved?.sfxEnabled !== false,
        };
      },
    },
  ),
);

/** The settings, readable outside React — the audio players are modules, not components. */
export const musicEnabled = () => useSoundStore.getState().musicEnabled;
export const sfxEnabled = () => useSoundStore.getState().sfxEnabled;
