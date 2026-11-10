import { Vibration } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The haptic tick (spec 010 FR-008) — a seam, on purpose.
 *
 * NOTE: no haptics library exists in this app (verified by grep: no react-native-haptic-feedback
 * or similar in package.json, and no `Vibration` usage anywhere in src before this file). Phase 1
 * rides RN core `Vibration`, which on iOS is a fixed-length buzz that ignores the duration — it
 * may feel heavy as a per-tap tick, which is exactly why the toggle exists and why THIS FILE is
 * the swap point: when react-native-haptic-feedback (or Expo Haptics) is linked, `tick()` is the
 * one function to rewrite, behind the same guarded-require pattern Apple Sign In, IAP, RNSound
 * and keep-awake already use. Callers never change.
 *
 * The toggle persists the way the sound switches do (shared/audio/store.ts): zustand + persist +
 * AsyncStorage, and anything but a stored `false` means on.
 */
interface HapticsState {
  enabled: boolean;
  setEnabled: (on: boolean) => void;
  toggle: () => void;
}

export const useHapticsStore = create<HapticsState>()(
  persist(
    (set, get) => ({
      enabled: true,
      setEnabled: on => set({ enabled: !!on }),
      toggle: () => set({ enabled: !get().enabled }),
    }),
    {
      name: 'prayers.haptics.v1',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => {
        const saved = persisted as Partial<HapticsState> | undefined;
        return { ...current, enabled: saved?.enabled !== false };
      },
    },
  ),
);

/** The setting, readable outside React — the tap handler is hot-path code, not a component. */
export const hapticsEnabled = (): boolean => useHapticsStore.getState().enabled;

/**
 * One short tick, for a counted strike. Swallows everything: a missing vibrator (simulator, some
 * Androids) or a platform refusal must never be the reason a tap does not count.
 */
export function tick(): void {
  if (!hapticsEnabled()) return;
  try {
    Vibration.vibrate(10);
  } catch {
    // Feedback is optional; the count is not.
  }
}
