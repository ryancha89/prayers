import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type Lang = 'ko' | 'en';

interface LanguageState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  toggle: () => void;
}

/** App language. Default Korean; user can switch to English (persisted). */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      lang: 'ko',
      setLang: lang => set({ lang }),
      toggle: () => set({ lang: get().lang === 'ko' ? 'en' : 'ko' }),
    }),
    { name: 'prayers.lang.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
