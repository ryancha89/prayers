import { Platform } from 'react-native';
import { devlog } from '../devlog';

/**
 * Keep the screen on while something is running that the player is not touching.
 *
 * Ten minutes of breathing with your hands in your lap is ten minutes without a tap, and iOS dims
 * and locks after about a minute of that. The session kept running behind the lock — music, clock,
 * everything — and the player came back to a phone that had decided they were done.
 *
 * GUARDED REQUIRE, the pattern this app already uses for Apple Sign In, IAP and RNSound: the native
 * module is optional, and a build without the pod loses the wake lock rather than the screen. The
 * one rule that comes with it — never leave the lock on. That is why the only public shape here is
 * a hold you close, counted, rather than an on/off pair anyone can get out of step.
 */
type KeepAwakeModule = {
  activateKeepAwake: () => void;
  deactivateKeepAwake: () => void;
};

function load(): KeepAwakeModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@sayem314/react-native-keep-awake');
    return typeof mod?.activateKeepAwake === 'function' ? (mod as KeepAwakeModule) : null;
  } catch {
    return null;
  }
}

let depth = 0;

/** True when this build can actually hold the screen awake. */
export function keepAwakeAvailable(): boolean {
  return Platform.OS !== 'web' && load() !== null;
}

/**
 * Hold the screen awake until the returned function is called. Counted, so two overlapping holders
 * do not cancel each other — the last release is the one that lets go.
 */
export function holdScreenAwake(): () => void {
  const mod = load();
  if (!mod) {
    devlog('[keepAwake] not linked — the screen will dim as usual');
    return () => {};
  }
  depth += 1;
  if (depth === 1) {
    try {
      mod.activateKeepAwake();
      devlog('[keepAwake] on');
    } catch {
      depth = 0;
      return () => {};
    }
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    depth = Math.max(0, depth - 1);
    if (depth === 0) {
      try {
        mod.deactivateKeepAwake();
        devlog('[keepAwake] off');
      } catch {}
    }
  };
}
