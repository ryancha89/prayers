/**
 * The player's character belongs to the ACCOUNT (27-10), reconciled like the language: the account
 * wins when it has a pick; a pick already finished on this device is pushed when it has none.
 * QA 28-10: nothing is written to a server that has not shown it knows the fields, and a pick made
 * while the GET is in flight wins.
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

import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { resetCharacterSyncForTests, saveCharacterToAccount, syncAccountCharacter } from '../src/features/character/characterSync';

const none = { playerCharacter: null, playerHair: null, playerOutfit: null, creatorSeen: false };

beforeEach(() => {
  resetCharacterSyncForTests();
  mockFetch.mockReset();
  mockSave.mockReset().mockResolvedValue(true);
  useSubjectsStore.setState({ playerCharacter: undefined, playerHair: '', playerOutfit: '', creatorSeen: false });
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
