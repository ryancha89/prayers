/**
 * The player's character belongs to the ACCOUNT (27-10), reconciled like the language: the account
 * wins when it has a pick; a pick already finished on this device is pushed when it has none.
 * QA 28-10: nothing is written to a server that has not shown it knows the fields, and a pick made
 * while the GET is in flight wins.
 * QA 29-10: a pick the account never got survives a relaunch and is pushed by the next sync.
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

const mockFetch = jest.fn();
const mockSave = jest.fn();
jest.mock('../src/features/counseling/api/prayersServer', () => ({
  fetchAccountCharacter: (...a: unknown[]) => mockFetch(...a),
  saveAccountCharacter: (...a: unknown[]) => mockSave(...a),
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { resetCharacterSyncForTests, saveCharacterToAccount, syncAccountCharacter } from '../src/features/character/characterSync';

const none = { playerCharacter: null, playerHair: null, playerOutfit: null, creatorSeen: false };

beforeEach(() => {
  resetCharacterSyncForTests();
  mockFetch.mockReset();
  mockSave.mockReset().mockResolvedValue(true);
  useSubjectsStore.setState({ playerCharacter: undefined, playerHair: '', playerOutfit: '', creatorSeen: false, characterUnpushed: false });
});

test('the account wins when it has a pick — a reinstall does not ask again', async () => {
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#7A4B2C', playerOutfit: '#2E3A5C', creatorSeen: true });
  await syncAccountCharacter();
  const s = useSubjectsStore.getState();
  expect([s.playerCharacter, s.playerHair, s.playerOutfit, s.creatorSeen]).toEqual(['xb_f01', '#7A4B2C', '#2E3A5C', true]);
  expect(mockSave).not.toHaveBeenCalled();
});

test('an account with none adopts the pick finished on this device (the launch sync)', async () => {
  useSubjectsStore.setState({ playerCharacter: 'xb_m01', playerHair: '#222222', playerOutfit: '#7A2E3B', creatorSeen: true });
  mockFetch.mockResolvedValue(none);
  await syncAccountCharacter();
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_m01', playerHair: '#222222', playerOutfit: '#7A2E3B', creatorSeen: true });
});

test('a server without the fields (or offline) gets nothing written — Start included', async () => {
  useSubjectsStore.setState({ playerCharacter: 'xb_m01', creatorSeen: true });
  mockFetch.mockResolvedValue(null);
  await syncAccountCharacter();
  saveCharacterToAccount();
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_m01');
  expect(mockSave).not.toHaveBeenCalled();
});

test('Start saves once the server is known to keep the fields', async () => {
  mockFetch.mockResolvedValue(none);
  await syncAccountCharacter();
  useSubjectsStore.setState({ playerCharacter: 'xb_f01', playerHair: '', creatorSeen: true });
  saveCharacterToAccount();
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_f01', playerHair: '', playerOutfit: '', creatorSeen: true });
});

test('a pick made while the GET is in flight wins over the account\'s older one', async () => {
  let answer: (v: unknown) => void = () => {};
  mockFetch.mockReturnValue(new Promise(r => { answer = r; }));
  const sync = syncAccountCharacter();
  await Promise.resolve();
  useSubjectsStore.setState({ playerCharacter: 'xb_m01', playerHair: '', creatorSeen: true });
  saveCharacterToAccount();
  answer({ playerCharacter: 'xb_f01', playerHair: '#7A4B2C', creatorSeen: true });
  await sync;
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_m01');
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_m01', playerHair: '', playerOutfit: '', creatorSeen: true });
});

test('the outfit (29-10): a server with the hair but not the outfit keeps this device\'s colour', async () => {
  useSubjectsStore.setState({ playerCharacter: 'xb_f01', playerHair: '', playerOutfit: '#8FA48A', creatorSeen: true });
  // the field missing from the answer reads as null — no opinion, not "the artist's own"
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#7A4B2C', playerOutfit: null, creatorSeen: true });
  await syncAccountCharacter();
  expect(useSubjectsStore.getState().playerOutfit).toBe('#8FA48A');
  // …while an account that SAID "" (the artist's own) wins like any other account value
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#7A4B2C', playerOutfit: '', creatorSeen: true });
  await syncAccountCharacter();
  expect(useSubjectsStore.getState().playerOutfit).toBe('');
});

/** A relaunch: the module's counters start over, the persisted store does not. */
const relaunch = () => resetCharacterSyncForTests();

test('a pick saved after an offline launch GET survives the next launch and is pushed then (29-10)', async () => {
  // launch 1: the account has silver hair; the GET fails (offline / 401)
  useSubjectsStore.setState({ playerCharacter: 'xb_f01', playerHair: '#D8D8E6', playerOutfit: '', creatorSeen: true });
  mockFetch.mockResolvedValue(null);
  await syncAccountCharacter();
  // the player changes the hair to rose in the creator and saves
  useSubjectsStore.setState({ playerHair: '#C46A86', playerOutfit: '#2E3A5C' });
  saveCharacterToAccount();
  expect(mockSave).not.toHaveBeenCalled();
  expect(useSubjectsStore.getState().characterUnpushed).toBe(true);
  // …and it is on disk, which is what a relaunch reads back
  await new Promise(r => setTimeout(r, 0));
  expect(await AsyncStorage.getItem('prayers.subjects.v1')).toContain('"characterUnpushed":true');
  // launch 2, online; the account still has the old colour
  relaunch();
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#D8D8E6', playerOutfit: '', creatorSeen: true });
  await syncAccountCharacter();
  const s = useSubjectsStore.getState();
  expect([s.playerHair, s.playerOutfit]).toEqual(['#C46A86', '#2E3A5C']);
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_f01', playerHair: '#C46A86', playerOutfit: '#2E3A5C', creatorSeen: true });
  expect(s.characterUnpushed).toBe(false);
  // launch 3: the account has it now, and is the one that wins again
  relaunch();
  mockSave.mockClear();
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#C46A86', playerOutfit: '#2E3A5C', creatorSeen: true });
  await syncAccountCharacter();
  expect(mockSave).not.toHaveBeenCalled();
});

test('a refused push keeps the pick marked, and the next launch pushes it again (29-10)', async () => {
  mockFetch.mockResolvedValue(none);
  await syncAccountCharacter();
  useSubjectsStore.setState({ playerCharacter: 'xb_m01', playerHair: '#222222', creatorSeen: true });
  mockSave.mockResolvedValueOnce(false);
  saveCharacterToAccount();
  await Promise.resolve();
  await Promise.resolve();
  expect(useSubjectsStore.getState().characterUnpushed).toBe(true);

  relaunch();
  mockSave.mockClear();
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#D8D8E6', playerOutfit: '', creatorSeen: true });
  await syncAccountCharacter();
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_m01');
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_m01', playerHair: '#222222', playerOutfit: '', creatorSeen: true });
  expect(useSubjectsStore.getState().characterUnpushed).toBe(false);
});

test('a push answered after a newer pick does not settle the newer one (29-10)', async () => {
  mockFetch.mockResolvedValue(none);
  await syncAccountCharacter();
  let answer: (ok: boolean) => void = () => {};
  mockSave.mockReturnValueOnce(new Promise<boolean>(r => { answer = r; }));
  useSubjectsStore.setState({ playerCharacter: 'xb_f01', playerHair: '#111111', creatorSeen: true });
  saveCharacterToAccount();
  // a second pick while the first is on the wire; its own push fails
  mockSave.mockResolvedValueOnce(false);
  useSubjectsStore.setState({ playerHair: '#C46A86' });
  saveCharacterToAccount();
  answer(true);
  await new Promise(r => setTimeout(r, 0));
  expect(useSubjectsStore.getState().characterUnpushed).toBe(true);
});
