#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

/**
 * Whether this build runs on a simulator — a compile-time fact (TARGET_OS_SIMULATOR), exported as
 * a constant so JS can read it synchronously.
 *
 * Why the app needs it (10-15): a dev build on the SIMULATOR buys Prayer Coins through the server's
 * `dev` purchase (no App Store there, and StoreKit on a simulator hangs on a real product), while a
 * dev build on a REAL PHONE must go through the store, sandbox account and all — that is how a
 * purchase gets tested before release. `__DEV__` alone cannot tell the two apart.
 */
@interface DeviceKind : NSObject <RCTBridgeModule>
@end

@implementation DeviceKind

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSDictionary *)constantsToExport
{
#if TARGET_OS_SIMULATOR
  return @{ @"isSimulator": @YES };
#else
  return @{ @"isSimulator": @NO };
#endif
}

@end
