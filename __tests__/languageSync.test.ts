/**
 * The language belongs to the ACCOUNT (16-09). What is pinned here is the reconciliation rule, and
 * it is a rule with two halves that are easy to get backwards:
 *
 *   - the account wins when it HAS an answer — it is the copy that survives this install;
 *   - the device wins when it does not — a first sign-in adopts what the player was already using
 *     rather than resetting them to a default they never picked.
 *
 * Getting the second half wrong is the silent one: nobody reports "my language was correct".
 */
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
    },
  };
});

// `mock`-prefixed on purpose: jest hoists the factory above these declarations and rejects any
// other out-of-scope name.
const mockFetch = jest.fn();
const mockSave = jest.fn();
jest.mock('../src/features/counseling/api/prayersServer', () => ({
  fetchAccountLanguage: (...a: unknown[]) => mockFetch(...a),
  saveAccountLanguage: (...a: unknown[]) => mockSave(...a),
}));

import { useLanguageStore } from '../src/shared/i18n';
import { syncAccountLanguage, setLanguageEverywhere } from '../src/features/settings/languageSync';

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset().mockResolvedValue(true);
  useLanguageStore.getState().setLang('en');
});

describe('language sync', () => {
  it('takes the account language when it has one', async () => {
    mockFetch.mockResolvedValue('ja');
    await syncAccountLanguage();
    expect(useLanguageStore.getState().lang).toBe('ja');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('adopts the device language when the account has none', async () => {
    mockFetch.mockResolvedValue(null);
    await syncAccountLanguage();
    expect(useLanguageStore.getState().lang).toBe('en');
    expect(mockSave).toHaveBeenCalledWith('en');
  });

  it('leaves the app alone when the account already agrees', async () => {
    mockFetch.mockResolvedValue('en');
    await syncAccountLanguage();
    expect(useLanguageStore.getState().lang).toBe('en');
    expect(mockSave).not.toHaveBeenCalled();
  });

  it('applies a change locally before the network answers', () => {
    // The screen has to turn over on the tap. `saveAccountLanguage` is left unresolved here on
    // purpose: if the local write waited on it, this assertion would fail.
    mockSave.mockReturnValue(new Promise(() => {}));
    setLanguageEverywhere('vi');
    expect(useLanguageStore.getState().lang).toBe('vi');
    expect(mockSave).toHaveBeenCalledWith('vi');
  });

  it('keeps the player choice when the account write fails', async () => {
    mockSave.mockResolvedValue(false);
    setLanguageEverywhere('ko');
    await Promise.resolve();
    expect(useLanguageStore.getState().lang).toBe('ko');
  });
});

/**
 * 29-10: a change made offline was undone on the next sign-in — the write failed, and the next
 * sync applied the account's OLD language over it. Like the character (`characterUnpushed`), a
 * persisted mark now says "push, don't pull" until the account has taken the device's choice.
 */
describe('a choice the account has not taken yet', () => {
  beforeEach(() => useLanguageStore.setState({ langUnpushed: false }));
  const settle = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('is pushed at the next sync instead of being overwritten', async () => {
    mockSave.mockResolvedValueOnce(false);
    setLanguageEverywhere('vi');
    await settle();
    expect(useLanguageStore.getState().langUnpushed).toBe(true);

    mockFetch.mockResolvedValue('ja');
    mockSave.mockResolvedValue(true);
    await syncAccountLanguage();
    expect(useLanguageStore.getState().lang).toBe('vi');
    expect(mockSave).toHaveBeenLastCalledWith('vi');
    expect(useLanguageStore.getState().langUnpushed).toBe(false);

    // Taken: from now on the account wins again.
    mockFetch.mockResolvedValue('ja');
    await syncAccountLanguage();
    expect(useLanguageStore.getState().lang).toBe('ja');
  });

  it('stays marked while the push keeps failing', async () => {
    mockSave.mockResolvedValue(false);
    setLanguageEverywhere('vi');
    await settle();
    mockFetch.mockResolvedValue('ja');
    await syncAccountLanguage();
    expect(useLanguageStore.getState().lang).toBe('vi');
    expect(useLanguageStore.getState().langUnpushed).toBe(true);
  });

  it('a write that lands clears the mark', async () => {
    setLanguageEverywhere('vi');
    await settle();
    expect(useLanguageStore.getState().langUnpushed).toBe(false);
  });

  it('survives a relaunch (persisted with the language)', async () => {
    mockSave.mockResolvedValue(false);
    setLanguageEverywhere('vi');
    await settle();
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const row = await AsyncStorage.getItem('prayers.lang.v1');
    expect(JSON.parse(row).state).toMatchObject({ lang: 'vi', langUnpushed: true });
    // …and read back on the next launch.
    useLanguageStore.setState({ langUnpushed: false }, false);
    await AsyncStorage.setItem('prayers.lang.v1', row);
    await useLanguageStore.persist.rehydrate();
    expect(useLanguageStore.getState().lang).toBe('vi');
    expect(useLanguageStore.getState().langUnpushed).toBe(true);
  });
});
