import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The account's profile photo, as this phone knows it.
 *
 * Two copies, because each covers the other's gap: `localUri` is the picked file kept in
 * Documents/profile/ (shown at once, and offline), `remoteUrl` is the CDN copy saved on the
 * account's Profile row (`image_path`) — what a second phone, or this one after a reinstall, pulls.
 *
 * `pending` is the server step still owed, so a pick made offline is not lost:
 *   - 'upload' — the local file has not reached the server yet;
 *   - 'link'   — it has (`remoteUrl` is set) but the Profile row does not point at it yet;
 *   - 'remove' — the photo was taken off here; the row still has it.
 *
 * `uid` is whose photo this is. A different account signing in on the same phone must never see
 * (or upload) the previous one's face; `syncAvatar` resets the store when the two disagree.
 */
export type AvatarPending = 'upload' | 'link' | 'remove' | null;

interface AvatarState {
  uid: string | null;
  localUri: string | null;
  remoteUrl: string | null;
  pending: AvatarPending;
}

export const EMPTY_AVATAR: AvatarState = { uid: null, localUri: null, remoteUrl: null, pending: null };

export const useAvatarStore = create<AvatarState>()(
  persist(() => EMPTY_AVATAR, {
    name: 'prayers.avatar.v1',
    storage: createJSONStorage(() => AsyncStorage),
  }),
);
