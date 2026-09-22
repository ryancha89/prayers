import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from './headers';
import { signedOut } from '../store/authStore';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { useFavoritesStore } from '../../counselors/store/favoritesStore';

/** A self with no birth data — the same shape first run starts from, so the app asks again. */
const EMPTY_SELF = { id: 'self', displayName: '', isUser: true as const };

/**
 * Delete the account, for real, from inside the app.
 *
 * REQUIRED, not a nicety: App Store Guideline 5.1.1(v) says an app that lets people create an
 * account must let them delete it in the app. This app grew an account today, so it grew this
 * obligation with it — a sign-in with no way out is a rejected submission.
 *
 * ⚠️ The server answers 200 with `{deleted: false}` when the row could not be destroyed (a foreign
 * key still pointing at it, see users_controller#delete_account). So `res.ok` is NOT the test: a
 * client that signs out on 200 would strand the player outside an account that still exists, with
 * their tickets in it. Only `deleted === true` counts.
 */
export async function deleteAccount(): Promise<boolean> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/users/delete_account`, {
      method: 'DELETE',
    });
    if (!res) return false;
    const body = (await res.json().catch(() => null)) as { deleted?: boolean } | null;
    if (!res.ok || body?.deleted !== true) {
      if (__DEV__) devlog(`[auth] delete_account refused (${res.status} deleted=${body?.deleted})`);
      return false;
    }
  } catch {
    return false;
  }

  await forgetLocalData();
  signedOut();
  return true;
}

/**
 * Everything this device kept that belonged to that person.
 *
 * The account is gone from the server; leaving the saved people, the consultation history and the
 * favourites on the phone would hand the next person to sign in someone else's birth dates. Keyed
 * by prefix rather than by importing four stores, so a store added later cannot be forgotten here
 * — the one thing that must NOT be cleared is the language choice, which belongs to the device.
 */
const KEEP = ['prayers.lang', 'prayers.sound'];

export async function forgetLocalData() {
  // ⚠️ ORDER MATTERS, and the wrong way round looks like it works. `persist` writes on every
  // setState, so sweeping storage first and resetting the stores second puts a fresh row back on
  // disk a moment later. Reset the live stores, THEN sweep: a late write can only ever land empty
  // state, and the row itself is gone.
  //
  // The sweep covers a store added later; the three resets cover this second, because `persist`
  // keeps its state in memory after the row is gone and the previous person's saved people would
  // stay on screen until the app restarts — the exact moment they must not be there.
  useSubjectsStore.setState({ self: EMPTY_SELF, subjects: [], profileDeferred: false });
  useConversationsStore.setState({ byId: {}, order: [] });
  useFavoritesStore.setState({ ids: [] });

  try {
    // `removeItem` one at a time rather than multiRemove: this build's AsyncStorage typing does
    // not carry the batch call, and there are five keys, not five thousand.
    const keys = await AsyncStorage.getAllKeys();
    const mine = keys.filter(k => k.startsWith('prayers.') && !KEEP.some(p => k.startsWith(p)));
    await Promise.all(mine.map(k => AsyncStorage.removeItem(k)));
  } catch {
    // A device that cannot clear its own storage is still better off signed out than signed in.
  }
}
