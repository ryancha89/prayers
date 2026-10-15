import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { WorldSpot, WorldZone } from '../../counseling/types';

/**
 * Where the player stands in the 3D world (spec 004), kept on the phone — there is no server side.
 *
 * Two answers to "where do I appear", and they are not the same thing:
 *  · `position` — the last WORLD_POSITION Unity reported. Persisted: leaving for 2D (or closing the
 *    app) and coming back puts the player where they stood.
 *  · `returnZone` — the door the player just went through into a room. NOT persisted and spent on
 *    the next WORLD_INIT: walking back out of the meditation room should put you on its steps, but
 *    a cold start tomorrow should not.
 */
interface WorldState {
  position: WorldSpot | null;
  returnZone: WorldZone | null;
  setPosition(spot: WorldSpot): void;
  setReturnZone(zone: WorldZone | null): void;
}

/** A spot Unity sent that is actually a spot. JsonUtility writes NaN as "NaN", which JSON.parse
 *  hands back as a string — and a NaN spawn would drop the player through the floor. */
export function isSpot(v: unknown): v is WorldSpot {
  const s = v as WorldSpot | null;
  return !!s && [s.x, s.z, s.yaw].every(n => typeof n === 'number' && Number.isFinite(n));
}

export const useWorldStore = create<WorldState>()(
  persist(
    set => ({
      position: null,
      returnZone: null,
      setPosition: spot => {
        if (isSpot(spot)) set({ position: { x: spot.x, z: spot.z, yaw: spot.yaw } });
      },
      setReturnZone: zone => set({ returnZone: zone }),
    }),
    {
      name: 'prayers.world',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ position: s.position }),
      // A stored value this build cannot read spawns on the plaza rather than somewhere invalid.
      merge: (persisted, current) => {
        const p = (persisted as { position?: unknown } | undefined)?.position;
        return { ...current, position: isSpot(p) ? p : null };
      },
    },
  ),
);
