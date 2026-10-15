import { Platform } from 'react-native';

/**
 * Where a bundled sound lives, per platform.
 *
 * ⚠️ ANDROID DOES NOT LOOK IN `assets/`. Every sound in this app was silent on Android — the taps,
 * the bed, the splash chime — while the files were demonstrably inside the APK. Found on BlueStacks
 * on 2026-09-14:
 *
 *     [sfx] ui_tap.m4a did not load
 *     [bgm] could not load prayers_ambient.m4a { message: 'resource not found' }
 *
 * The chain, all of it working as designed and adding up to nothing:
 *
 *  · `react-native-asset` copies non-image, non-font files to `android/.../assets/custom/`.
 *  · `Sound.MAIN_BUNDLE` is `""` on Android — falsy — so react-native-sound treats the name as a
 *    RELATIVE path, lowercases it and strips the extension: "ui_tap.m4a" → "ui_tap".
 *  · Native then asks for a RAW RESOURCE: `getIdentifier("ui_tap", "raw", packageName)`. There is no
 *    res/raw here, so it returns 0, every later branch misses, and the load fails.
 *
 * The library does support the assets folder, through an `asset:/` prefix that
 * `isRelativePath` deliberately excludes from the mangling above. So that is the path Android gets.
 *
 * The alternative — copying all six files into `res/raw` — would ship them twice in the APK and
 * would be undone by the next `npx react-native-asset`.
 */
const ANDROID_ASSET_DIR = 'custom';

/** The first argument to `new Sound(...)` for a file bundled with the app. */
export function bundledSoundPath(file: string): string {
  return Platform.OS === 'android' ? `asset:/${ANDROID_ASSET_DIR}/${file}` : file;
}

/**
 * The second argument. iOS needs the bundle directory; Android must get a FALSY one, or the
 * library joins it onto the path and the `asset:/` prefix stops being a prefix.
 */
export function bundledSoundBase(SoundModule: { MAIN_BUNDLE?: string }): string | undefined {
  return Platform.OS === 'android' ? undefined : SoundModule.MAIN_BUNDLE;
}
