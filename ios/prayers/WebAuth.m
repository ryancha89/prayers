#import <React/RCTBridgeModule.h>
#import <AuthenticationServices/AuthenticationServices.h>
#import <UIKit/UIKit.h>

/**
 * WebAuth.start(url, scheme) → the callback URL the page redirected to.
 *
 * The system login sheet (ASWebAuthenticationSession) for a web OAuth flow that ends on our own
 * scheme. Kakao login goes through the server this way (10-17): the iOS SDK's token exchange is
 * refused with KOE009 "IOS bundleId validation failed", the REST-key web flow is not. A cancel
 * rejects with code "cancelled" — the login screen treats that as a choice, not a failure.
 */
@interface WebAuth : NSObject <RCTBridgeModule, ASWebAuthenticationPresentationContextProviding>
@property (nonatomic, strong) ASWebAuthenticationSession *session;
@end

@implementation WebAuth

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

RCT_EXPORT_METHOD(start:(NSString *)url
                  scheme:(NSString *)scheme
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  NSURL *target = [NSURL URLWithString:url];
  if (target == nil) { reject(@"bad_url", @"WebAuth: not a URL", nil); return; }

  __weak WebAuth *weakSelf = self;
  self.session = [[ASWebAuthenticationSession alloc]
      initWithURL:target
      callbackURLScheme:scheme
      completionHandler:^(NSURL *callbackURL, NSError *error) {
        weakSelf.session = nil;
        if (callbackURL != nil) { resolve(callbackURL.absoluteString); return; }
        if (error.code == ASWebAuthenticationSessionErrorCodeCanceledLogin) {
          reject(@"cancelled", @"WebAuth: login cancelled", error);
        } else {
          reject(@"failed", error.localizedDescription ?: @"WebAuth: failed", error);
        }
      }];
  self.session.presentationContextProvider = self;
  // Shares Safari's cookies, so someone already signed in to Kakao in Safari is not asked again.
  self.session.prefersEphemeralWebBrowserSession = NO;
  if (![self.session start]) {
    self.session = nil;
    reject(@"failed", @"WebAuth: could not start", nil);
  }
}

- (ASPresentationAnchor)presentationAnchorForWebAuthenticationSession:(ASWebAuthenticationSession *)session
{
  for (UIScene *scene in UIApplication.sharedApplication.connectedScenes) {
    if (![scene isKindOfClass:[UIWindowScene class]]) continue;
    for (UIWindow *w in ((UIWindowScene *)scene).windows) {
      if (w.isKeyWindow) return w;
    }
  }
  return UIApplication.sharedApplication.windows.firstObject;
}

@end
