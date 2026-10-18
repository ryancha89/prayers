#import <React/RCTBridgeModule.h>
#import <UserNotifications/UserNotifications.h>

/**
 * Local notifications for the daily check-in reminder (10-17, 알림 settings). No server, no push
 * certificate: the phone schedules them itself.
 *
 * One notification per day rather than one repeating trigger, so a day that is already checked in
 * can be left out — `schedule` takes the dates to ring on ("YYYY-MM-DD") and replaces everything this
 * module scheduled before. All ids share PREFIX, so nothing else's notifications are touched.
 */
static NSString *const PREFIX = @"prayers.checkin.";

@interface Reminder : NSObject <RCTBridgeModule>
@end

@implementation Reminder

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

/** "granted" | "denied" | "undetermined" */
RCT_EXPORT_METHOD(status:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [[UNUserNotificationCenter currentNotificationCenter] getNotificationSettingsWithCompletionHandler:^(UNNotificationSettings *s) {
    switch (s.authorizationStatus) {
      case UNAuthorizationStatusNotDetermined: resolve(@"undetermined"); break;
      case UNAuthorizationStatusDenied: resolve(@"denied"); break;
      default: resolve(@"granted");
    }
  }];
}

/** Asks once (the system shows its prompt only the first time); resolves whether it is allowed. */
RCT_EXPORT_METHOD(requestPermission:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [[UNUserNotificationCenter currentNotificationCenter]
      requestAuthorizationWithOptions:(UNAuthorizationOptionAlert | UNAuthorizationOptionSound | UNAuthorizationOptionBadge)
                    completionHandler:^(BOOL granted, NSError *error) { resolve(@(granted)); }];
}

RCT_EXPORT_METHOD(schedule:(NSArray<NSString *> *)dates
                  hour:(nonnull NSNumber *)hour
                  minute:(nonnull NSNumber *)minute
                  title:(NSString *)title
                  body:(NSString *)body
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
  UNUserNotificationCenter *center = [UNUserNotificationCenter currentNotificationCenter];
  [self removeOurs:center then:^{
    for (NSString *date in dates) {
      NSArray<NSString *> *p = [date componentsSeparatedByString:@"-"];
      if (p.count != 3) continue;
      NSDateComponents *when = [NSDateComponents new];
      when.year = p[0].integerValue;
      when.month = p[1].integerValue;
      when.day = p[2].integerValue;
      when.hour = hour.integerValue;
      when.minute = minute.integerValue;
      UNMutableNotificationContent *content = [UNMutableNotificationContent new];
      content.title = title;
      content.body = body;
      content.sound = [UNNotificationSound defaultSound];
      UNCalendarNotificationTrigger *trigger = [UNCalendarNotificationTrigger triggerWithDateMatchingComponents:when repeats:NO];
      NSString *rid = [PREFIX stringByAppendingString:date];
      [center addNotificationRequest:[UNNotificationRequest requestWithIdentifier:rid content:content trigger:trigger]
               withCompletionHandler:nil];
    }
    resolve(@(dates.count));
  }];
}

RCT_EXPORT_METHOD(cancelAll:(RCTPromiseResolveBlock)resolve rejecter:(RCTPromiseRejectBlock)reject)
{
  [self removeOurs:[UNUserNotificationCenter currentNotificationCenter] then:^{ resolve(nil); }];
}

- (void)removeOurs:(UNUserNotificationCenter *)center then:(void (^)(void))done
{
  [center getPendingNotificationRequestsWithCompletionHandler:^(NSArray<UNNotificationRequest *> *pending) {
    NSMutableArray<NSString *> *ids = [NSMutableArray array];
    for (UNNotificationRequest *r in pending) {
      if ([r.identifier hasPrefix:PREFIX]) [ids addObject:r.identifier];
    }
    [center removePendingNotificationRequestsWithIdentifiers:ids];
    done();
  }];
}

@end
