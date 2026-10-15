#import <React/RCTBridgeModule.h>

/**
 * Guards against the embedded Unity player outliving a JS context.
 *
 * A Metro reload (and any future JS-side restart) tears down the React tree
 * WITHOUT running component cleanups, so nobody sends SESSION_END and the
 * Unity BGM keeps playing over the fresh JS app. iOS UaaL never unloads, so
 * the instance — and its audio — survives until the process dies.
 *
 * JS calls silenceSurvivingUnity() once per context (bridge/index.ts). If a
 * booted UnityFramework instance survived, it gets a SESSION_END (the Unity
 * RNBridge mutes AudioListener at the transport layer) and JS learns via the
 * resolved bool that Unity is alive, so NativeUnityBridge can take the
 * resume path instead of waiting for a UNITY_READY that will never come.
 *
 * UnityFramework is reached via NSBundle/NSInvocation instead of headers —
 * the framework is vendored by react-native-unity and only present when the
 * Unity export exists, so this module must not link against it.
 */
@interface UnityLifecycle : NSObject <RCTBridgeModule>
@end

@implementation UnityLifecycle

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

RCT_EXPORT_METHOD(silenceSurvivingUnity:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    NSString *path = [[[NSBundle mainBundle] bundlePath]
        stringByAppendingString:@"/Frameworks/UnityFramework.framework"];
    NSBundle *bundle = [NSBundle bundleWithPath:path];
    // NSBundle instances are cached per path, so isLoaded reflects whether
    // RNUnityView ever booted Unity in this process. Never load it here.
    if (bundle == nil || ![bundle isLoaded]) {
      resolve(@NO);
      return;
    }

    Class ufwClass = [bundle principalClass];
    if (![ufwClass respondsToSelector:NSSelectorFromString(@"getInstance")]) {
      resolve(@NO);
      return;
    }
#pragma clang diagnostic push
#pragma clang diagnostic ignored "-Warc-performSelector-leaks"
    id ufw = [ufwClass performSelector:NSSelectorFromString(@"getInstance")];
    id appController =
        [ufw respondsToSelector:NSSelectorFromString(@"appController")]
            ? [ufw performSelector:NSSelectorFromString(@"appController")]
            : nil;
#pragma clang diagnostic pop
    if (appController == nil) {
      // Framework code loaded but the player never ran — nothing audible.
      resolve(@NO);
      return;
    }

    SEL sendSel = NSSelectorFromString(@"sendMessageToGOWithName:functionName:message:");
    if (![ufw respondsToSelector:sendSel]) {
      resolve(@NO);
      return;
    }
    // C-string parameters rule out performSelector; invoke manually.
    NSMethodSignature *sig = [ufw methodSignatureForSelector:sendSel];
    NSInvocation *inv = [NSInvocation invocationWithMethodSignature:sig];
    inv.target = ufw;
    inv.selector = sendSel;
    const char *gameObject = "RNBridge";
    const char *method = "OnMessage";
    const char *message = "{\"type\":\"SESSION_END\"}";
    [inv setArgument:&gameObject atIndex:2];
    [inv setArgument:&method atIndex:3];
    [inv setArgument:&message atIndex:4];
    [inv invoke];
    resolve(@YES);
  });
}

@end
