#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <AVFoundation/AVFoundation.h>
#import <Speech/Speech.h>

/**
 * Speech-to-text for the story player (11-01: "유저가 선택하거나 말하는 방식"): the player SAYS their
 * line to the cat instead of typing it. Apple's Speech framework, on the device when the language
 * supports it (nothing leaves the phone), Apple's servers otherwise.
 *
 *   start(lang) → Promise<boolean>   false: not allowed / not available for that language
 *   stop()                            finish: the last result arrives as final
 *   events: StorySpeechResult {text, final}, StorySpeechEnd {error?}
 *
 * The audio session is borrowed for the duration and handed back exactly as it was found, so the
 * cat's voice (react-native-sound) plays as before once the player has spoken.
 */
@interface StorySpeech : RCTEventEmitter <RCTBridgeModule>
@end

@implementation StorySpeech {
  AVAudioEngine *_engine;
  SFSpeechRecognizer *_recognizer;
  SFSpeechAudioBufferRecognitionRequest *_request;
  SFSpeechRecognitionTask *_task;
  BOOL _listening;
  BOOL _hasListeners;
  AVAudioSessionCategory _prevCategory;
  AVAudioSessionMode _prevMode;
  AVAudioSessionCategoryOptions _prevOptions;
}

RCT_EXPORT_MODULE();

+ (BOOL)requiresMainQueueSetup { return NO; }

- (NSArray<NSString *> *)supportedEvents { return @[ @"StorySpeechResult", @"StorySpeechEnd" ]; }
- (void)startObserving { _hasListeners = YES; }
- (void)stopObserving { _hasListeners = NO; }

- (void)emit:(NSString *)name body:(NSDictionary *)body
{
  if (_hasListeners) [self sendEventWithName:name body:body];
}

static NSString *LocaleFor(NSString *lang)
{
  NSDictionary *map = @{ @"ko": @"ko-KR", @"en": @"en-US", @"ja": @"ja-JP", @"zh-CN": @"zh-CN",
                         @"zh-TW": @"zh-TW", @"vi": @"vi-VN" };
  return map[lang] ?: @"ko-KR";
}

RCT_EXPORT_METHOD(start:(NSString *)lang resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject)
{
  [SFSpeechRecognizer requestAuthorization:^(SFSpeechRecognizerAuthorizationStatus status) {
    if (status != SFSpeechRecognizerAuthorizationStatusAuthorized) { resolve(@NO); return; }
    [[AVAudioSession sharedInstance] requestRecordPermission:^(BOOL granted) {
      if (!granted) { resolve(@NO); return; }
      dispatch_async(dispatch_get_main_queue(), ^{
        NSError *err = nil;
        BOOL ok = [self begin:lang error:&err];
        if (!ok && err) NSLog(@"[StorySpeech] could not start: %@", err);
        resolve(@(ok));
      });
    }];
  }];
}

- (BOOL)begin:(NSString *)lang error:(NSError **)error
{
  [self teardown:NO];
  _recognizer = [[SFSpeechRecognizer alloc] initWithLocale:[NSLocale localeWithLocaleIdentifier:LocaleFor(lang)]];
  if (!_recognizer.isAvailable) return NO;

  AVAudioSession *session = [AVAudioSession sharedInstance];
  _prevCategory = session.category;
  _prevMode = session.mode;
  _prevOptions = session.categoryOptions;
  if (![session setCategory:AVAudioSessionCategoryPlayAndRecord
                        mode:AVAudioSessionModeMeasurement
                     options:AVAudioSessionCategoryOptionDefaultToSpeaker | AVAudioSessionCategoryOptionAllowBluetoothHFP
                       error:error]) return NO;
  [session setActive:YES withOptions:AVAudioSessionSetActiveOptionNotifyOthersOnDeactivation error:nil];

  _request = [[SFSpeechAudioBufferRecognitionRequest alloc] init];
  _request.shouldReportPartialResults = YES;
  if (_recognizer.supportsOnDeviceRecognition) _request.requiresOnDeviceRecognition = YES;

  _engine = [[AVAudioEngine alloc] init];
  AVAudioInputNode *input = _engine.inputNode;
  AVAudioFormat *format = [input outputFormatForBus:0];
  if (format.sampleRate <= 0) return NO; // no microphone (some simulators)
  SFSpeechAudioBufferRecognitionRequest *request = _request;
  [input installTapOnBus:0 bufferSize:1024 format:format block:^(AVAudioPCMBuffer *buffer, AVAudioTime *when) {
    [request appendAudioPCMBuffer:buffer];
  }];
  [_engine prepare];
  if (![_engine startAndReturnError:error]) return NO;

  __weak StorySpeech *weakSelf = self;
  _task = [_recognizer recognitionTaskWithRequest:_request resultHandler:^(SFSpeechRecognitionResult *result, NSError *err) {
    StorySpeech *me = weakSelf;
    if (!me) return;
    if (result) {
      [me emit:@"StorySpeechResult" body:@{ @"text": result.bestTranscription.formattedString ?: @"",
                                             @"final": @(result.isFinal) }];
    }
    if (err || result.isFinal) {
      dispatch_async(dispatch_get_main_queue(), ^{
        [me teardown:YES];
        [me emit:@"StorySpeechEnd" body:err ? @{ @"error": err.localizedDescription ?: @"" } : @{}];
      });
    }
  }];
  _listening = YES;
  return YES;
}

RCT_EXPORT_METHOD(stop)
{
  dispatch_async(dispatch_get_main_queue(), ^{
    if (!self->_listening) return;
    [self->_engine stop];
    [self->_engine.inputNode removeTapOnBus:0];
    [self->_request endAudio]; // the task delivers its final result, then StorySpeechEnd
  });
}

- (void)teardown:(BOOL)restore
{
  if (_engine) {
    [_engine stop];
    [_engine.inputNode removeTapOnBus:0];
  }
  [_task cancel];
  _engine = nil;
  _request = nil;
  _task = nil;
  BOOL was = _listening;
  _listening = NO;
  if (restore && was && _prevCategory) {
    AVAudioSession *session = [AVAudioSession sharedInstance];
    [session setCategory:_prevCategory mode:_prevMode options:_prevOptions error:nil];
  }
}

- (void)invalidate
{
  dispatch_async(dispatch_get_main_queue(), ^{ [self teardown:YES]; });
  [super invalidate];
}

@end
