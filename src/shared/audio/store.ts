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
}

export const useSoundStore = create<SoundState>()(
  persist(
    (set, get) => ({
      musicEnabled: true,
      setMusicEnabled: on => set({ musicEnabled: !!on }),
      toggleMusic: () => set({ musicEnabled: !get().musicEnabled }),
    }),
    {
      name: 'prayers.sound.v1',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const saved = (persisted as Partial<SoundState> | undefined)?.musicEnabled;
        // Anything but a stored `false` means on: a corrupted or half-written preference should
        // leave the app sounding the way it does out of the box.
        return { ...current, musicEnabled: saved !== false };
      },
    },
  ),
);

/** The setting, readable outside React — the audio player is a module, not a component. */
export const musicEnabled = () => useSoundStore.getState().musicEnabled;
