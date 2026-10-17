import { create } from 'zustand';

/**
 * Consultations held per counselor, by card id, as the server last said (`counselorStats.ts`).
 * `null` until it has answered — and then the cards print no count at all: an invented number is
 * what this replaced.
 */
interface CounselorStatsState {
  counts: Record<string, number> | null;
  setCounts: (counts: Record<string, number>) => void;
}

export const useCounselorStats = create<CounselorStatsState>()(set => ({
  counts: null,
  setCounts: counts => set({ counts }),
}));
