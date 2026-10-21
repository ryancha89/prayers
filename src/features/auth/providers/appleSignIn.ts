import { Platform } from 'react-native';
import { SignInCancelledError } from './signInError';

/**
 * Apple Sign In, behind a guarded require.
 *
 * The native module is a pod. A bundle built before that pod was installed must not CRASH on the
 * import — it must say "not available in this build", because that is exactly the state a
 * half-finished setup leaves behind and a red screen there costs an hour of looking in the wrong
 * place. Same shape as the Unity bridge's own native-module probe.
 *
 * Apple also needs the `Sign In with Apple` capability on the app target. Without it
 * `performRequest` rejects at runtime with an Apple error rather than anything this file can
 * detect in advance, so the caller surfaces the message instead of swallowing it.
 */
type AppleAuthModule = typeof import('@invertase/react-native-apple-authentication').appleAuth;

function load(): AppleAuthModule | null {
  try {
    const mod = require('@invertase/react-native-apple-authentication');
    return (mod?.appleAuth ?? null) as AppleAuthModule | null;
  } catch {
    return null;
  }
}

export function appleSignInAvailable(): boolean {
  if (Platform.OS !== 'ios') return false;
  const apple = load();
  return apple != null && apple.isSupported === true;
}

/**
 * Returns the provider's own response object, unchanged.
 *
 * Deliberately not reshaped: saju_server reads `identityToken`, `authorizationCode`, `fullName`
 * and `email` off it in the Prayers auth controller, and every field this app renames on
 * the way through is a field the server silently receives as nil.
 */
export async function requestAppleIdentity(): Promise<unknown> {
  const apple = load();
  if (Platform.OS !== 'ios' || !apple?.isSupported) {
    throw new Error(
      'Apple Sign In is not in this build — the @invertase/react-native-apple-authentication pod ' +
        'has not been installed.',
    );
  }
  const response = await apple.performRequest({
    requestedOperation: apple.Operation.LOGIN,
    requestedScopes: [apple.Scope.FULL_NAME, apple.Scope.EMAIL],
  }).catch((error: unknown) => {
    if (error && typeof error === 'object' && 'code' in error && String(error.code) === apple.Error.CANCELED) {
      throw new SignInCancelledError();
    }
    throw error;
  });
  if (!response?.identityToken) {
    throw new Error('Apple returned no identity token. Please try signing in again.');
  }
  return response;
}
