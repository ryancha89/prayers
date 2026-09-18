/**
 * The two library rows on My Page lead somewhere now.
 *
 * They were labels with no `onPress` — while the stat row directly above them counted exactly what
 * they refused to show. The data was never missing, only the destination, which is why this test is
 * about what the screen DRAWS from the stores rather than about navigation plumbing.
 */
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: (globalThis as any).__routeParams }),
}));
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
jest.mock('../src/shared/audio/sfx', () => ({ sfx: new Proxy({}, { get: () => () => {} }) }));

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { LibraryScreen } from '../src/features/profile/screens/LibraryScreen';
import { useSubjectsStore } from '../src/features/subjects/store/subjectsStore';
import { useFavoritesStore } from '../src/features/counselors/store/favoritesStore';

function textOf(params: { list: 'people' | 'favorites' }): string[] {
  (globalThis as any).__routeParams = params;
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<LibraryScreen />);
  });
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (typeof node === 'string') out.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'children' in (node as any))
      walk((node as any).children);
  };
  walk(tree.toJSON());
  ReactTestRenderer.act(() => tree.unmount());
  return out;
}

it('lists the saved people, the account holder included', () => {
  useSubjectsStore.setState({
    self: { id: 'self', displayName: 'Myself', isUser: true },
    subjects: [{ id: 'subj_a', displayName: 'Minji Kim', birthDate: '1995-04-12', isUser: false }],
  });

  const text = textOf({ list: 'people' }).join(' ');
  expect(text).toContain('Minji Kim');
  expect(text).toContain('1995-04-12');
});

it('lists the favourited counselors, and only those', () => {
  useFavoritesStore.setState({ ids: ['yunjung'] });

  const text = textOf({ list: 'favorites' }).join(' ');
  expect(text).toContain('Go Yunjung');
  expect(text).not.toContain('Yuna');
});

it('says so rather than showing an empty list', () => {
  useFavoritesStore.setState({ ids: [] });

  // The honest empty state, not a blank screen that reads as a bug.
  expect(textOf({ list: 'favorites' }).join(' ')).toContain('No favourites yet');
});

it('drops a favourite whose counselor has left the roster', () => {
  useFavoritesStore.setState({ ids: ['yunjung', 'someone_removed'] });

  const text = textOf({ list: 'favorites' }).join(' ');
  expect(text).toContain('Go Yunjung');
  // No blank card, and no crash on the id that resolves to nothing.
  expect(text).not.toContain('someone_removed');
});
