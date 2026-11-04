/**
 * What a sign-out (forgetLocalData) keeps for the device, and what it must stop (29-10). Each of
 * these went through forgetLocalData and came out wrong:
 *  · the language picked offline was never pushed: forgetLocalData cleared `langUnpushed`, and every
 *    way to a sign-in passes through it, so the sign-in sync pulled the account's old language back,
 *  · the reminder's time and on/off were swept from disk, though they belong to the device,
 *  · the journey kept narrating the last person's name over Login (and its voice files were deleted
 *    from under it),
 *  · a coin payment still being confirmed was retried with the NEXT account's token.
 */
jest.mock('../src/shared/config/api', () => ({ apiBase: () => 'http://localhost:4000' }));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => { store.set(k, v); },
      removeItem: async (k: string) => { store.delete(k); },
      getAllKeys: async () => [...store.keys()],
    },
  };
});
const mockFetchLang = jest.fn();
const mockSaveLang = jest.fn();
jest.mock('../src/features/counseling/api/prayersServer', () => ({
  ...jest.requireActual('../src/features/counseling/api/prayersServer'),
  fetchAccountLanguage: (...a: unknown[]) => mockFetchLang(...a),
  saveAccountLanguage: (...a: unknown[]) => mockSaveLang(...a),
}));
// Records whether the journey was still playing when its cached narration was deleted.
const mockPlayingWhenVoicesDeleted: (string | null)[] = [];
jest.mock('../src/features/journey/api/voiceCache', () => ({
  ...jest.requireActual('../src/features/journey/api/voiceCache'),
  forgetJourneyVoices: jest.fn(async () => {
    const { useJourneyPlayer: player } = require('../src/features/journey/player/journeyPlayer');
    mockPlayingWhenVoicesDeleted.push(player.getState().journeyId);
  }),
}));
jest.mock('../src/features/auth/api/headers', () => ({ authedFetch: jest.fn(), apiHeaders: jest.fn() }));
jest.mock('../src/features/tickets/providers/purchase', () => ({
  storeAvailable: jest.fn(() => true),
  buyProduct: jest.fn(),
  finishPurchase: jest.fn(async () => {}),
  productPrice: jest.fn(async () => null),
  storePrices: jest.fn(async () => ({})),
  onStorePurchase: jest.fn(() => () => {}),
  unfinishedPurchases: jest.fn(async () => []),
}));

import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { forgetLocalData } from '../src/features/auth/api/deleteAccount';
import { useLanguageStore } from '../src/shared/i18n';
import { setLanguageEverywhere, syncAccountLanguage } from '../src/features/settings/languageSync';
import { useReminder } from '../src/features/notifications/reminder';
import { useJourneyPlayer } from '../src/features/journey/player/journeyPlayer';
import { authedFetch } from '../src/features/auth/api/headers';
import { buyProduct, finishPurchase } from '../src/features/tickets/providers/purchase';
import { buyCoins, CONFIRM_RETRY_MS, resetCoinConfirmsForTests } from '../src/features/coins/api/coinsApi';
import { useCoins } from '../src/features/coins/store/coinStore';
import { buyJourneyPass, resetPassConfirmsForTests, usePassPurchases } from '../src/features/journey/api/passPurchase';

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
/** Lets `persist` finish its AsyncStorage write. */
const written = () => new Promise(r => setTimeout(r, 0));

describe('language: the device choice crosses a sign-out', () => {
  it('a language picked offline is pushed to whoever signs in next', async () => {
    useLanguageStore.getState().setLang('ko');
    mockSaveLang.mockResolvedValue(false); // offline
    setLanguageEverywhere('vi');
    await settle();
    expect(useLanguageStore.getState().langUnpushed).toBe(true);

    await forgetLocalData(); // MyPage → sign out

    mockFetchLang.mockResolvedValue('ko'); // the account still has the old one
    mockSaveLang.mockReset().mockResolvedValue(true);
    await syncAccountLanguage(); // the sign-in
    expect(useLanguageStore.getState().lang).toBe('vi');
    expect(mockSaveLang).toHaveBeenCalledWith('vi');
    expect(useLanguageStore.getState().langUnpushed).toBe(false);
  });

  it('the unpushed mark is still on disk after the sign-out (a relaunch in between keeps it)', async () => {
    mockSaveLang.mockResolvedValue(false);
    setLanguageEverywhere('ja');
    await settle();
    await forgetLocalData();
    await written();
    const row = await AsyncStorage.getItem('prayers.lang.v1');
    expect(JSON.parse(row!).state).toMatchObject({ lang: 'ja', langUnpushed: true });
    // Relaunch: the live store starts from its defaults (a setState writes them, so the row is put
    // back as the sign-out left it) and reads the row back.
    useLanguageStore.setState({ lang: 'ko', langUnpushed: false }, false);
    await AsyncStorage.setItem('prayers.lang.v1', row!);
    await useLanguageStore.persist.rehydrate();
    expect(useLanguageStore.getState()).toMatchObject({ lang: 'ja', langUnpushed: true });
  });
});

describe('reminder: the settings are the device’s', () => {
  it('survive a sign-out and a relaunch; only the check-in day goes', async () => {
    useReminder.getState().set({ enabled: true, hour: 21, minute: 30, checkedOn: '2026-10-29' });
    await written();

    await forgetLocalData();
    await written();

    const row = await AsyncStorage.getItem('prayers.reminder.v1');
    expect(JSON.parse(row!).state).toMatchObject({ enabled: true, hour: 21, minute: 30, checkedOn: null });
    // Relaunch: the live store starts from its defaults (a setState writes them, so the row is put
    // back as the sign-out left it) and reads the row back.
    useReminder.setState({ enabled: false, hour: 9, minute: 0, checkedOn: null }, false);
    await AsyncStorage.setItem('prayers.reminder.v1', row!);
    await useReminder.persist.rehydrate();
    expect(useReminder.getState()).toMatchObject({ enabled: true, hour: 21, minute: 30, checkedOn: null });
  });

  it('the account’s rows still go', async () => {
    await AsyncStorage.setItem('prayers.subjects.v1', '{"state":{"subjects":[{"id":"subj_mom"}]}}');
    await forgetLocalData();
    await written();
    expect((await AsyncStorage.getItem('prayers.subjects.v1')) ?? '').not.toContain('subj_mom');
  });
});

describe('journey: the ride stops on sign-out', () => {
  it('stops the player before its narration files are deleted', async () => {
    mockPlayingWhenVoicesDeleted.length = 0;
    useJourneyPlayer.setState({ journeyId: 'newyear-2027', counselorId: 'yuna', status: 'playing' });

    await forgetLocalData();

    expect(useJourneyPlayer.getState()).toMatchObject({ journeyId: null, status: 'idle', content: null });
    expect(mockPlayingWhenVoicesDeleted).toEqual([null]);
  });
});

describe('store payments: nothing is confirmed under the next account', () => {
  const fetchMock = authedFetch as jest.Mock;
  const reply = (status: number, body: unknown) => ({ status, ok: status >= 200 && status < 300, json: async () => body });
  const coinPurchase = { platform: 'ios', productId: 'prayer_coin_1000', purchaseToken: 'jws', transactionId: 't-a', raw: {} };
  const passPurchase = { platform: 'ios', productId: 'prayers_journey_2027', purchaseToken: 'jws', transactionId: 't-p', raw: {} };
  let foregroundRemoved = 0;

  beforeEach(() => {
    jest.useFakeTimers();
    fetchMock.mockReset();
    (finishPurchase as jest.Mock).mockClear();
    foregroundRemoved = 0;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((() => ({ remove: () => { foregroundRemoved += 1; } })) as never);
    resetCoinConfirmsForTests();
    resetPassConfirmsForTests();
  });
  afterEach(() => {
    resetCoinConfirmsForTests();
    resetPassConfirmsForTests();
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('held coin and pass confirms stop: no timer, no foreground hook, no awaiting', async () => {
    fetchMock.mockResolvedValue(reply(503, null));
    (buyProduct as jest.Mock).mockResolvedValueOnce(coinPurchase).mockResolvedValueOnce(passPurchase);
    expect(await buyCoins('prayer_coin_1000', { dev: false })).toEqual({ ok: false, reason: 'awaiting' });
    expect(await buyJourneyPass('newyear-2027', 'prayers_journey_2027', false)).toEqual({ ok: false, reason: 'awaiting' });
    expect(useCoins.getState().awaiting).toEqual(['prayer_coin_1000']);
    expect(usePassPurchases.getState().awaiting).toEqual(['prayers_journey_2027']);
    const posts = fetchMock.mock.calls.length;

    await forgetLocalData();

    expect(useCoins.getState().awaiting).toEqual([]);
    expect(usePassPurchases.getState().awaiting).toEqual([]);
    expect(foregroundRemoved).toBe(2);
    // B signs in; the backoff would have fired in here — with B's token.
    fetchMock.mockResolvedValue(reply(200, { success: true, coins_added: 1100, coin_balance: 1100, owned: true }));
    jest.advanceTimersByTime(CONFIRM_RETRY_MS.reduce((a, b) => a + b, 0));
    await settle();
    expect(fetchMock.mock.calls.length).toBe(posts);
    // Left unfinished: the store offers them again at the next launch's recovery.
    expect(finishPurchase).not.toHaveBeenCalled();
  });

  it('a confirm in flight at sign-out does not hold or write the wallet afterwards', async () => {
    let answer!: (v: unknown) => void;
    fetchMock.mockImplementationOnce(() => new Promise(r => { answer = r; }));
    (buyProduct as jest.Mock).mockResolvedValueOnce(coinPurchase);
    useCoins.setState({ balance: 50 });
    const buying = buyCoins('prayer_coin_1000', { dev: false });
    await settle();

    await forgetLocalData();
    useCoins.setState({ balance: 7 }); // B's wallet
    answer(reply(503, null));
    expect(await buying).toEqual({ ok: false, reason: 'awaiting' });
    expect(useCoins.getState().awaiting).toEqual([]);
    jest.advanceTimersByTime(CONFIRM_RETRY_MS[0]);
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(useCoins.getState().balance).toBe(7);
  });
});

describe('coins: the balance is the account’s', () => {
  it('is cleared on sign-out, so the next account never sees the last one’s wallet', async () => {
    useCoins.setState({ balance: 420 });
    await forgetLocalData();
    expect(useCoins.getState().balance).toBeNull();
  });
});
