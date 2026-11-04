/**
 * Which body the player walks in Unity follows the profile's gender (Unity PlayerBody): every scene
 * INIT carries `playerGender`, and an unknown one is left off so Unity keeps its default (Theo).
 */
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { NativeUnityBridge } from '../src/features/counseling/bridge/NativeUnityBridge';
import { playerGender, playerHair, playerOutfit } from '../src/features/counseling/bridge/playerGender';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';

const self = (gender?: 'male' | 'female') =>
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'me', isUser: true, birthDate: '1990-01-01', gender },
    playerCharacter: undefined,
  });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('reads the account holder’s gender', () => {
  self('female');
  expect(playerGender()).toBe('female');
  self('male');
  expect(playerGender()).toBe('male');
});

it('the profile gender decides; a stored pick only stands in while there is none', () => {
  self('male');
  useSubjectsStore.getState().setPlayerCharacter('xb_f01');
  expect(playerGender()).toBe('male');
  self(undefined);
  useSubjectsStore.getState().setPlayerCharacter('xb_f01');
  expect(playerGender()).toBe('female');
});

it('leaves the field off the wire when the profile has none', () => {
  self(undefined);
  const posted: string[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_o, _m, json) => posted.push(json) });
  bridge.openWorld({ lang: 'ko', spawn: null, playerGender: playerGender() });
  const init = posted.map(j => JSON.parse(j)).find(m => m.type === 'WORLD_INIT');
  expect(init.payload).not.toHaveProperty('playerGender');
});

it('sends it on the scene INITs', () => {
  self('female');
  const posted: string[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_o, _m, json) => posted.push(json) });
  bridge.openCafe({ lang: 'ko', playerGender: playerGender() });
  const init = posted.map(j => JSON.parse(j)).find(m => m.type === 'CAFE_INIT');
  expect(init.payload.playerGender).toBe('female');
});

it('sends the outfit colour beside the hair on the scene INITs, and leaves the artist\'s own off the wire', () => {
  self('female');
  useSubjectsStore.setState({ playerHair: '#C46A86', playerOutfit: '#2E3A5C' });
  const posted: string[] = [];
  const bridge = new NativeUnityBridge();
  bridge.registerView({ postMessage: (_o, _m, json) => posted.push(json) });
  bridge.openCafe({ lang: 'ko', playerGender: playerGender(), playerHair: playerHair(), playerOutfit: playerOutfit() });
  bridge.openWorld({ lang: 'ko', spawn: null, playerHair: playerHair(), playerOutfit: playerOutfit() });
  const sent = posted.map(j => JSON.parse(j));
  expect(sent.find(m => m.type === 'CAFE_INIT').payload).toMatchObject({ playerHair: '#C46A86', playerOutfit: '#2E3A5C' });
  expect(sent.find(m => m.type === 'WORLD_INIT').payload.playerOutfit).toBe('#2E3A5C');

  useSubjectsStore.setState({ playerOutfit: '' });
  posted.length = 0;
  bridge.openMyRoom({ lang: 'ko', playerOutfit: playerOutfit() });
  expect(posted.map(j => JSON.parse(j)).find(m => m.type === 'MYROOM_INIT').payload).not.toHaveProperty('playerOutfit');
  useSubjectsStore.setState({ playerHair: '', playerOutfit: '' });
});
