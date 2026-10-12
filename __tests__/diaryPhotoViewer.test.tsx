/**
 * Spec 006 US4, 08-10: a page's photos open full screen. The Detail strip was 140pt tiles nothing
 * opened; Write's tiles too. Pinned: tap the second photo → the viewer on it ("2 / 2"); × closes.
 */
import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';

jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null);
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('../src/shared/audio/sfx', () => ({ sfx: { tap: jest.fn(), select: jest.fn(), back: jest.fn() } }));
jest.mock('../src/features/auth/api/headers', () => ({ apiHeaders: async () => null, authedFetch: async () => null }));
jest.mock('../src/features/myroom/diary/diaryApi', () => ({
  fetchReflection: jest.fn(async () => ({ ok: false, status: 0 })),
  photoSource: async (url: string) => ({ uri: url }),
  REFLECTION_POLL_MS: 3000,
  REFLECTION_WAIT_MS: 45000,
}));

import { DiaryDetailSheet } from '../src/features/myroom/diary/components/DiaryDetailSheet';
import { useArchiveStore } from '../src/features/archive/store/archiveStore';
import { useDiaryStore } from '../src/features/myroom/diary/diaryStore';
import { useLanguageStore } from '../src/shared/i18n';

const shown = (r: ReactTestRenderer.ReactTestRenderer, id: string) => r.root.findAll(n => n.props.testID === id).length > 0;
const press = async (r: ReactTestRenderer.ReactTestRenderer, id: string) =>
  act(async () => r.root.findAll(n => n.props.testID === id && typeof n.props.onPress === 'function')[0].props.onPress());

it('a Detail photo opens full screen on that photo, and × closes it', async () => {
  useLanguageStore.setState({ lang: 'en' } as never);
  useArchiveStore.setState({ memories: [], discoveries: [], dirty: [], deleted: [], answeredQuestions: [] });
  const m = useArchiveStore.getState().add({ category: 'diary', content: 'Beach day', details: { mood: 'great', counselor: 'dosa', date: '2026-10-08' } });
  useDiaryStore.setState({
    reflections: {}, photoDeletes: [],
    photos: { [m.id]: [
      { id: 'p1', url: '/a.jpg', width: 1, height: 1, position: 0, uploaded: true },
      { id: 'p2', url: '/b.jpg', width: 1, height: 1, position: 1, uploaded: true },
    ] },
  });
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(
      <DiaryDetailSheet memoryId={m.id} onEdit={() => {}} onTalk={() => {}} onDeleted={() => {}} onClose={() => {}} />,
    );
  });
  expect(shown(r, 'diary-photo-viewer')).toBe(false);
  await press(r, 'diary-detail-photo-1');
  expect(shown(r, 'diary-photo-viewer')).toBe(true);
  const list = r.root.findAll(n => n.props.initialScrollIndex !== undefined)[0];
  expect(list.props.initialScrollIndex).toBe(1);
  expect(r.root.findAll(n => n.props.testID === 'diary-viewer-count' && typeof n.props.children === 'string')[0].props.children).toBe('2 / 2');
  await press(r, 'diary-viewer-close');
  expect(shown(r, 'diary-photo-viewer')).toBe(false);
  act(() => r.unmount());
});
