import UIKit
import React
import React_RCTAppDelegate
import ReactAppDependencyProvider
import kakao_login
import FirebaseCore

@main
class AppDelegate: UIResponder, UIApplicationDelegate {
  var window: UIWindow?

  var reactNativeDelegate: ReactNativeDelegate?
  var reactNativeFactory: RCTReactNativeFactory?

  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    // Firebase Analytics (11-05): before React starts, so @react-native-firebase finds the default app.
    FirebaseApp.configure()
    let delegate = ReactNativeDelegate()
    let factory = RCTReactNativeFactory(delegate: delegate)
    // After the factory (it installs the OSS flags), before startReactNative. See FabricCommandGuard.mm.
    PrayersEnableSchedulerDelegateInvalidation()
    delegate.dependencyProvider = RCTAppDependencyProvider()

    reactNativeDelegate = delegate
    reactNativeFactory = factory

    window = UIWindow(frame: UIScreen.main.bounds)

    factory.startReactNative(
      withModuleName: "prayers",
      in: window,
      launchOptions: launchOptions
    )

    return true
  }

  // Kakao Login returns here from the KakaoTalk app (kakao{NATIVE_APP_KEY}://oauth). Google and
  // the browser flows use ASWebAuthenticationSession and never come through this door.
  func application(
    _ app: UIApplication,
    open url: URL,
    options: [UIApplication.OpenURLOptionsKey: Any] = [:]
  ) -> Bool {
    // The Swift API itself since kakao_login became a framework (use_frameworks!, 11-05).
    if RNKakaoLogins.isKakaoTalkLoginUrl(url: url) {
      return RNKakaoLogins.handleOpenUrl(url: url)
    }
    return RCTLinkingManager.application(app, open: url, options: options)
  }
}

class ReactNativeDelegate: RCTDefaultReactNativeFactoryDelegate {
  override func sourceURL(for bridge: RCTBridge) -> URL? {
    self.bundleURL()
  }

  override func bundleURL() -> URL? {
#if DEBUG
    RCTBundleURLProvider.sharedSettings().jsBundleURL(forBundleRoot: "index")
#else
    Bundle.main.url(forResource: "main", withExtension: "jsbundle")
#endif
  }
}

/// FabricCommandGuard.mm — declared by symbol name: the app target has no bridging header.
@_silgen_name("PrayersEnableSchedulerDelegateInvalidation")
func PrayersEnableSchedulerDelegateInvalidation()
