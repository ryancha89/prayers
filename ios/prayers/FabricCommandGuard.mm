#import <Foundation/Foundation.h>

#include <memory>
#include <react/featureflags/ReactNativeFeatureFlags.h>
#include <react/featureflags/ReactNativeFeatureFlagsOverridesOSSStable.h>

/**
 * Turns on React Native's guard against a view command running after its Scheduler is gone.
 *
 * Every RN → Unity message is a Fabric view command (UnityView.postMessage). RN queues each one as
 * a rendering-update lambda that holds a RAW pointer to the Scheduler's delegate. When the Scheduler
 * is torn down (a Metro reload, any JS-side restart) with commands still queued, those lambdas call
 * into the freed delegate: EXC_BAD_ACCESS in Scheduler::uiManagerDidDispatchCommand. The World
 * streams stick + camera commands continuously, so a reload while walking hit it every time — the
 * three simulator crashes of 02-10 all died in that frame.
 *
 * RN 0.86 already ships the fix (an invalidation token checked by the lambda) but gates it behind
 * `enableSchedulerDelegateInvalidation`, default off. React Core is prebuilt here, so the defaults
 * header cannot be patched: the flag is turned on at runtime instead.
 *
 * Call it AFTER RCTReactNativeFactory is created (its init installs the OSS Stable flags once; a
 * second plain override() throws) and BEFORE startReactNative. dangerouslyForceOverride swaps in a
 * fresh accessor, so every other flag keeps its OSS Stable value.
 */
namespace {
class PrayersFeatureFlags : public facebook::react::ReactNativeFeatureFlagsOverridesOSSStable {
 public:
  bool enableSchedulerDelegateInvalidation() override
  {
    return true;
  }
};
} // namespace

extern "C" void PrayersEnableSchedulerDelegateInvalidation(void)
{
  auto accessed = facebook::react::ReactNativeFeatureFlags::dangerouslyForceOverride(
      std::make_unique<PrayersFeatureFlags>());
  if (accessed.has_value()) {
    // Not an error: these were read from the OSS Stable provider, and PrayersFeatureFlags returns
    // the same values for all of them. Logged so a future flag change here is not a silent mismatch.
    NSLog(@"[prayers] feature flags read before the override: %s", accessed->c_str());
  }
  NSLog(@"[prayers] enableSchedulerDelegateInvalidation=%d",
        facebook::react::ReactNativeFeatureFlags::enableSchedulerDelegateInvalidation() ? 1 : 0);
}
