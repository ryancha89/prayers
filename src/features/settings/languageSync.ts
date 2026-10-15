import { fetchAccountLanguage, saveAccountLanguage } from '../counseling/api/prayersServer';
import { useLanguageStore } from '../../shared/i18n';
import type { Lang } from '../../shared/i18n';
import { devlog } from '../../shared/devlog';

/**
 * Keeps the app's language and the ACCOUNT's language in step.
 *
 * WHY THIS FILE EXISTS. The language used to be stored on the device twice — this app's
 * AsyncStorage and Unity's PlayerPrefs — and on 2026-09-16 the two had drifted: the store said
 * `ko`, `saju_lang` said EN, and nothing could say which was right. It is a preference the player
 * SET, so it belongs to their account: it survives a reinstall, follows them to a second device,
 * and there is one answer to the question.
 *
 * WHO TALKS TO THE SERVER. Only this app. Unity is told the language over the bridge and keeps no
 * copy of it at all — a second client fetching the same setting is a race at boot and a second
 * source of truth one layer down, which is the thing being removed.
 *
 * ⚠️ THE LOCAL STORE IS STILL WHAT THE UI READS, and that is deliberate. It is instant, and it
 * works signed out and offline; the server is where the choice is REMEMBERED, not where it is asked
 * for on every render. Losing the network must never leave the app in a language nobody chose.
 */

/**
 * Reconcile once, after sign-in.
 *
 * The account wins when it has an answer, because it is the one copy that survives this install.
 * When it has none — a new account, or one from before this setting existed — the device's current
 * choice is written up, so the first sign-in ADOPTS what the player was already using instead of
 * resetting them to a default they never picked.
 */
export async function syncAccountLanguage(signal?: AbortSignal): Promise<void> {
  const local = useLanguageStore.getState().lang;
  const remote = await fetchAccountLanguage(signal);

  if (remote == null) {
    const ok = await saveAccountLanguage(local);
    devlog(`[lang] account had none - pushed '${local}' (${ok ? 'ok' : 'failed'})`);
    return;
  }
  if (remote !== local) {
    useLanguageStore.getState().setLang(remote);
    devlog(`[lang] account says '${remote}', device had '${local}' - account wins`);
  }
}

/**
 * The player changed it. Apply locally FIRST — the screen must turn over on the tap, not on the
 * round trip — then tell the account. A failed write leaves the choice in place, and the next
 * `syncAccountLanguage` pushes it, because the device value is what gets written when the account
 * has no answer.
 */
export function setLanguageEverywhere(lang: Lang): void {
  useLanguageStore.getState().setLang(lang);
  void saveAccountLanguage(lang).then(ok => {
    if (!ok) devlog(`[lang] could not save '${lang}' to the account - kept locally`);
  });
}
