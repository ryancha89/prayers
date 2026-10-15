import React from 'react';
import { View } from 'react-native';
import { create } from 'zustand';

/**
 * How much of the bottom of a screen the journey mini player covers.
 *
 * The mini player floats over every screen from App.tsx and knows nothing about them, so the last
 * row of a scrolling list ended up under it with no way to scroll it free (Conversations, sim
 * 12-10). The mini player reports its own height (plus its gap) here while it is shown, 0 when it
 * is not; a scrolling screen ends its content with <MiniPlayerSpacer /> so the last row can scroll
 * clear of the bar.
 */
interface MiniPlayerInset {
  /** Points the bar takes above whatever it sits on (tab bar, a screen's dock, the home indicator); 0 when hidden. */
  height: number;
  set(height: number): void;
}

export const useMiniPlayerInset = create<MiniPlayerInset>(set => ({
  height: 0,
  set: height => set({ height: Math.max(0, Math.round(height)) }),
}));

/** The last child of a scrolling screen's content: as tall as the mini player, nothing when it is hidden. */
export const MiniPlayerSpacer: React.FC = () => {
  const height = useMiniPlayerInset(s => s.height);
  return height > 0 ? <View style={{ height }} testID="mini-player-spacer" /> : null;
};
