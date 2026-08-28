const fs = require('fs');
const path = require('path');

/**
 * @azesmway/react-native-unity hard-requires the Unity export artifacts at
 * build time (iOS podspec copies unity/builds/ios; Android depends on the
 * :unityLibrary Gradle project). Until the Unity project has been exported,
 * autolinking it breaks pod install / gradle sync outright — so only link the
 * platforms whose artifacts actually exist. The JS side already falls back to
 * MockUnityBridge when the native view is absent (bridge/index.ts).
 */
const hasIosUnity = [
  'unity/builds/ios/UnityFramework.framework',
  'unity/builds/ios/UnityFramework.xcframework',
].some(p => fs.existsSync(path.join(__dirname, p)));

const hasAndroidUnity = fs.existsSync(
  path.join(__dirname, 'unity/builds/android/unityLibrary'),
);

module.exports = {
  // Native-bundled assets (splash sound) — linked via `npx react-native-asset`.
  assets: ['./src/shared/assets/sounds'],
  dependencies: {
    '@azesmway/react-native-unity': {
      platforms: {
        ...(hasIosUnity ? {} : { ios: null }),
        ...(hasAndroidUnity ? {} : { android: null }),
      },
    },
  },
};
