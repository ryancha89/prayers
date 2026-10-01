import { useWindowDimensions } from 'react-native';

/**
 * Screen metrics for layouts that must not be written in fixed pixels.
 *
 * Every screen in this app was one portrait column, and until then every height in it was a constant
 * measured on one phone. On an iPhone SE (667pt tall) the consultation overlay alone claimed 320pt
 * of transcript + 220pt of dialogue card + 110pt of input, and the keyboard takes ~300 more: the
 * counselor disappeared behind her own UI. On a Pro Max the same constants left a third of the
 * screen empty.
 *
 * So heights are expressed as a share of the window with a floor and a ceiling. The ceiling keeps
 * the design honest on tall phones (the old constants ARE the ceiling); the floor keeps a panel
 * usable rather than letting it collapse to nothing on the smallest screen.
 *
 * LANDSCAPE (01-10). Phones rotate now, and every number here follows the window as it is NOW, not
 * the device's portrait size: `vh` is a share of the current height (402pt on an iPhone 17 held
 * sideways), so a panel that was a third of a tall window stays a third of a short one. What the
 * floors cannot do is make a 900pt-tall column fit in 402 — so landscape screens do not stack, they
 * split: the 3D scene keeps the left of the screen and the UI moves into a right-hand panel
 * `sidePanel` wide. Plain screens keep their single column but centre it at `column` width, since a
 * list row 874pt wide reads as a spreadsheet.
 */
export interface Screen {
  width: number;
  height: number;
  /** Shorter edge — the one that decides how wide a column can be. */
  short: number;
  /** Longer edge. */
  long: number;
  /** The window is wider than it is tall. */
  landscape: boolean;
  /** 667pt of height and below: iPhone SE / 8 and the small Androids — and every phone held
   *  sideways, which is the point: it answers "is vertical room tight", whatever the reason. */
  isCompact: boolean;
  /** `vh(0.38, 180, 320)` = 38% of the window height, never below 180, never above 320. */
  vh: (share: number, min: number, max: number) => number;
  /** The same for the width. */
  vw: (share: number, min: number, max: number) => number;
  /** Landscape only: the width of the right-hand panel the UI over a 3D scene moves into. 0 in
   *  portrait, where that UI is a bottom panel instead. */
  sidePanel: number;
  /** The widest a single column of plain UI should be: the window in portrait, capped in landscape. */
  column: number;
}

/** The right-hand panel over a 3D scene in landscape: ~39% of the width, so the scene keeps ~60%. */
export const SIDE_PANEL_SHARE = 0.39;
const SIDE_PANEL_MIN = 260;
const SIDE_PANEL_MAX = 420;
/** A plain screen's column in landscape. 560 keeps a list row about as long as on a big phone held
 *  upright plus a margin, and leaves the rest as air on either side. */
export const COLUMN_MAX = 560;

const clampRound = (v: number, min: number, max: number) => Math.round(Math.max(min, Math.min(max, v)));

/** The metrics for a window of this size. Pure, so layouts can be checked without rendering. */
export function screenOf(width: number, height: number): Screen {
  const landscape = width > height;
  return {
    width,
    height,
    short: Math.min(width, height),
    long: Math.max(width, height),
    landscape,
    isCompact: height <= 667,
    vh: (share, min, max) => clampRound(height * share, min, max),
    vw: (share, min, max) => clampRound(width * share, min, max),
    sidePanel: landscape ? clampRound(width * SIDE_PANEL_SHARE, SIDE_PANEL_MIN, SIDE_PANEL_MAX) : 0,
    column: landscape ? Math.min(width, COLUMN_MAX) : width,
  };
}

export function useScreen(): Screen {
  const { width, height } = useWindowDimensions();
  return screenOf(width, height);
}

/**
 * The style that keeps a plain screen's single column readable on a phone held sideways: full width
 * up to COLUMN_MAX, centred beyond it. Static on purpose — every phone is narrower than COLUMN_MAX
 * upright, so in portrait this does nothing at all and cannot move a pixel of the existing layout.
 * Put it on a ScrollView's contentContainerStyle, or a list's.
 */
export const column = { width: '100%', maxWidth: COLUMN_MAX, alignSelf: 'center' } as const;
