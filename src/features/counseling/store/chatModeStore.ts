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

/**
 * ⚠️ 티키타카 IS THE DEFAULT since 26-09 ("티키타카모드 추가해서 바로바로 대화하는것처럼 …
 * 한번 질문하면 대답이 너무 길어"), and it now applies from the FIRST question — see
 * ConsultationEngine.submitQuestion. The store key moved to v2 so every player starts there once;
 * 깊은 풀이 stays one tap away and is remembered as before.
 */
const coerce = (v: unknown): ChatMode => (v === 'detail' || v === 'short' ? v : 'tiki');

export const useChatModeStore = create<ChatModeState>()(
  persist(
    (set, get) => ({
      chatMode: 'tiki',
      setChatMode: mode => set({ chatMode: coerce(mode) }),
      toggleChatMode: () => set({ chatMode: get().chatMode === 'tiki' ? 'detail' : 'tiki' }),
    }),
    {
      name: 'prayers.chatMode.v2',
      storage: createJSONStorage(() => AsyncStorage),
      merge: (persisted, current) => ({
        ...current,
        // Anything but a stored 'detail' is the default (tiki).
        chatMode: coerce((persisted as Partial<ChatModeState> | undefined)?.chatMode),
      }),
    },
  ),
);
