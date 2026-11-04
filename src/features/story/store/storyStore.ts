import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoryState } from '../engine/storyEngine';

/**
 * Where each chapter was left, so leaving the story mid-morning and coming back resumes there
 * (on the free talk it stopped at, with the log and the cat's name), and Home can say "이어하기".
 * Kept on the device: the story's meaning lives in these few fields, not on the server.
 */
interface SavedChapter {
  state: StoryState;
  updatedAt: number;
}

interface StoryStore {
  saves: Record<string, SavedChapter>;
  /** Chapters played to the end card. */
  done: Record<string, true>;
  /** Cheese speaks aloud (the cat's TTS voice). */
  voice: boolean;
  save(chapterId: string, state: StoryState): void;
  finish(chapterId: string): void;
  reset(chapterId: string): void;
  setVoice(on: boolean): void;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  const copy = { ...map };
  delete copy[key];
  return copy;
}

export const useStoryStore = create<StoryStore>()(
  persist(
    set => ({
      saves: {},
      done: {},
      voice: true,
      save: (chapterId, state) =>
        set(s => ({ saves: { ...s.saves, [chapterId]: { state: { ...state, sfx: null }, updatedAt: Date.now() } } })),
      finish: chapterId => set(s => ({ saves: without(s.saves, chapterId), done: { ...s.done, [chapterId]: true } })),
      reset: chapterId => set(s => ({ saves: without(s.saves, chapterId) })),
      setVoice: voice => set({ voice }),
    }),
    { name: 'prayers.story.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
