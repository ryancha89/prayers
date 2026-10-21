import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { CounselorDetailScreen } from '../src/features/counselors/screens/CounselorDetailScreen';
import { PrimaryButton } from '../src/shared/components/PrimaryButton';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useCounselingStore } from '../src/features/counseling/store/counselingStore';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
  useRoute: () => ({ params: { counselorId: 'luna', focusMemoryId: 'diary-focus' } }),
  useFocusEffect: (callback: () => void) => require('react').useEffect(callback, [callback]),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn() } }));
jest.mock('../src/features/counseling/api/prayersServer', () => ({ checkConsultationReadiness: async () => 'ok' }));
jest.mock('../src/features/counselors/components/CounselorHero', () => ({ CounselorHero: () => null }));
jest.mock('../src/features/counselors/components/CounselorPreviewCarousel', () => ({ CounselorPreviewCarousel: () => null }));

it('Talk opens the room directly for self, clearing the previous subject and preserving diary focus', async () => {
  useCounselingStore.getState().setSubject({ id: 'old-friend', displayName: 'Friend', isUser: false });
  let tree!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => { tree = ReactTestRenderer.create(<CounselorDetailScreen />); });
  await act(async () => { tree.root.findByType(PrimaryButton).props.onPress(); });
  expect(mockNavigate).toHaveBeenCalledWith('UnityEntry', { counselorId: 'luna', subjectId: 'self' });
  expect(mockNavigate).not.toHaveBeenCalledWith('CounselingSubject');
  expect(useCounselingStore.getState().subject).toEqual(useSubjectsStore.getState().self);
  expect(useCounselingStore.getState().focusMemoryId).toBe('diary-focus');
  expect(useCounselingStore.getState().topic).toBeTruthy();
  await act(async () => { tree.unmount(); });
});
