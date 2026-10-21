jest.mock('@invertase/react-native-apple-authentication', () => ({
  appleAuth: {
    isSupported: true,
    Operation: { LOGIN: 1 },
    Scope: { FULL_NAME: 0, EMAIL: 1 },
    Error: { CANCELED: '1001' },
    performRequest: jest.fn(),
  },
}));
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(), hasPlayServices: jest.fn(),
    signIn: jest.fn(), signOut: jest.fn(async () => null),
  },
}));

import { Platform } from 'react-native';
import { appleAuth } from '@invertase/react-native-apple-authentication';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { appleSignInAvailable, requestAppleIdentity } from '../src/features/auth/providers/appleSignIn';
import { requestGoogleIdentity } from '../src/features/auth/providers/googleSignIn';
import { isSignInCancelled } from '../src/features/auth/providers/signInError';

beforeEach(() => { jest.clearAllMocks(); });

it('offers Apple only on supported iOS builds', () => {
  expect(appleSignInAvailable()).toBe(true);
  const os = jest.replaceProperty(Platform, 'OS', 'android');
  expect(appleSignInAvailable()).toBe(false);
  os.restore();
});

it('passes Apple first-login identity and name fields through to the server adapter', async () => {
  const response = { identityToken: 'signed-jwt', authorizationCode: 'code', user: 'apple-sub', fullName: { givenName: 'Luna' } };
  jest.mocked(appleAuth.performRequest).mockResolvedValue(response as any);
  expect(await requestAppleIdentity()).toBe(response);
  expect(appleAuth.performRequest).toHaveBeenCalledWith({ requestedOperation: 1, requestedScopes: [0, 1] });
});

it('handles repeat Apple sign-in when name and email are no longer returned', async () => {
  const response = { identityToken: 'signed-jwt', fullName: null, email: null };
  jest.mocked(appleAuth.performRequest).mockResolvedValue(response as any);
  expect(await requestAppleIdentity()).toBe(response);
});

it('recognizes a native Apple cancellation object without hiding configuration failures', async () => {
  jest.mocked(appleAuth.performRequest).mockRejectedValue({ code: '1001' });
  expect(await requestAppleIdentity().catch(isSignInCancelled)).toBe(true);
  jest.mocked(appleAuth.performRequest).mockRejectedValue({ code: '1000' });
  expect(await requestAppleIdentity().catch(isSignInCancelled)).toBe(false);
});

it('treats a missing Apple token as a retryable failure, not cancellation', async () => {
  jest.mocked(appleAuth.performRequest).mockResolvedValue({ identityToken: null } as any);
  await expect(requestAppleIdentity()).rejects.toThrow('no identity token');
  expect(await requestAppleIdentity().catch(isSignInCancelled)).toBe(false);
});

it('does not check Android Play Services on iOS and preserves Google identity', async () => {
  const data = { idToken: 'signed-jwt', user: { name: 'Luna' } };
  jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'success', data } as any);
  expect(await requestGoogleIdentity()).toBe(data);
  expect(GoogleSignin.hasPlayServices).not.toHaveBeenCalled();
});

it('distinguishes Google cancellation from a successful response missing its token', async () => {
  jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'cancelled', data: null });
  expect(await requestGoogleIdentity().catch(isSignInCancelled)).toBe(true);
  jest.mocked(GoogleSignin.signIn).mockResolvedValue({ type: 'success', data: { idToken: null } } as any);
  await expect(requestGoogleIdentity()).rejects.toThrow('no identity token');
});
