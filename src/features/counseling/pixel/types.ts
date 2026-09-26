/** Shape of `catArt.generated.ts`. Every image is a run-length string — see `pixelArt.ts`. */
export interface PixelAnim {
  fps: number;
  /** A loop repeats; a one-shot gesture plays once and hands back to the loop underneath it. */
  loop: boolean;
  frames: string[];
}

export interface PixelArt {
  palette: string[];
  /** The symbols the run-length strings use, in palette order. */
  alphabet: string;
  /** The room is `w` x `h` art pixels; the 48x48 cat frame sits at (catX, catY) inside it. */
  room: { w: number; h: number; catX: number; catY: number; catSize: number };
  background: string;
  ambient: string[];
  anims: Record<string, PixelAnim>;
}
