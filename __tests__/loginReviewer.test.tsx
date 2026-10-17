/**
 * The store-review door on the login screen: a quiet "Sign in with email" link that opens an
 * email + password form posting to `/api/v1/prayers/auth/reviewer`. A refusal shows the ordinary
 * login error line; nobody is signed in.
 */
jest.mock('../src/shared/devlog', () => ({ devlog: () => {} }));
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: { getItem: async () => null, setItem: async () => {}, removeItem: async () => {} },
}));
jest.mock('react-native-sound', () => null, { virtual: true });
jest.mock('../src/features/auth/providers/appleSignIn', () => ({
  appleSignInAvailable: () => false,
  requestAppleIdentity: jest.fn(),
}));
jest.mock('../src/features/auth/providers/googleSignIn', () => ({
  googleSignInAvailable: () => false,
  requestGoogleIdentity: jest.fn(),
}));
jest.mock('../src/features/auth/providers/kakaoSignIn', () => ({
  kakaoSignInAvailable: () => false,
  requestKakaoIdentity: jest.fn(),
}));
jest.mock('../src/features/settings/languageSync', () => ({ syncAccountLanguage: async () => {} }));

import React from 'react';
import ReactTestRenderer, { act } from 'react-test-renderer';
import { LoginScreen } from '../src/features/auth/screens/LoginScreen';
import { getUserAuth, signedOut, useAuthStore } from '../src/features/auth/store/authStore';
import { useLanguageStore } from '../src/shared/i18n';
import { translations } from '../src/shared/i18n/translations';

type FetchMock = jest.Mock<Promise<Response>, [string, RequestInit?]>;
const realFetch = globalThis.fetch;

beforeEach(() => {
  signedOut();
  useLanguageStore.setState({ lang: 'en' });
});
afterEach(() => {
  (globalThis as unknown as { fetch: typeof realFetch }).fetch = realFetch;
  signedOut();
});

const textOf = (r: ReactTestRenderer.ReactTestRenderer) =>
  r.root
    .findAll(n => typeof n.props.children === 'string')
    .map(n => n.props.children as string);

async function openForm() {
  let r!: ReactTestRenderer.ReactTestRenderer;
  await act(async () => {
    r = ReactTestRenderer.create(<LoginScreen />);
  });
  expect(textOf(r)).toContain('Sign in with email');
  await act(async () => {
    r.root.findByProps({ testID: 'login-email-link' }).props.onPress();
  });
  await act(async () => {
    r.root.findByProps({ testID: 'login-email-input' }).props.onChangeText('reviewer@example.com');
    r.root.findByProps({ testID: 'login-password-input' }).props.onChangeText('pw');
  });
  return r;
}

it('every language has the reviewer form strings, and English says exactly "Sign in with email"', () => {
  expect((translations as any).en['login.emailLink']).toBe('Sign in with email');
  for (const lang of ['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi']) {
    for (const k of ['login.emailLink', 'login.emailPlaceholder', 'login.passwordPlaceholder', 'login.emailSubmit']) {
      expect((translations as any)[lang]?.[k]).toEqual(expect.any(String));
    }
  }
});

it('a refused reviewer login shows the plain login error and signs nobody in', async () => {
  const fn: FetchMock = jest.fn((_u: string, _i?: RequestInit) =>
    Promise.resolve({ ok: false, status: 401, json: async () => ({ result: 'signup_failed' }) } as Response),
  );
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  const r = await openForm();

  await act(async () => {
    r.root.findByProps({ testID: 'login-email-submit' }).props.onPress();
  });

  expect(fn.mock.calls[0][0]).toMatch(/\/api\/v1\/prayers\/auth\/reviewer$/);
  expect(JSON.parse(fn.mock.calls[0][1]?.body as string)).toEqual({ email: 'reviewer@example.com', password: 'pw' });
  expect(r.root.findByProps({ testID: 'login-email-error' }).props.children).toBe('Could not sign in. Please try again.');
  expect(getUserAuth()).toBeNull();
});

it('an accepted reviewer login signs in as provider reviewer', async () => {
  const fn: FetchMock = jest.fn((url: string) =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: async () =>
        url.endsWith('/game/token')
          ? { success: true, token: 'pgt_r', expires_at: new Date(Date.now() + 3_600_000).toISOString() }
          : { result: 'loggedin', user_auth: 'pr_r', name: 'App Reviewer', provider: 'reviewer' },
    } as Response),
  );
  (globalThis as unknown as { fetch: FetchMock }).fetch = fn;
  const r = await openForm();

  await act(async () => {
    r.root.findByProps({ testID: 'login-email-submit' }).props.onPress();
  });

  expect(useAuthStore.getState()).toMatchObject({ userAuth: 'pr_r', provider: 'reviewer', gameToken: 'pgt_r' });
});
