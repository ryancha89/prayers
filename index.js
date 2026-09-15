/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
// ⚠️ IMPORT ORDER IS LOAD-BEARING, and it was wrong.
//
// Imports are evaluated before any statement in this file runs, so installing the mirrors here
// while `./src/App` was imported above them meant every warning raised while the app's module
// graph loaded — a whole screen tree plus its libraries — happened before anything was watching,
// and before `ignoreLogs` had registered a single pattern. `App` is required lazily below instead,
// so this file's first act is to start listening.
import { installDevlogConsoleMirror, installLogBoxMirror } from './src/shared/devlog';
import { name as appName } from './app.json';

// The one warning the app raises on a clean start, and it is not ours.
//
// Measured 2026-09-15 by taking over `RCTLog.setWarningHandler`: it is a NATIVE warning, raised
// 0-5 times in the same millisecond during the first commit, and the values behind it belong to
// react-native-screens — its `<Screen>` passes `onTransitionProgress` and `onHeaderHeightChange`
// as native `Animated.event`s. RN 0.86's `createAnimatedPropsHook` subscribes to those by calling
// `startListeningToAnimatedNodeValue` FIRST and subscribing to the event emitter a beat later, and
// a frame that lands in between is delivered to a module whose listener count is still zero. It
// races: some launches print five, some print none. Nothing in this repo can order those two calls.
//
// Silenced by pattern rather than left to shout, because a log with a permanent warning in it is a
// log nobody reads — and it is the ONLY thing standing between this app and a clean boot. Native
// warnings still reach the devlog sink in full (`NATIVE-WARN`), so nothing goes dark by hiding it.
if (__DEV__) {
  LogBox.ignoreLogs([
    /Sending `onAnimatedValueUpdate` with no listeners registered/,
    // The price of the native-warning mirror below: reaching `RCTLog` at all means a deep import,
    // and RN warns about deep imports. Silencing our own tooling, not a defect in the app.
    /Deep imports from the 'react-native' package are deprecated/,
  ]);
}

// Before anything else registers: the warnings worth reading are raised during boot and during a
// consultation, and both are invisible from outside the app otherwise. No-op unless __DEV__.
installDevlogConsoleMirror();
// ...and LogBox's own list, which holds the warnings the console never sees (native ones), and the
// text RN 0.86 hides behind "Open debugger to view warnings."
installLogBoxMirror();

AppRegistry.registerComponent(appName, () => require('./src/App').default);

