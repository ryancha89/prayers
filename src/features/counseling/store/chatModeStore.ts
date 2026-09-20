import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ChatMode } from '../types';

/**
 * How the counselor answers in free chat: 티키타카 or 깊은 풀이.
 *
 * The same two modes SAVIS has (saju_front `chatbot.chatMode`), carried the same way — a single
 * `setting.chat_mode` string on every turn, remembered across sessions. The server owns everything
 * the mode changes (prompt, output cap, thinking budget); the app only says which one it wants.
 *
 *  - `tiki`   — 서너 문장, 250자, a light prompt: the fast rally.
 *  - `detail` — the full reading with its 명리 근거: slower, and the SAVIS default, so it is the
 *               default here too. A player who wants the fast room flips it once and it stays.
 *
 * Only the free-chat turns after the staged reading carry it. The reading itself is cut into the
 * room's four beats by a numbered shape the server distributes on — a 250-character answer would
 * leave three of them empty — so it keeps its own prompt whatever this says.
 */
interface ChatModeState {
  chatMode: ChatMode;
  setChatMode: (mode: ChatMode) => void;
  toggleChatMode: () => void;
}

const coerce = (v: unknown): ChatMode => (v === 'tiki' ? 'tiki' : 'detail');

export const useChatModeStore = create<ChatModeState>()(
  persist(
    (set, get) => ({
      chatMode: 'detail',
      setChatMode: mode => set({ chatMode: coerce(mode) }),
      toggleChatMode: () => set({ chatMode: get().chatMode === 'tiki' ? 'detail' : 'tiki' }),
    }),
    {
      name: 'prayers.chatMode.v1',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => ({
        ...current,
        // Anything but a stored 'tiki' is the default — the same coercion SAVIS's reducer does.
        chatMode: coerce((persisted as Partial<ChatModeState> | undefined)?.chatMode),
      }),
    },
  ),
);
