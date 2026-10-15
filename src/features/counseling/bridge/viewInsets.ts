import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';
import { NavigationContext } from '@react-navigation/native';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import type { ViewInsetsPayload } from '../types';

/** The screen's navigation, or nothing: tests that mock @react-navigation/native without it still
 *  render the screens, as "always on top". */
const ScreenNavigation: typeof NavigationContext = NavigationContext ?? createContext(undefined);

/** Covered points on each side of the UnityView. */
export interface CoveredPx {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

/** Two decimals is a hundredth of the view — finer than any camera framing can use, and coarse
 *  enough that a panel re-measuring half a point does not count as a change. */
const round = (v: number) => Math.round(v * 100) / 100;
const share = (px: number | undefined, of: number) =>
  of > 0 && px != null && Number.isFinite(px) ? round(Math.max(0, Math.min(1, px / of))) : 0;

/**
 * Points covered → the VIEW_INSETS payload: fractions of the UnityView's OWN size, never of the
 * screen's. The two are the same today (every host fills its screen), and the day one does not,
 * the room must still be told about the part of itself that is hidden.
 */
export function viewInsetsOf(
  host: { width: number; height: number },
  covered: CoveredPx,
  landscape: boolean,
): ViewInsetsPayload {
  return {
    top: share(covered.top, host.height),
    right: share(covered.right, host.width),
    bottom: share(covered.bottom, host.height),
    left: share(covered.left, host.width),
    landscape,
  };
}

/** The measured rectangles a screen hands to its `compute`. `host` is the UnityView's box. */
export type MeasuredRects = Partial<Record<string, LayoutRectangle>> & { host?: LayoutRectangle };

/**
 * Reports VIEW_INSETS from a screen's own onLayout events.
 *
 * The screen tags the views that matter (`track('host')`, `track('panel')`, …) and says how they
 * add up to covered points; every layout change of any of them — a rotation re-lays out all of them
 * — recomputes and sends. The bridge deduplicates, so a re-measure that changed nothing costs
 * nothing. `send` absent (no Unity in this build) makes the whole thing inert.
 */
/** How long the layout must hold still before its insets are sent. */
export const INSETS_SETTLE_MS = 120;

export function useViewInsets(opts: {
  send?: (insets: ViewInsetsPayload) => void;
  landscape: boolean;
  compute: (rects: MeasuredRects) => CoveredPx | null;
}) {
  const rects = useRef<MeasuredRects>({});
  const latest = useRef(opts);
  latest.current = opts;
  const handlers = useRef<Record<string, (e: LayoutChangeEvent) => void>>({});

  // Trailing debounce: a rotation lays the screen out in several passes, and the passes in between
  // measured nonsense (sim 01-10: bottom 0.95, then 0.88, then 0.40 within a millisecond). Only the
  // settled value goes to Unity, so the landscape camera never eases toward a half-laid-out panel.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ONLY THE SCREEN ON TOP TALKS. VIEW_INSETS is one value for the one Unity view, and a screen left
  // under another in the stack still lays out on a rotation: the World under the Journey sent its own
  // top bar a few ms after the Journey's panel, and the cabin framed for `bottom: 0` until the next
  // layout (sim QA 05-10, 4 of 4 rotations). Outside a navigator (tests) every caller is "on top".
  const navigation = useContext(ScreenNavigation);
  const focused = useRef(navigation ? navigation.isFocused() : true);
  const sendNow = useCallback(() => {
    timer.current = null;
    if (!focused.current) return;
    const { send, landscape, compute } = latest.current;
    const host = rects.current.host;
    if (!send || !host || host.width <= 0 || host.height <= 0) return;
    const covered = compute(rects.current);
    if (covered) send(viewInsetsOf(host, covered, landscape));
  }, []);
  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(sendNow, INSETS_SETTLE_MS);
  }, [sendNow]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Back on top (the Journey popped off the World): say this screen's insets again — the last ones
  // Unity heard were the other screen's.
  useEffect(() => {
    if (!navigation) return;
    const onFocus = navigation.addListener('focus', () => { focused.current = true; flush(); });
    const onBlur = navigation.addListener('blur', () => { focused.current = false; });
    focused.current = navigation.isFocused();
    return () => { onFocus(); onBlur(); };
  }, [navigation, flush]);

  /** onLayout for the view called `name`. Stable per name, so it never re-renders anything. */
  const track = useCallback(
    (name: string) =>
      (handlers.current[name] ??= (e: LayoutChangeEvent) => {
        rects.current[name] = e.nativeEvent.layout;
        flush();
      }),
    [flush],
  );

  /** A box measured somewhere else (a child component's own onLayout), or null when it went away
   *  — an unmounted panel covers nothing. */
  const put = useCallback(
    (name: string, rect: LayoutRectangle | null) => {
      if (rect) rects.current[name] = rect;
      else if (rects.current[name]) delete rects.current[name];
      else return;
      flush();
    },
    [flush],
  );

  // A rotation flips `landscape` even if no tracked box has re-measured by the time it renders.
  const landscape = opts.landscape;
  useEffect(() => {
    flush();
  }, [landscape, flush]);

  return useMemo(() => ({ track, put, flush }), [track, put, flush]);
}
