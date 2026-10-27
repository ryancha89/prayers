/**
 * The player's character belongs to the ACCOUNT (27-10), reconciled like the language: the account
 * wins when it has a pick; a pick already finished on this device is pushed when it has none.
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
import { saveCharacterToAccount, syncAccountCharacter } from '../src/features/character/characterSync';

beforeEach(() => {
  mockFetch.mockReset();
  mockSave.mockReset().mockResolvedValue(true);
  useSubjectsStore.setState({ playerCharacter: undefined, playerHair: '', creatorSeen: false });
});

test('the account wins when it has a pick — a reinstall does not ask again', async () => {
  mockFetch.mockResolvedValue({ playerCharacter: 'xb_f01', playerHair: '#7A4B2C', creatorSeen: true });
  await syncAccountCharacter();
  const s = useSubjectsStore.getState();
  expect([s.playerCharacter, s.playerHair, s.creatorSeen]).toEqual(['xb_f01', '#7A4B2C', true]);
  expect(mockSave).not.toHaveBeenCalled();
});

test('an account with none adopts the pick finished on this device', async () => {
  useSubjectsStore.setState({ playerCharacter: 'xb_m01', playerHair: '#222222', creatorSeen: true });
  mockFetch.mockResolvedValue({ playerCharacter: null, playerHair: null, creatorSeen: false });
  await syncAccountCharacter();
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_m01', playerHair: '#222222', creatorSeen: true });
});

test('offline / signed out changes nothing and writes nothing', async () => {
  useSubjectsStore.setState({ playerCharacter: 'xb_m01', creatorSeen: true });
  mockFetch.mockResolvedValue(null);
  await syncAccountCharacter();
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_m01');
  expect(mockSave).not.toHaveBeenCalled();
});

test('Start in the creator saves the store as it now is', () => {
  useSubjectsStore.setState({ playerCharacter: 'xb_f01', playerHair: '', creatorSeen: true });
  saveCharacterToAccount();
  expect(mockSave).toHaveBeenCalledWith({ playerCharacter: 'xb_f01', playerHair: '', creatorSeen: true });
});
