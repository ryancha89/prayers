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
              // ⚠️ AN ERROR DOES NOT SURVIVE JSON.stringify. `message` and `stack` are
              // non-enumerable, so `JSON.stringify(new Error('boom'))` is `{}` — and this is the
              // only channel that can carry a warning off the simulator at all. Thirteen console
              // errors in a row on 17-09 arrived as `{"preventSymbolication":true}`, which is just
              // the one extra field RN's ExceptionsManager happens to set: the message and the
              // whole stack were dropped by this line, not by RN.
              if (a instanceof Error) {
                const stack = a.stack ? '\n' + a.stack.split('\n').slice(0, 6).join('\n') : '';
                return `${a.name}: ${a.message}${stack}`;
              }
              try {
                const json = JSON.stringify(a);
                // `{}` from a non-plain object is the same silence by another route — a class
                // instance, a native module handle. Fall back to whatever it can say about itself.
                return json === '{}' && String(a) !== '[object Object]' ? String(a) : json;
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

/**
 * Mirror NATIVE warnings into the sink.
 *
 * The console mirror above cannot see them. A warning raised by native code goes
 * `RCTLog.logIfNoNativeHook` → LogBox's warning handler → `LogBoxData.addLog`, which under RN
 * 0.86's Fusebox console support DROPS every warning and shows the placeholder "Open debugger to
 * view warnings." instead. So the text exists for the length of one call and is then gone: not in
 * the console, not in LogBox's list, not in os_log. Taking the handler over is the only place it
 * can be read without attaching a debugger.
 *
 * (Observing `LogBoxData` was tried first and is useless for exactly that reason — under Fusebox
 * the list it keeps is empty.)
 */
export function installLogBoxMirror(): void {
  if (!__DEV__) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RCTLog = require('react-native/Libraries/Utilities/RCTLog').default;
    RCTLog.setWarningHandler((...args: unknown[]) => {
      devlog('NATIVE-WARN ' + args.map(a => (typeof a === 'string' ? a : String(a))).join(' '));
      // Hand it on. LogBox's own handler is just `registerWarning`, which is what `console.warn`
      // routes to, so the yellow box keeps behaving as it did — ignore list included.
      // eslint-disable-next-line no-console
      console.warn(...args);
    });
  } catch (e) {
    devlog('[devlog] native warning handler unavailable: ' + String(e));
  }
}
