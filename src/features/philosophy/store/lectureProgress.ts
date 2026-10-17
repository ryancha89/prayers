import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

/**
 * Where the listener is in the series: the chapters heard to the end, and the line they left one
 * on — so Home can say "이어서 듣기" and the lecture picks up at that sentence. Per device; there is
 * nothing to sync, the lecture is free and the same for everyone.
 */
interface LectureProgress {
  done: number[];
  /** The chapter and line last playing, or null before the first. */
  at: { chapter: number; line: number } | null;
  /** The speed the listener chose, as SHOWN (1.0× = normal). Plays at speed × SPEED_BASE. */
  speed: number;
  /** How many sentences the subtitle shows: the current one, and up to two before it, dimmed. */
  subtitleLines: number;
  setSubtitleLines(n: number): void;
  /** Go on to the next chapter by itself when one ends (16-10, user: "끝까지 클릭안해도 되게 자동재생"). */
  autoplay: boolean;
  setAutoplay(on: boolean): void;
  markDone(chapter: number): void;
  setAt(chapter: number, line: number): void;
  setSpeed(speed: number): void;
}

/** The takes were recorded slow and reflective, and listeners settled on 1.4× — so that pace was
 *  baked INTO the files (ffmpeg atempo=1.4, pitch kept; tools/schopenhauer/bake_lecture.py) and is
 *  "1.0×" now (16-10, user: "1.4가 디폴트면 그걸 1기준으로", "2배까지"). Baking it in, rather than
 *  multiplying at play time, is what lets the picker reach 2.0×: iOS's AVAudioPlayer stops at a
 *  rate of 2.0, and 2.0 × 1.4 would have been 2.8. */
export const SPEED_BASE = 1;
export const LECTURE_SPEEDS = [0.6, 0.8, 1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
export const DEFAULT_LECTURE_SPEED = 1.0;
/** The subtitle sizes the picker offers (16-10, user: "자막을 두세줄로 유저가 선택해서"). */
export const SUBTITLE_LINES = [1, 2, 3];

export const useLectureProgress = create<LectureProgress>()(
  persist(
    set => ({
      done: [],
      at: null,
      speed: DEFAULT_LECTURE_SPEED,
      subtitleLines: 1,
      autoplay: true,
      setAutoplay: on => set({ autoplay: on }),
      setSubtitleLines: n => set({ subtitleLines: n }),
      setSpeed: speed => set({ speed }),
      markDone: chapter =>
        set(s => (s.done.includes(chapter) ? s : { done: [...s.done, chapter].sort((a, b) => a - b) })),
      setAt: (chapter, line) => set({ at: { chapter, line } }),
    }),
    {
      name: 'prayers.lecture.schopenhauer.v1',
      storage: createJSONStorage(() => AsyncStorage),
      // v1 stored the raw playback rate, v2 one relative to a 1.4 base; v3 plays files already at
      // that pace. Start everyone on 1.0×, autoplay on.
      version: 3,
      migrate: (old: any) => ({ ...old, speed: DEFAULT_LECTURE_SPEED, autoplay: true }),
    },
  ),
);
