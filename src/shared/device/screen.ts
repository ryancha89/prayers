import { useWindowDimensions } from 'react-native';

/**
 * Screen metrics for layouts that must not be written in fixed pixels.
 *
 * Every screen in this app is one portrait column, and until now every height in it was a constant
 * measured on one phone. On an iPhone SE (667pt tall) the consultation overlay alone claimed 320pt
 * of transcript + 220pt of dialogue card + 110pt of input, and the keyboard takes ~300 more: the
 * counselor disappeared behind her own UI. On a Pro Max the same constants left a third of the
 * screen empty.
 *
 * So heights are expressed as a share of the window with a floor and a ceiling. The ceiling keeps
 * the design honest on tall phones (the old constants ARE the ceiling); the floor keeps a panel
 * usable rather than letting it collapse to nothing on the smallest screen.
 */
export interface Screen {
  width: number;
  height: number;
  /** Shorter edge — the one that decides how wide a column can be. */
  short: number;
  /** 667pt and below: iPhone SE / 8 and the small Androids. */
  isCompact: boolean;
  /** `vh(0.38, 180, 320)` = 38% of the window height, never below 180, never above 320. */
  vh: (share: number, min: number, max: number) => number;
}

export function useScreen(): Screen {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    short: Math.min(width, height),
    isCompact: height <= 667,
    vh: (share, min, max) =>
      Math.round(Math.max(min, Math.min(max, height * share))),
  };
}
