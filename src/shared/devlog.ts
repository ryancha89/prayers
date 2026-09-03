/**
 * Dev-only log sink for the things nobody can see from outside the app.
 *
 * WHY THIS EXISTS
 * The embedded consultation fails in ways that leave no readable trace anywhere:
 *
 *  · Unity's own `Debug.Log` does NOT reach the device log once the player runs inside a host app.
 *    Only its two startup banners (version, MemoryManager) come through; everything after that —
 *    the room loading, `auto_seat_failed`, the oracle's verdict — is invisible.
 *  · React Native no longer forwards `console.log` to Metro; it goes to React Native DevTools only.
 *    So the one message that explains a room leaving — `[room] session error: <reason>` — lives in a
 *    LogBox toast that a human has to tap open and read aloud.
 *
 * Between the two, a session that opens, shows the counselor and then throws the player back to the
 * conversation list produces exactly one artefact: a yellow box. This POSTs the same lines to a
 * plain HTTP sink on the Mac (the simulator shares the host's localhost), so a session can be read
 * after the fact instead of narrated live.
 *
 * Start the sink with:  node Tools/devlog_sink.js
 * Nothing listening is the normal case — the fetch fails and is swallowed. This must never be able
 * to affect the app it is watching.
 */
const SINK = 'http://localhost:8099/log';

/** Off in release: `__DEV__` is false and every call below returns immediately. */
export function devlog(line: string): void {
  if (!__DEV__) return;
  try {
    fetch(SINK, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: `${new Date().toISOString()} ${line}`,
    }).catch(() => {});
  } catch {}
}

/**
 * Mirror console.warn/error into the sink as well.
 *
 * The message that actually explains a failed session is a `console.warn` inside
 * CounselingRoomScreen, not anything this module's callers emit. Wrapping the console is the only
 * way to catch it — and every other warning the app raises — without threading `devlog` through
 * code that has no reason to know about it.
 *
 * Idempotent: a Fast Refresh re-runs the module, and wrapping a wrapper each time would multiply
 * every line.
 */
let installed = false;

export function installDevlogConsoleMirror(): void {
  if (!__DEV__ || installed) return;
  installed = true;

  const wrap = (level: 'warn' | 'error') => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);
      devlog(
        `${level.toUpperCase()} ` +
          args
            .map(a => {
              if (typeof a === 'string') return a;
              try {
                return JSON.stringify(a);
              } catch {
                return String(a);
              }
            })
            .join(' '),
      );
    };
  };

  wrap('warn');
  wrap('error');
}
