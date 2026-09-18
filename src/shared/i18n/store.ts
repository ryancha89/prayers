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

/**
 * ⚠️ `zh-TW` IS IN THE TYPE AND NOT IN `LANGUAGES`, and that gap is deliberate (18-09).
 *
 * Traditional Chinese was retired from the app: nobody can pick it, and a Traditional device gets
 * Simplified. But the TRANSLATIONS stay — six files carry a full `zh-TW` bundle, and deleting them
 * would throw away finished work to save nothing, since a `Record<Lang, …>` with one extra key
 * costs a build exactly nothing.
 *
 * Everything that gates on the language reads `LANGUAGES`, not the type: the picker lists it,
 * `isLang` validates against it, `cycle` walks it. So removing the one entry below retires the
 * language everywhere at once — including for a player who already had it saved, because `isLang`
 * then rejects the persisted value and the store falls back to their device.
 *
 * To bring it back: restore the `LANGUAGES` entry and the Traditional branch in `langFromLocale`.
 * Nothing else was removed.
 */

/** In the order the picker shows them, each written in its own language. */
export const LANGUAGES: { code: Lang; label: string }[] = [
  { code: 'ko', label: '한국어' },
  { code: 'en', label: 'English' },
  { code: 'ja', label: '日本語' },
  { code: 'zh-CN', label: '简体中文' },
  // { code: 'zh-TW', label: '繁體中文' },   ← retired 18-09; see the note on Lang above
  { code: 'vi', label: 'Tiếng Việt' },
];

/** Where an unrecognised device lands. Korean, because that is the product's home language. */
export const DEFAULT_LANG: Lang = 'ko';

/**
 * A device locale tag → one of the six, or undefined when it is none of them.
 *
 * Chinese needed thought while both scripts shipped: `zh-Hant` and the Traditional regions are
 * Taiwan/Hong Kong/Macau, everything else under `zh` is Simplified, and guessing wrong was not a
 * near miss — a Taiwanese reader got a reading in the wrong script. Traditional is retired as of
 * 18-09, so every `zh` now lands on Simplified. That IS the wrong script for a Taiwanese reader,
 * and it is now a product decision rather than a bug.
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
  // Traditional is retired, so every `zh` tag lands on Simplified — including zh-Hant/TW/HK/MO.
  // This used to split them, and the comment above still explains why that mattered; it is kept
  // because the day zh-TW comes back, this line is half the change.
  if (tag.startsWith('zh')) return 'zh-CN';
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
