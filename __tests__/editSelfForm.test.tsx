/**
 * "Your details" keeps the name the user gave.
 *
 * The form used to blank every `self` name, to avoid presenting the "Myself" placeholder as if it
 * were one. That also blanked a real name — and the name is required, so a user who only wanted to
 * add a birth time could not save without typing their name again (seen on the simulator 23-09:
 * the consultation carried "123" while this box stood empty).
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { TextInput } from 'react-native';

let mockRoute: { name: string; params?: { subjectId: string } } = { name: 'AddSubject' };
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => mockRoute,
}));
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));

import { AddSubjectScreen } from '../src/features/subjects/screens/AddSubjectScreen';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';

let tree: ReactTestRenderer.ReactTestRenderer;
afterEach(() => { if (tree) act(() => tree.unmount()); });

const nameField = () => tree.root.findAllByType(TextInput)[0];

const renderSelf = async (displayName: string) => {
  useSubjectsStore.setState({
    self: { id: 'self', displayName, birthDate: '2002-11-12', gender: 'female', isUser: true },
  });
  mockRoute = { name: 'AddSubject', params: { subjectId: 'self' } };
  await act(async () => { tree = ReactTestRenderer.create(<AddSubjectScreen />); });
};

it('shows the name the user entered for themselves', async () => {
  await renderSelf('Linh');
  expect(nameField().props.value).toBe('Linh');
});

it('still hides the placeholder nobody chose', async () => {
  await renderSelf('Myself');
  expect(nameField().props.value).toBe('');
});
