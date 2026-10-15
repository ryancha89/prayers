import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, ConversationSummary } from '../types';

/**
 * Conversation history (spec §29-31). One entry per counselor relationship,
 * keyed by sessionId — which is the same `session_<counselorId>_<subjectId>` key the room and the
 * server know the thread by.
 *
 * ⚠️ THE PHONE IS THE CACHE, THE ACCOUNT IS THE RECORD (18-09). This store used to be the only
 * place a past consultation existed: a reinstall or a second device wiped a history the server had
 * been keeping all along, while the sign-in screen promised an account that follows you.
 * `mergeFromServer` is the reconciliation, and it has one rule — the server owns what a thread IS
 * (that it happened, when, and what was last said), the device owns what it has CACHED of it (the
 * transcript bodies, which the list endpoint does not carry). Neither overwrites the other's half.
 */

interface ConversationsState {
  byId: Record<string, ConversationSummary>;
  order: string[]; // sessionIds, most-recently-updated first

  list: () => ConversationSummary[];
  get: (sessionId: string) => ConversationSummary | undefined;

  /** Create (or return existing) session for a counselor+subject pair. */
  ensureSession: (init: {
    sessionId: string;
    counselorId: string;
    counselorName: string;
    counselorAccent: string;
    subjectId?: string;
  }) => ConversationSummary;

  appendMessage: (sessionId: string, msg: ChatMessage) => void;
  setLastTopicSummary: (sessionId: string, summary: string) => void;

  /** Reconcile the account's list into the device's. See the note at the top of this file. */
  mergeFromServer: (remote: ServerConversation[]) => void;
}

/** What the server knows about a thread — everything except the transcript itself. */
export interface ServerConversation {
  sessionId: string;
  counselorId: string;
  counselorName: string;
  counselorAccent: string;
  subjectId?: string;
  lastMessage: string;
  updatedAt: string;
  lastTopicSummary?: string;
}

export const useConversationsStore = create<ConversationsState>()(
  persist(
    (set, get) => ({
      byId: {},
      order: [],

      list: () => get().order.map(id => get().byId[id]).filter(Boolean) as ConversationSummary[],
      get: sessionId => get().byId[sessionId],

      ensureSession: init => {
        const existing = get().byId[init.sessionId];
        if (existing) return existing;
        const created: ConversationSummary = {
          sessionId: init.sessionId,
          counselorId: init.counselorId,
          counselorName: init.counselorName,
          counselorAccent: init.counselorAccent,
          subjectId: init.subjectId,
          lastMessage: '',
          updatedAt: new Date().toISOString(),
          messages: [],
        };
        set(state => ({
          byId: { ...state.byId, [created.sessionId]: created },
          order: [created.sessionId, ...state.order.filter(id => id !== created.sessionId)],
        }));
        return created;
      },

      appendMessage: (sessionId, msg) =>
        set(state => {
          const conv = state.byId[sessionId];
          if (!conv) return state;
          const updated: ConversationSummary = {
            ...conv,
            messages: [...conv.messages, msg],
            lastMessage: msg.text,
            updatedAt: msg.at,
          };
          return {
            byId: { ...state.byId, [sessionId]: updated },
            order: [sessionId, ...state.order.filter(id => id !== sessionId)],
          };
        }),

      mergeFromServer: remote =>
        set(state => {
          if (remote.length === 0) return state;
          const byId = { ...state.byId };

          for (const row of remote) {
            const local = byId[row.sessionId];
            byId[row.sessionId] = {
              ...row,
              // The one thing the account does NOT have: the words themselves. A thread read on a
              // new phone opens with an empty transcript and fills as it is used — better than
              // dropping a conversation the player knows they had.
              messages: local?.messages ?? [],
              // Kept when the server has nothing to say about it (a thread with no turns yet).
              lastMessage: row.lastMessage || local?.lastMessage || '',
              lastTopicSummary: row.lastTopicSummary ?? local?.lastTopicSummary,
              unreadCount: local?.unreadCount,
            };
          }

          // Newest first, across both halves. A local-only thread (this session, still unsynced)
          // keeps its place by date rather than being pushed out by the server's list.
          const order = Object.keys(byId).sort(
            (a, b) => Date.parse(byId[b].updatedAt) - Date.parse(byId[a].updatedAt),
          );
          return { byId, order };
        }),

      setLastTopicSummary: (sessionId, summary) =>
        set(state => {
          const conv = state.byId[sessionId];
          if (!conv) return state;
          return {
            byId: { ...state.byId, [sessionId]: { ...conv, lastTopicSummary: summary } },
          };
        }),
    }),
    {
      name: 'prayers.conversations.v1',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
);
