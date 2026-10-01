import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { LayoutChangeEvent, LayoutRectangle } from 'react-native';
import type { ViewInsetsPayload } from '../types';

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
export function useViewInsets(opts: {
  send?: (insets: ViewInsetsPayload) => void;
  landscape: boolean;
  compute: (rects: MeasuredRects) => CoveredPx | null;
}) {
  const rects = useRef<MeasuredRects>({});
  const latest = useRef(opts);
  latest.current = opts;
  const handlers = useRef<Record<string, (e: LayoutChangeEvent) => void>>({});

  const flush = useCallback(() => {
    const { send, landscape, compute } = latest.current;
    const host = rects.current.host;
    if (!send || !host || host.width <= 0 || host.height <= 0) return;
    const covered = compute(rects.current);
    if (covered) send(viewInsetsOf(host, covered, landscape));
  }, []);

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
