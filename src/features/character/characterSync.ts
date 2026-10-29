import { fetchAccountCharacter, saveAccountCharacter } from '../counseling/api/prayersServer';
import { useSubjectsStore } from '../subjects/store/subjectsStore';
import { devlog } from '../../shared/devlog';

/**
 * Keeps the player's character (body id, hair, outfit, "has seen the creator") on the ACCOUNT (27-10), the
 * same way languageSync keeps the language: the local store is what the app reads, the server is
 * where the choice is remembered — so a reinstall or a second phone does not ask again or lose the
 * hair colour.
 *
 * Other players never read this: in the cafe each client announces its own look over the presence
 * socket (Unity CafePresence `appearance`).
 *
 * QA 28-10:
 * - Nothing is written until a GET has shown the server KNOWS these fields. A server from before
 *   27-10 answers the POST with success and throws the fields away — and nulls the language.
 * - It runs at launch for a player already signed in, not only at sign-in: login comes before the
 *   creator and sign-out clears the pick, so at sign-in there is never a local pick to push.
 * - A pick made while the GET was in flight wins over the account's older one.
 *
 * QA 29-10: a pick that has not reached the account survives a relaunch. Saved while the GET had
 * failed (offline, 401) — or pushed and refused — it used to live only in this module's counter,
 * which a relaunch resets, and the next launch's sync pulled the account's OLD hair over it. The
 * store's persisted `characterUnpushed` now says "push, don't pull" until a push lands.
 */

/** null = not known yet (no GET answered), false = a server without the fields. */
let serverHasFields: boolean | null = null;
/** Bumped by every local pick; a sync that sees it move during its GET keeps the local pick. */
let localPicks = 0;

/** Tests. */
export function resetCharacterSyncForTests(): void {
  serverHasFields = null;
  localPicks = 0;
}

function hydrated(): Promise<void> {
  const p = (useSubjectsStore as unknown as { persist?: { hasHydrated(): boolean; onFinishHydration(cb: () => void): () => void } }).persist;
  if (!p || p.hasHydrated()) return Promise.resolve();
  return new Promise(resolve => {
    const off = p.onFinishHydration(() => { off(); resolve(); });
  });
}

function pushLocal(why: string): Promise<boolean> {
  const st = useSubjectsStore.getState();
  if (!st.playerCharacter) return Promise.resolve(false);
  const sent = {
    playerCharacter: st.playerCharacter, playerHair: st.playerHair, playerOutfit: st.playerOutfit, creatorSeen: st.creatorSeen,
  };
  return saveAccountCharacter(sent).then(ok => {
    devlog(`[character] ${why} - pushed ${st.playerCharacter} (${ok ? 'ok' : 'failed - kept for the next sync'})`);
    // Settled only if the store still holds what was sent: a pick made during the request is
    // pushed by its own save, and must not lose its mark to this answer.
    const now = useSubjectsStore.getState();
    if (ok && now.playerCharacter === sent.playerCharacter && now.playerHair === sent.playerHair
      && now.playerOutfit === sent.playerOutfit && now.creatorSeen === sent.creatorSeen) {
      useSubjectsStore.setState({ characterUnpushed: false });
    }
    return ok;
  });
}

/** After sign-in and at launch when signed in. The account wins when it has a pick; when it has none,
 *  a pick already finished on this device is written up instead of being thrown away. */
export async function syncAccountCharacter(signal?: AbortSignal): Promise<void> {
  await hydrated();
  const picksBefore = localPicks;
  const remote = await fetchAccountCharacter(signal);
  if (remote == null) return; // offline, signed out, or a server without the fields
  serverHasFields = true;
  const st = useSubjectsStore.getState();
  if (localPicks !== picksBefore) {
    await pushLocal('picked during the sync');
    return;
  }
  if (st.characterUnpushed && st.playerCharacter) {
    await pushLocal('picked before the account heard of it');
    return;
  }
  if (remote.playerCharacter) {
    useSubjectsStore.setState({
      playerCharacter: remote.playerCharacter,
      playerHair: remote.playerHair ?? '',
      // null is "no answer" here, not "the artist's own": a server with the hair but not the outfit
      // column (29-10) must not reset the colour picked on this device at every launch.
      playerOutfit: remote.playerOutfit ?? st.playerOutfit,
      creatorSeen: remote.creatorSeen || st.creatorSeen,
    });
    devlog(`[character] account says ${remote.playerCharacter} hair='${remote.playerHair ?? ''}' outfit='${remote.playerOutfit ?? '(none)'}'`);
    return;
  }
  if (st.playerCharacter && st.creatorSeen) await pushLocal('account had none');
}

/** The creator's "Start" (and a gender change): save what is now in the store. Before any GET has
 *  answered, it only marks the pick — the sync that answers (this launch's or the next) pushes it. */
export function saveCharacterToAccount(): void {
  localPicks++;
  useSubjectsStore.setState({ characterUnpushed: true });
  if (serverHasFields !== true) {
    devlog('[character] server fields unknown - the next sync pushes the pick');
    return;
  }
  void pushLocal('saved');
}
