import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUserAuth } from '../../auth/store/authStore';
import type { MyRoomLayout, MyRoomLayoutChanged, MyRoomOwned } from '../../counseling/types';
import { getMyRoom, saveLayout as putLayout, type SaveLayoutResult } from '../api/myRoomApi';

/**
 * My Room's layout as this phone last heard it from the server (spec 005 T024, FR-006).
 *
 * THE ACCOUNT IS THE RECORD, THE PHONE IS THE CACHE — as for conversations. The room opens on the
 * cached copy at once (no flash of the default room, and it still opens offline); the GET that
 * follows replaces it when the server says otherwise. Nothing here is ever sent to Unity that the
 * server did not send first.
 *
 * PER ACCOUNT: rows are keyed by the `User-Auth` uid, so a second account signed in on the same
 * phone opens on its own room (or the default), never on the previous person's.
 *
 * `saveLayout` is the editor's way to store a room (decorate mode is a later phase). It sends the
 * version the cached copy was loaded at; a conflict or a save both leave the server's copy here, so
 * the caller only has to show `layout` again.
 */
export interface CachedMyRoom {
  layout: MyRoomLayout;
  /** The server's version of `layout`; 0 = never saved. PUT must send it back. */
  version: number;
  owned: MyRoomOwned;
  /** ISO. When the server last said so. */
  updatedAt: string;
}

interface MyRoomStoreState {
  byUser: Record<string, CachedMyRoom>;
  /** This account's cached room, or null if the phone has never heard it. */
  current(): CachedMyRoom | null;
  /** GET the room and cache it. null = no answer: the cache is left as it was. */
  refresh(signal?: AbortSignal): Promise<CachedMyRoom | null>;
  /** PUT a layout at the cached version. A save or a conflict caches the server's copy. */
  saveLayout(layout: MyRoomLayout): Promise<SaveLayoutResult>;
  /** A purchase changed what the account owns. */
  setOwned(owned: MyRoomOwned): void;
  /** Decorate mode's working copy — Unity's last MYROOM_LAYOUT_CHANGED — kept until Done or
   *  Cancel (spec 005 edge case: backgrounded mid-edit). In memory only: a relaunch starts clean. */
  pending: (MyRoomLayoutChanged & { user: string }) | null;
  setPending(changed: MyRoomLayoutChanged | null): void;
  /** The working copy, if it is this account's. */
  pendingEdit(): MyRoomLayoutChanged | null;
  /** Accounts that have seen decorate mode's three-step coach (persisted with the rooms). */
  coachSeen: Record<string, true>;
  markCoachSeen(): void;
}

/** The cache key for whoever is signed in. A phone nobody signed in on still has one room. */
export const myRoomUserKey = () => getUserAuth() ?? '-';

export const useMyRoomStore = create<MyRoomStoreState>()(
  persist(
    (set, get) => {
      const put = (user: string, row: Omit<CachedMyRoom, 'updatedAt'>) => {
        const cached = { ...row, updatedAt: new Date().toISOString() };
        set(s => ({ byUser: { ...s.byUser, [user]: cached } }));
        return cached;
      };
      return {
        byUser: {},
        current: () => get().byUser[myRoomUserKey()] ?? null,
        refresh: async signal => {
          // Read the key before the await: an account switch mid-request must not file one
          // person's room under the other.
          const user = myRoomUserKey();
          const r = await getMyRoom(signal);
          if (!r || signal?.aborted) return null;
          return put(user, r);
        },
        saveLayout: async layout => {
          const user = myRoomUserKey();
          const version = get().byUser[user]?.version ?? 0;
          const r = await putLayout(layout, version);
          if (r.kind === 'saved' || r.kind === 'conflict') {
            put(user, { layout: r.layout, version: r.version, owned: r.owned });
          }
          return r;
        },
        pending: null,
        coachSeen: {},
        markCoachSeen: () => set(s => ({ coachSeen: { ...s.coachSeen, [myRoomUserKey()]: true } })),
        setPending: changed => set({ pending: changed ? { ...changed, user: myRoomUserKey() } : null }),
        pendingEdit: () => {
          const p = get().pending;
          return p && p.user === myRoomUserKey() ? p : null;
        },
        setOwned: owned => {
          const user = myRoomUserKey();
          const row = get().byUser[user];
          if (row) set(s => ({ byUser: { ...s.byUser, [user]: { ...row, owned } } }));
        },
      };
    },
    {
      name: 'prayers.myroom.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: s => ({ byUser: s.byUser, coachSeen: s.coachSeen }),
    },
  ),
);

/** Same room for Unity's purposes: `null` (never heard) is the default room, as is a never-saved
 *  basic one. Compared as JSON because both sides are the server's own canonical shape. */
export function sameLayout(a: MyRoomLayout | null, b: MyRoomLayout | null): boolean {
  const norm = (l: MyRoomLayout | null) => (l == null || (l.items == null && l.theme === 'basic') ? null : l);
  return JSON.stringify(norm(a)) === JSON.stringify(norm(b));
}
