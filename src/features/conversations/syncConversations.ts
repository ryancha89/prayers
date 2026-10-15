import { Lang } from '../../shared/i18n';
import { devlog } from '../../shared/devlog';
import { fetchConversations, type RemoteConversation } from '../counseling/api/prayersServer';
import { getLocalizedCounselor } from '../counselors/data/mockCounselors';
import { colors } from '../../shared/theme';
import { useConversationsStore, type ServerConversation } from './store/conversationsStore';

/**
 * Bring the account's consultation history down onto this device.
 *
 * The seam between two vocabularies. The server speaks of threads (`uniq_id`, a counsellor card id,
 * the last thing either side said); the app speaks of conversations (a row with a face, a name and
 * a time). Everything that needs the roster to be resolved happens here, so the store stays a store
 * and the API layer stays a transport.
 *
 * Returns how many threads the account holds, or `null` when the question could not be asked —
 * signed out, offline, or a server too old to have the route. `null` is not zero: the list already
 * on screen stays exactly as it is.
 */
export async function syncConversationsFromServer(
  lang: Lang,
  signal?: AbortSignal,
): Promise<number | null> {
  const remote = await fetchConversations({ lang, signal });
  if (remote == null) return null;

  useConversationsStore.getState().mergeFromServer(remote.map(row => toSummary(row, lang)));
  devlog(`[conversations] ${remote.length} thread(s) from the account`);
  return remote.length;
}

/**
 * One server thread as a list row.
 *
 * ⚠️ The name and the accent are resolved here but are NOT what the row draws — `ConversationRow`
 * re-derives the name and portrait from the counsellor id on every render, so the list follows the
 * language and a redrawn portrait. They are filled in because `ConversationSummary` has carried
 * them since the first version and something has to be there when the roster does not know this id.
 */
function toSummary(row: RemoteConversation, lang: Lang): ServerConversation {
  const counselor = getLocalizedCounselor(row.counselorId, lang);
  return {
    sessionId: row.uniqId,
    counselorId: row.counselorId,
    counselorName: counselor?.name ?? row.counselorId,
    counselorAccent: counselor?.accent ?? colors.card,
    subjectId: row.subjectId,
    // Her answer, not the question: a reply comes after the question it answers, so it is both the
    // most recent line and the one that tells the player where the conversation got to.
    lastMessage: row.lastAnswer || row.lastQuestion || '',
    updatedAt: row.lastSeenAt,
    // The topic the session settled on, in the player's language — the same label the room's
    // opening line uses when it remembers this thread.
    lastTopicSummary: row.topicLabel,
  };
}
