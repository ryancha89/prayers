import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface FavoritesState {
  ids: string[];
  isFavorite: (id: string) => boolean;
  toggle: (id: string) => void;
}

export const useFavoritesStore = create<FavoritesState>()(
  persist(
    (set, get) => ({
      ids: [],
      isFavorite: id => get().ids.includes(id),
      toggle: id =>
        set(state => ({
          ids: state.ids.includes(id)
            ? state.ids.filter(x => x !== id)
            : [...state.ids, id],
        })),
    }),
    { name: 'prayers.favorites.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
