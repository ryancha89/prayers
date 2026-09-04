import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The languages the app is written in.
 *
 * These are the SAME codes the backend takes in `setting.lang`
 * (saju_server docs/prayers/README.md §5), because this value is passed straight through to Unity
 * and on to the consultation endpoint. Inventing a shorter code here — 'zh' for both Chinese
 * scripts, say — would mean a Taiwanese player's reading comes back in Simplified.
 */
export type Lang = 'ko' | 'en' | 'ja' | 'zh-CN' | 'zh-TW' | 'vi';

/** In the order the picker shows them, each written in its own language. */
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '简体中文' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'vi', label: 'Tiếng Việt' },
];

export const DEFAULT_LANG: Lang = 'ko';

export function isLang(value: unknown): value is Lang {
  return LANGUAGES.some(l => l.code === value);
}

export function labelFor(lang: Lang): string {
  return LANGUAGES.find(l => l.code === lang)?.label ?? lang;
}

interface LanguageState {
  lang: Lang;
  setLang: (lang: Lang) => void;
  /** Next language in the list, wrapping. Kept so a tap-to-cycle affordance still works. */
  cycle: () => void;
}

/** App language. Default Korean; persisted across launches. */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      lang: DEFAULT_LANG,
      setLang: lang => set({ lang: isLang(lang) ? lang : DEFAULT_LANG }),
      cycle: () => {
        const i = LANGUAGES.findIndex(l => l.code === get().lang);
        set({ lang: LANGUAGES[(i + 1) % LANGUAGES.length].code });
      },
    }),
    {
      name: 'prayers.lang.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // A build that only knew ko/en may have persisted something this build still accepts, but a
      // downgrade-then-upgrade can leave a code that no longer exists. Fall back rather than render
      // an app with every string missing.
      merge: (persisted, current) => {
        const saved = (persisted as Partial<LanguageState> | undefined)?.lang;
        return { ...current, lang: isLang(saved) ? saved : DEFAULT_LANG };
      },
    },
  ),
);
