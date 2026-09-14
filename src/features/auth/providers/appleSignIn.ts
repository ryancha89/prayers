import { Platform } from 'react-native';

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
type AppleAuthModule = {
  isSupported: boolean;
  performRequest(options: unknown): Promise<{
    identityToken: string | null;
    authorizationCode: string | null;
    fullName?: { givenName?: string | null; familyName?: string | null } | null;
    email?: string | null;
    user?: string;
  }>;
  Operation: { LOGIN: number };
  Scope: { EMAIL: number; FULL_NAME: number };
};

function load(): AppleAuthModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
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
 * and `email` off it verbatim (`User.from_apple_omniauth`), and every field this app renames on
 * the way through is a field the server silently receives as nil.
 */
export async function requestAppleIdentity(): Promise<unknown> {
  const apple = load();
  if (!apple) {
    throw new Error(
      'Apple Sign In is not in this build — the @invertase/react-native-apple-authentication pod ' +
        'has not been installed.',
    );
  }
  const response = await apple.performRequest({
    requestedOperation: apple.Operation.LOGIN,
    requestedScopes: [apple.Scope.EMAIL, apple.Scope.FULL_NAME],
  });
  if (!response?.identityToken) {
    // Apple returns a response with no token when the user backs out of the sheet.
    throw new Error('Apple returned no identity token — the sign-in was cancelled.');
  }
  return response;
}
