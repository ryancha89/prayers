import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiBase } from '../../../shared/config/api';
import { devlog } from '../../../shared/devlog';
import { authedFetch } from './headers';
import { signedOut } from '../store/authStore';
import { useSubjectsStore } from '../../subjects/store/subjectsStore';
import { useConversationsStore } from '../../conversations/store/conversationsStore';
import { useFavoritesStore } from '../../counselors/store/favoritesStore';
import { useArchiveStore } from '../../archive/store/archiveStore';
import { useDiaryStore } from '../../myroom/diary/diaryStore';
import { forgetAllLocalPhotos } from '../../myroom/diary/photos';
import { useMyRoomStore } from '../../myroom/store/myRoomStore';
import { forgetAvatar } from '../../profile/avatar/avatar';
import { forgetJourneyVoices } from '../../journey/api/voiceCache';
import { useSavedJourneys } from '../../journey/store/savedJourneysStore';
import { useJourneyProfile } from '../../journey/store/journeyProfileStore';
import { useInbox } from '../../myroom/inbox/inboxStore';
import { cancelReminders, useReminder } from '../../notifications/reminder';
import { stopCoinConfirms } from '../../coins/api/coinsApi';
import { useCoins } from '../../coins/store/coinStore';
import { stopPassConfirms } from '../../journey/api/passPurchase';
import { useJourneyPlayer } from '../../journey/player/journeyPlayer';

/** A self with no birth data — the same shape first run starts from, so the app asks again. */
const EMPTY_SELF = { id: 'self', displayName: '', isUser: true as const };

/**
 * Delete the account, for real, from inside the app.
 *
 * REQUIRED, not a nicety: App Store Guideline 5.1.1(v) says an app that lets people create an
 * account must let them delete it in the app. This app grew an account today, so it grew this
 * obligation with it — a sign-in with no way out is a rejected submission.
 *
 * `DELETE /api/v1/prayers/account` deletes the Prayers account only (memories, diary, journeys,
 * coins, chats, birth profile…; the `prayers_users` row is anonymised and its `pgt_` tokens die at
 * once). It answers `200 {deleted: true}`. `res.ok` alone is still NOT the test: a client that
 * signs out on any 200 would strand the player outside an account that may still exist, with their
 * coins in it. Only `deleted === true` counts.
 */
export interface DeleteAccountOptions {
  /** One of the server's reason codes (PrayersAccountDeletion::REASONS); optional. */
  reason?: string;
  /** Free text for "other", ≤ 500 chars. */
  detail?: string;
  /** A FRESH Sign in with Apple code, so the server can revoke the Apple tokens (Apple rule). */
  appleAuthorizationCode?: string;
}

export async function deleteAccount(opts: DeleteAccountOptions = {}): Promise<boolean> {
  try {
    const res = await authedFetch(`${apiBase()}/api/v1/prayers/account`, {
      method: 'DELETE',
      body: JSON.stringify({
        reason: opts.reason,
        detail: opts.detail,
        apple_authorization_code: opts.appleAuthorizationCode,
      }),
    });
    if (!res) return false;
    const body = (await res.json().catch(() => null)) as { deleted?: boolean } | null;
    if (!res.ok || body?.deleted !== true) {
      if (__DEV__) devlog(`[auth] prayers/account delete refused (${res.status} deleted=${body?.deleted})`);
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
 * — what must NOT be cleared is what belongs to the device: the language, the sound settings and
 * (29-10) the reminder's time and on/off, which the sweep used to delete though the reminder's own
 * comments said it stayed.
 */
const KEEP = ['prayers.lang', 'prayers.sound', 'prayers.reminder'];

export async function forgetLocalData() {
  // 29-10: the journey playing on sign-out kept narrating the last person's name over Login, and the
  // next account found their mini player. Stopped first — before forgetJourneyVoices deletes the
  // files it is reading from.
  useJourneyPlayer.getState().stop();
  // 29-10: a store payment still being confirmed for this account must not be retried with the
  // next one's token (the server would credit them). Its store transaction stays unfinished.
  stopCoinConfirms();
  stopPassConfirms();
  // The balance is the account's, not the device's: the next account sees "—" until its own loads.
  useCoins.setState({ balance: null });
  // ⚠️ ORDER MATTERS, and the wrong way round looks like it works. `persist` writes on every
  // setState, so sweeping storage first and resetting the stores second puts a fresh row back on
  // disk a moment later. Reset the live stores, THEN sweep: a late write can only ever land empty
  // state, and the row itself is gone.
  //
  // The sweep covers a store added later; the three resets cover this second, because `persist`
  // keeps its state in memory after the row is gone and the previous person's saved people would
  // stay on screen until the app restarts — the exact moment they must not be there.
  // playerCharacter too: left set, the next account on this phone skipped its character screen.
  useSubjectsStore.setState({ self: EMPTY_SELF, subjects: [], profileDeferred: false, playerCharacter: undefined, playerHair: '', playerOutfit: '', creatorSeen: false, characterUnpushed: false });
  useConversationsStore.setState({ byId: {}, order: [] });
  useFavoritesStore.setState({ ids: [] });
  // The 아카이브 and the diary (spec 006) too: left in memory, the next person would see these
  // entries on the desk book, and their still-dirty rows and photos would push into that account.
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [], lastSyncedAt: undefined });
  useDiaryStore.setState({ reflections: {}, photos: {}, photoDeletes: [] });
  // My Room's cached layout is keyed per account already; dropped all the same, with the rest.
  useMyRoomStore.setState({ byUser: {} });
  // 29-10: the saved journeys (readings for people by name, listed in the 아카이브), the profile a
  // ride was for, and the mailbox. Left in memory, the next store update wrote them back — and the
  // previous person's `checkin:<today>` row made the next account's own check-in gift never appear.
  useSavedJourneys.setState({ journeys: [], unlocks: {}, heard: {} });
  useJourneyProfile.setState({ subjectId: 'self' });
  useInbox.setState({ items: [] });
  // The language stays (it is the device's), and so does `langUnpushed` (29-10): every way to a
  // sign-in comes through here, so clearing it meant a choice the account never took was pulled
  // back over at the next sign-in instead of being pushed to it.
  // The reminder's time is the device's (its row is in KEEP); the day it skips is the account's
  // check-in. The planned ones go now (29-10): they kept ringing "check in" at a signed-out phone,
  // in the old language — App.tsx plans them again at the next sign-in.
  useReminder.setState({ checkedOn: null });
  await cancelReminders();
  await forgetAllLocalPhotos();
  // The profile photo is a face: the next person on this phone must not open My Page on it.
  await forgetAvatar();
  // Journey narration kept for replays says the player's name and year.
  await forgetJourneyVoices();

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
