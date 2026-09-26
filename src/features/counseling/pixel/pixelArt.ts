import type { PixelArt } from './types';

/** One colour of one image: every pixel of that colour as a single SVG path of merged rects. */
export interface PixelLayer {
  /** Palette index — unique per image, unlike `color` (two palette slots may share a hex). */
  index: number;
  color: string;
  d: string;
}

const cache = new Map<string, PixelLayer[]>();

/**
 * A run-length image → one SVG path per colour.
 *
 * Why paths and not a bitmap: RN's <Image> only scales with linear filtering, so a 48px sprite
 * shown at 6x comes out blurred. Rects in a viewBox stay sharp at any size, and the whole cat
 * costs a dozen paths per frame.
 *
 * Runs on the same row become one rect; identical runs on consecutive rows are stacked into one
 * taller rect, which roughly halves the path length. Cached by the string itself — a frame is
 * decoded once per app run, not once per tick.
 */
export function layersFor(art: PixelArt, rle: string, width: number): PixelLayer[] {
  const hit = cache.get(rle);
  if (hit) return hit;

  // run[colour] = [x, y, w, h][] — built row by row
  const runs = new Map<number, number[][]>();
  // open[colour]["x:w"] = the rect that ended on the previous row, extendable downward
  const open = new Map<number, Map<string, number[]>>();
  let x = 0;
  let y = 0;
  let i = 0;
  const pushRun = (color: number, x0: number, len: number, row: number) => {
    let rects = runs.get(color);
    if (!rects) runs.set(color, (rects = []));
    let o = open.get(color);
    if (!o) open.set(color, (o = new Map()));
    const key = `${x0}:${len}`;
    const prev = o.get(key);
    if (prev && prev[1] + prev[3] === row) {
      prev[3] += 1;
    } else {
      const r = [x0, row, len, 1];
      rects.push(r);
      o.set(key, r);
    }
  };

  while (i < rle.length) {
    const sym = rle[i++];
    let digits = '';
    while (i < rle.length && rle[i] >= '0' && rle[i] <= '9') digits += rle[i++];
    let n = digits ? parseInt(digits, 10) : 1;
    const color = sym === '.' ? -1 : art.alphabet.indexOf(sym);
    // a run may wrap past the end of a row; split it there
    while (n > 0) {
      const take = Math.min(n, width - x);
      if (color >= 0) pushRun(color, x, take, y);
      x += take;
      n -= take;
      if (x >= width) {
        x = 0;
        y += 1;
      }
    }
  }

  const layers: PixelLayer[] = [];
  runs.forEach((rects, color) => {
    layers.push({
      index: color,
      color: art.palette[color],
      d: rects.map(([rx, ry, rw, rh]) => `M${rx} ${ry}h${rw}v${rh}h-${rw}z`).join(''),
    });
  });
  cache.set(rle, layers);
  return layers;
}
