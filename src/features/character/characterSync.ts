import { fetchAccountCharacter, saveAccountCharacter } from '../counseling/api/prayersServer';
import { useSubjectsStore } from '../subjects/store/subjectsStore';
import { devlog } from '../../shared/devlog';

/**
 * Keeps the player's character (body id, hair, "has seen the creator") on the ACCOUNT (27-10), the
 * same way languageSync keeps the language: the local store is what the app reads, the server is
 * where the choice is remembered — so a reinstall or a second phone does not ask again or lose the
 * hair colour.
 *
 * Other players never read this: in the cafe each client announces its own look over the presence
 * socket (Unity CafePresence `appearance`).
 */

/** After sign-in. The account wins when it has a pick; when it has none, a pick already made on this
 *  device (creator finished) is written up instead of being thrown away. */
export async function syncAccountCharacter(signal?: AbortSignal): Promise<void> {
  const remote = await fetchAccountCharacter(signal);
  if (remote == null) return;
  const st = useSubjectsStore.getState();
  if (remote.playerCharacter) {
    useSubjectsStore.setState({
      playerCharacter: remote.playerCharacter,
      playerHair: remote.playerHair ?? '',
      creatorSeen: remote.creatorSeen || st.creatorSeen,
    });
    devlog(`[character] account says ${remote.playerCharacter} hair='${remote.playerHair ?? ''}'`);
    return;
  }
  if (st.playerCharacter && st.creatorSeen) {
    const ok = await saveAccountCharacter({ playerCharacter: st.playerCharacter, playerHair: st.playerHair, creatorSeen: true });
    devlog(`[character] account had none - pushed ${st.playerCharacter} (${ok ? 'ok' : 'failed'})`);
  }
}

/** The creator's "Start": save what is now in the store. A failure keeps the local pick; the next
 *  sign-in pushes it (the account then has none). */
export function saveCharacterToAccount(): void {
  const st = useSubjectsStore.getState();
  if (!st.playerCharacter) return;
  void saveAccountCharacter({ playerCharacter: st.playerCharacter, playerHair: st.playerHair, creatorSeen: st.creatorSeen }).then(ok => {
    if (!ok) devlog('[character] could not save to the account - kept locally');
  });
}
