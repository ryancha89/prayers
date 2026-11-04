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
  // Only waits when the store is not back yet: an await on a store already loaded would still put
  // the GET a tick behind the sign-in that called this.
  const loading = hydrating();
  if (loading) await loading;
  const remote = await fetchAccountLanguage(signal);
  // Read after the GET: a pick made while it was in flight is the newest word, and marks itself.
  const { lang: local, langUnpushed } = useLanguageStore.getState();

  if (remote == null) {
    const ok = await pushLocal(local);
    devlog(`[lang] account had none - pushed '${local}' (${ok ? 'ok' : 'failed'})`);
    return;
  }
  // A choice made on this device that the account never took (29-10: changed offline, then the
  // next sign-in put the account's old language back). The device's is newer: push it, don't pull.
  if (langUnpushed) {
    if (remote === local) {
      useLanguageStore.setState({ langUnpushed: false });
      return;
    }
    const ok = await pushLocal(local);
    devlog(`[lang] device choice '${local}' not on the account yet - pushed (${ok ? 'ok' : 'failed - kept for the next sync'})`);
    return;
  }
  if (remote !== local) {
    useLanguageStore.getState().setLang(remote);
    devlog(`[lang] account says '${remote}', device had '${local}' - account wins`);
  }
}

/**
 * The player changed it. Apply locally FIRST — the screen must turn over on the tap, not on the
 * round trip — then tell the account. A failed write leaves the choice in place AND marked
 * unpushed (persisted), so the next `syncAccountLanguage` pushes it rather than applying the
 * account's older answer over it.
 */
export function setLanguageEverywhere(lang: Lang): void {
  useLanguageStore.getState().setLang(lang);
  useLanguageStore.setState({ langUnpushed: true });
  void pushLocal(lang).then(ok => {
    if (!ok) devlog(`[lang] could not save '${lang}' to the account - kept locally, pushed at the next sync`);
  });
}

/** Write `lang` to the account; the unpushed mark clears only if the store still holds it — a
 *  later pick made during the request keeps its own mark. */
async function pushLocal(lang: Lang): Promise<boolean> {
  const ok = await saveAccountLanguage(lang);
  if (ok && useLanguageStore.getState().lang === lang) useLanguageStore.setState({ langUnpushed: false });
  return ok;
}

/** A promise for the persisted language when it is still being read back, else null — synced
 *  before it, the account's answer would be compared with the device default. */
function hydrating(): Promise<void> | null {
  const p = (useLanguageStore as unknown as { persist?: { hasHydrated(): boolean; onFinishHydration(cb: () => void): () => void } }).persist;
  if (!p || p.hasHydrated()) return null;
  return new Promise(resolve => {
    const off = p.onFinishHydration(() => { off(); resolve(); });
  });
}
