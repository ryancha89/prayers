import { useEffect, useRef } from 'react';
import { NativeEventEmitter, NativeModules, TextInput } from 'react-native';

type Direction = 'up' | 'down' | 'left' | 'right';

/** Held keys → WALK_INPUT's {x, y} (x right, y forward). A diagonal is normalised, so W+D is not faster. */
export function keysVector(held: ReadonlySet<Direction>): { x: number; y: number } {
  let x = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0);
  let y = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0);
  if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
  return { x: +x.toFixed(2), y: +y.toFixed(2) };
}

/**
 * WASD / arrow keys from a hardware keyboard (the Mac's, in the simulator) as the stick (30-10,
 * "컴퓨터로할때 wasd로 이동가능하게"). `onWalk` gets the vector on every change and {0, 0} when the
 * last key lifts. Off while `enabled` is false, and while a text box has focus — typing "dad" into
 * the cafe's question box must not walk the player around the room.
 *
 * Needs the native HardwareKeys module (ios/prayers/HardwareKeys.m); without it (Android, tests)
 * this does nothing.
 */
export function useKeyboardWalk(enabled: boolean, onWalk: (x: number, y: number) => void) {
  const walk = useRef(onWalk);
  walk.current = onWalk;
  useEffect(() => {
    const mod = NativeModules.HardwareKeys;
    if (!enabled || !mod) return;
    const held = new Set<Direction>();
    const sub = new NativeEventEmitter(mod).addListener('HardwareKey', (e: { key: Direction | 'run'; down: boolean }) => {
      if (e.key === 'run') return;
      if (e.down && TextInput.State.currentlyFocusedInput()) return;
      if (e.down) held.add(e.key); else held.delete(e.key);
      const v = keysVector(held);
      walk.current(v.x, v.y);
    });
    return () => {
      sub.remove();
      if (held.size > 0) walk.current(0, 0);
    };
  }, [enabled]);
}

/**
 * Shift held = run (30-10, "shift누르면 달리기"): `onRun(true)` when Shift goes down, `onRun(false)` when
 * it lifts (and on the way out if it was still held). The screen decides what running means — the
 * world's WORLD_RUN, the room's MYROOM_RUN — and puts its own toggle back on release.
 */
export function useKeyboardRun(enabled: boolean, onRun: (held: boolean) => void) {
  const run = useRef(onRun);
  run.current = onRun;
  useEffect(() => {
    const mod = NativeModules.HardwareKeys;
    if (!enabled || !mod) return;
    let held = false;
    const sub = new NativeEventEmitter(mod).addListener('HardwareKey', (e: { key: string; down: boolean }) => {
      if (e.key !== 'run' || e.down === held) return;
      if (e.down && TextInput.State.currentlyFocusedInput()) return;
      held = e.down;
      run.current(held);
    });
    return () => {
      sub.remove();
      if (held) run.current(false);
    };
  }, [enabled]);
}
