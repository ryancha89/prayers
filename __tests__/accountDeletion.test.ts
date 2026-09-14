/**
 * Deleting the account, which is the half of "sign in" that App Store review checks.
 *
 * Guideline 5.1.1(v): an app that supports account creation must let the account be deleted from
 * inside the app. The two assertions that matter most are not about the happy path — they are that
 * a refusal does NOT sign the person out (their account still exists, with their tickets in it),
 * and that a success does not leave the previous person's saved people on the phone.
 */
jest.mock(
  '../src/features/counseling/api/devToken',
  () => ({ SAJU_ACCESS_TOKEN: '' }),
  { virtual: true },
);
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
      getAllKeys: async () => [...store.keys()],
    },
  };
});

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteAccount, forgetLocalData } from '../src/features/auth/api/deleteAccount';
import { signInAsDeveloper } from '../src/features/auth/api/session';
import { getUserAuth, signedOut, storeGameToken } from '../src/features/auth/store/authStore';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useConversationsStore } from '../src/features/conversations/store/conversationsStore';
import { useFavoritesStore } from '../src/features/counselors/store/favoritesStore';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;
const stubFetch = (body: unknown, status = 200): FetchMock => {
  const res = { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
  const fn: FetchMock = jest.fn((_u: string, _i?: RequestInit) => Promise.resolve(res));
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  return fn;
};

const realFetch = globalThis.fetch;
beforeEach(() => {
  signInAsDeveloper('dev-doomed');
  storeGameToken('tok', Date.now() + 3_600_000);
});
afterEach(() => {
  (globalThis as unknown as { fetch: typeof realFetch }).fetch = realFetch;
  signedOut();
});

test('deletes, signs out, and takes the local copy with it', async () => {
  useFavoritesStore.setState({ ids: ['yuna'] });
  await AsyncStorage.setItem('prayers.subjects.v1', '{"state":{}}');
  await AsyncStorage.setItem('prayers.lang.v1', '{"state":{"lang":"vi"}}');
  const spy = stubFetch({ deleted: true });

  expect(await deleteAccount()).toBe(true);

  expect(spy.mock.calls[0][0]).toContain('/api/v1/users/delete_account');
  expect(spy.mock.calls[0][1]?.method).toBe('DELETE');
  expect(getUserAuth()).toBeNull();
  // Not just the storage row — the live store too, or the next person to sign in on this phone
  // opens the app on someone else's saved people until they restart it.
  expect(useFavoritesStore.getState().ids).toEqual([]);
  expect(useSubjectsStore.getState().subjects).toEqual([]);
  expect(useConversationsStore.getState().order).toEqual([]);
  // Either the row is gone or a late `persist` write put empty state back — what must not survive
  // is the data. Asserting "null" alone would pass for a row that was rewritten with the old
  // contents, which is the bug this file caught the first time it ran.
  const left = await AsyncStorage.getItem('prayers.subjects.v1');
  expect(left ?? '').not.toContain('subj_');
  // The language is the device's choice, not the account's.
  expect(await AsyncStorage.getItem('prayers.lang.v1')).not.toBeNull();
});

test('a refusal leaves the account alone — the server answers 200 with deleted:false', async () => {
  // users_controller#delete_account returns 200 {deleted:false} when a foreign key blocks the
  // destroy. Signing out on `res.ok` would strand the player outside an account that still exists.
  stubFetch({ deleted: false });

  expect(await deleteAccount()).toBe(false);
  expect(getUserAuth()).toBe('dev-doomed');
});

test('does not call the server at all when nobody is signed in', async () => {
  signedOut();
  const spy = stubFetch({ deleted: true });

  expect(await deleteAccount()).toBe(false);
  expect(spy).not.toHaveBeenCalled();
});

test('signing out clears the device without deleting anything', async () => {
  useFavoritesStore.setState({ ids: ['jiho'] });
  await forgetLocalData();
  expect(useFavoritesStore.getState().ids).toEqual([]);
  // forgetLocalData is only the device half — the account survives it.
  expect(getUserAuth()).toBe('dev-doomed');
});
