/**
 * The character picker after ProfileSetup (26-10): preselected from the profile's gender, says so
 * when the picked body is not in Unity yet, and stores the pick that playerGender() then sends.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

let mockRoute = { name: 'CharacterSetup' };
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: mockGoBack }),
  useRoute: () => mockRoute,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));

import { CharacterSelectScreen } from '../src/features/character/screens/CharacterSelectScreen';
import { PrimaryButton } from '../src/shared/components/PrimaryButton';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { playerCharacter, playerGender } from '../src/features/counseling/bridge/playerGender';

let tree: ReactTestRenderer.ReactTestRenderer;
afterEach(() => { if (tree) act(() => tree.unmount()); mockGoBack.mockClear(); });

const render = async (gender?: 'male' | 'female', route = 'CharacterSetup') => {
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', gender, isUser: true },
    playerCharacter: undefined,
  });
  mockRoute = { name: route };
  await act(async () => { tree = ReactTestRenderer.create(<CharacterSelectScreen />); });
};

const card = (id: string) => tree.root.find(n => n.props.testID === `character-${id}` && !!n.props.onPress);
const cards = () => tree.root.findAll(n => typeof n.props.testID === 'string' && /^character-xb_/.test(n.props.testID) && !!n.props.onPress);
const soonNote = () => tree.root.findAll(n => n.props.testID === 'character-soon-note');
const button = () => tree.root.findByType(PrimaryButton);
const ids = () => cards().map(c => c.props.testID.replace('character-', ''));

it('a man is offered the men, the first one picked', async () => {
  await render('male');
  expect(ids()).toEqual(['xb_m01']);
  expect(card('xb_m01').props.accessibilityState).toEqual({ selected: true });
  expect(button().props.disabled).toBe(false);
});

it('a woman is offered the women, and the one she taps is what Unity gets', async () => {
  await render('female');
  expect(ids()).toEqual(['xb_f01']);
  expect(card('xb_f01').props.accessibilityState).toEqual({ selected: true });
  await act(async () => card('xb_f01').props.onPress());
  await act(async () => button().props.onPress());
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_f01');
  expect(playerCharacter()).toBe('xb_f01');
  expect(playerGender()).toBe('female');
  expect(soonNote().length).toBe(0);
  expect(mockGoBack).not.toHaveBeenCalled(); // first run: the navigator drops the screen itself
});

it('a profile with no gender yet sees everyone and must pick', async () => {
  await render(undefined);
  expect(ids()).toEqual(['xb_f01', 'xb_m01']);
  expect(button().props.disabled).toBe(true);
  await act(async () => card('xb_m01').props.onPress());
  await act(async () => button().props.onPress());
  expect(playerGender()).toBe('male');
});

it('changing the profile gender moves the stored character to that gender', () => {
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', gender: 'female', isUser: true },
    playerCharacter: 'xb_f01',
  });
  useSubjectsStore.getState().updateSubject('self', { gender: 'male' });
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_m01');
  expect(playerCharacter()).toBe('xb_m01');
});

it('the FIRST gender (ProfileSetup "Get started") leaves the character unset, so its screen follows', () => {
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Myself', isUser: true },
    playerCharacter: undefined,
  });
  useSubjectsStore.getState().updateSubject('self', { displayName: 'Linh', birthDate: '2002-11-12', gender: 'female' });
  expect(useSubjectsStore.getState().playerCharacter).toBeUndefined();
});

it('a pick from before ids (bare "female") or of the wrong gender falls to the default', () => {
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Linh', birthDate: '2002-11-12', gender: 'female', isUser: true },
    playerCharacter: 'female',
  });
  expect(playerCharacter()).toBe('xb_f01');
  useSubjectsStore.setState({ playerCharacter: 'xb_m01' });
  expect(playerCharacter()).toBe('xb_f01');
});

it('from My Info it saves and goes back', async () => {
  await render('female', 'CharacterSelect');
  await act(async () => card('xb_f01').props.onPress());
  await act(async () => button().props.onPress());
  expect(useSubjectsStore.getState().playerCharacter).toBe('xb_f01');
  expect(mockGoBack).toHaveBeenCalledTimes(1);
});
