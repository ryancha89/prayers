#import <React/RCTEventEmitter.h>
#import <GameController/GameController.h>

/**
 * WASD (and the arrow keys) from a hardware keyboard, for walking the 3D rooms (30-10, "컴퓨터로할때
 * wasd로 이동가능하게"): the Mac's keyboard in the simulator, or a keyboard paired with an iPad.
 *
 * GCKeyboard, not UIKeyCommand: key commands only reach the first responder, and in these screens
 * that is whatever RN or Unity view last took focus — the room would stop listening the moment the
 * player tapped the 3D view. GCKeyboard hears the keyboard app-wide while the app is active.
 *
 * Emits `HardwareKey` {key: 'up'|'down'|'left'|'right'|'run' (Shift), down: bool} on every change, and only while
 * JS is listening (startObserving / stopObserving), so a screen without a stick costs nothing.
 */
@interface HardwareKeys : RCTEventEmitter
@end

@implementation HardwareKeys {
  BOOL _observing;
  id _connectObserver;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup
{
  return NO;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[ @"HardwareKey" ];
}

static NSString *DirectionFor(GCKeyCode code)
{
  if (code == GCKeyCodeKeyW || code == GCKeyCodeUpArrow) return @"up";
  if (code == GCKeyCodeKeyS || code == GCKeyCodeDownArrow) return @"down";
  if (code == GCKeyCodeKeyA || code == GCKeyCodeLeftArrow) return @"left";
  if (code == GCKeyCodeKeyD || code == GCKeyCodeRightArrow) return @"right";
  if (code == GCKeyCodeLeftShift || code == GCKeyCodeRightShift) return @"run";
  return nil;
}

- (void)attach:(GCKeyboard *)keyboard API_AVAILABLE(ios(14.0))
{
  __weak HardwareKeys *weakSelf = self;
  keyboard.keyboardInput.keyChangedHandler = ^(GCKeyboardInput *input, GCControllerButtonInput *key, GCKeyCode code, BOOL pressed) {
    HardwareKeys *strongSelf = weakSelf;
    NSString *direction = DirectionFor(code);
    if (!strongSelf || !strongSelf->_observing || !direction) return;
    [strongSelf sendEventWithName:@"HardwareKey" body:@{ @"key" : direction, @"down" : @(pressed) }];
  };
}

- (void)startObserving
{
  _observing = YES;
  if (@available(iOS 14.0, *)) {
    dispatch_async(dispatch_get_main_queue(), ^{
      if (GCKeyboard.coalescedKeyboard) [self attach:GCKeyboard.coalescedKeyboard];
      // A keyboard connected later (or the simulator's, which can appear after launch).
      if (!self->_connectObserver) {
        __weak HardwareKeys *weakSelf = self;
        self->_connectObserver = [[NSNotificationCenter defaultCenter]
            addObserverForName:GCKeyboardDidConnectNotification
                        object:nil
                         queue:[NSOperationQueue mainQueue]
                    usingBlock:^(NSNotification *note) {
                      if ([note.object isKindOfClass:[GCKeyboard class]]) [weakSelf attach:note.object];
                    }];
      }
    });
  }
}

- (void)stopObserving
{
  _observing = NO;
}

- (void)invalidate
{
  if (_connectObserver) [[NSNotificationCenter defaultCenter] removeObserver:_connectObserver];
  _connectObserver = nil;
  [super invalidate];
}

@end
