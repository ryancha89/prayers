import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ChatMessage, ConversationSummary } from '../types';

/**
 * Conversation history (spec §29-31). One entry per counselor relationship,
 * keyed by sessionId. Persisted so sessions survive app restarts and can be
 * resumed (spec §31). Backend can later own long-term memory (spec §38).
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
