import { NativeModules, Platform } from 'react-native';
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

/** Where an unrecognised device lands. Korean, because that is the product's home language. */
export const DEFAULT_LANG: Lang = 'ko';

/**
 * A device locale tag → one of the six, or undefined when it is none of them.
 *
 * Chinese is the only one that needs thought: the script matters and the tag does not always say
 * it. `zh-Hant`, and the regions that use Traditional, are Taiwan/Hong Kong/Macau; everything else
 * under `zh` is Simplified. Guessing wrong here is not a near miss — a Taiwanese reader gets a
 * reading in the wrong script.
 *
 * Exported for its own sake: this is the part worth testing, and it is pure.
 */
export function langFromLocale(locale: string | undefined | null): Lang | undefined {
  const tag = (locale ?? '').replace(/_/g, '-').toLowerCase();
  if (!tag) return undefined;

  if (tag.startsWith('vi')) return 'vi';
  if (tag.startsWith('ko')) return 'ko';
  if (tag.startsWith('ja')) return 'ja';
  if (tag.startsWith('en')) return 'en';
  if (tag.startsWith('zh')) return /hant|-tw|-hk|-mo/.test(tag) ? 'zh-TW' : 'zh-CN';
  return undefined;
}

/**
 * The device's own language, read WITHOUT a localization dependency — the same reason the preview
 * strips are sprite sheets rather than video. iOS keeps it on SettingsManager, Android on
 * I18nManager; both are wrapped because a missing native module here would take the whole app down
 * on launch, and the cost of not knowing is one wrong default.
 */
export function deviceLang(): Lang {
  for (const read of LOCALE_SOURCES) {
    try {
      const lang = langFromLocale(read());
      if (lang) return lang;
    } catch {
      // A source that is not there is not an error — that is what the next one is for.
    }
  }
  return DEFAULT_LANG;
}

/**
 * In order of what actually answers, which is not the order the docs suggest.
 *
 * `Intl` FIRST. The legacy bridge modules below are what every "get the device locale without a
 * dependency" answer names, and under this app's New Architecture build `SettingsManager` simply
 * does not exist — so the app opened in Korean on a phone set to Vietnamese, silently, because a
 * missing module reads the same as a missing preference. Hermes ships Intl against the platform's
 * own locale data, so it answers when the modules do not.
 */
const LOCALE_SOURCES: Array<() => string | undefined> = [
  () => Intl?.DateTimeFormat?.().resolvedOptions?.().locale,
  () =>
    Platform.OS === 'ios'
      ? (NativeModules.SettingsManager?.settings?.AppleLocale ??
         NativeModules.SettingsManager?.settings?.AppleLanguages?.[0])
      : NativeModules.I18nManager?.localeIdentifier,
];

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

/**
 * App language. Follows the DEVICE on first launch, then whatever the player picked.
 *
 * It used to open in Korean for everyone, everywhere, until they found the picker — which on a
 * fresh install meant the very first screen, the one asking for their birth details, was in a
 * language most new users do not read.
 */
export const useLanguageStore = create<LanguageState>()(
  persist(
    (set, get) => ({
      lang: deviceLang(),
      setLang: lang => set({ lang: isLang(lang) ? lang : deviceLang() }),
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
        // Nothing persisted means first launch: the device decides, not Korea.
        return { ...current, lang: isLang(saved) ? saved : deviceLang() };
      },
    },
  ),
);
