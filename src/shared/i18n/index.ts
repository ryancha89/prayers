import { useCallback } from 'react';
import { useLanguageStore } from './store';
import { translate, TranslationKey } from './translations';

export { useLanguageStore } from './store';
export type { Lang } from './store';
export type { TranslationKey } from './translations';

/** Translator hook. `const t = useT(); t('detail.about', { name })`. */
export function useT() {
  const lang = useLanguageStore(s => s.lang);
  return useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      translate(lang, key, params),
    [lang],
  );
}

/** Current language, for non-string localization (counselor content, AI). */
export function useLang() {
  return useLanguageStore(s => s.lang);
}
