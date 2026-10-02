import { create } from 'zustand';

/**
 * A screen's own bar docked to the bottom edge (a CTA like CounselorDetail's "Start Counseling").
 * The journey mini player floats over every screen from App.tsx and knows nothing about them, so it
 * sat on top of that bar (sim 02-10, landscape). A screen with such a bar reports its height here
 * while it is focused; the mini player rides above it.
 */
interface BottomDock {
  /** Points the focused screen's bottom bar takes from the bottom edge (safe area included); 0 none. */
  height: number;
  set(height: number): void;
}

export const useBottomDock = create<BottomDock>(set => ({
  height: 0,
  set: height => set({ height: Math.max(0, Math.round(height)) }),
}));
