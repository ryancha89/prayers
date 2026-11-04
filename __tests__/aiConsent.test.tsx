/**
 * Permission before personal data goes to a third-party AI (App Review 5.1.1(i) / 5.1.2(i), 11-04).
 *
 * What must hold: no yes until the person taps agree, a yes belongs to one account, an older
 * version of the disclosure is not a yes, withdrawing undoes it, and the screen names both
 * providers in every language the app ships.
 */
jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __esModule: true,
    default: {
      getItem: async (k: string) => store.get(k) ?? null,
      setItem: async (k: string, v: string) => void store.set(k, v),
      removeItem: async (k: string) => void store.delete(k),
      getAllKeys: async () => [...store.keys()],
    },
  };
});

import {
  AI_CONSENT_VERSION,
  grantAiConsent,
  hasAiConsent,
  useAiConsent,
  withdrawAiConsent,
} from '../src/features/consent/aiConsentStore';
import { aiConsentCopy } from '../src/features/consent/aiConsentCopy';

beforeEach(() => useAiConsent.setState({ byUid: {} }));

test('nobody has agreed until they tap agree', () => {
  expect(hasAiConsent('pr_a')).toBe(false);
  expect(hasAiConsent(null)).toBe(false);
  grantAiConsent('pr_a');
  expect(hasAiConsent('pr_a')).toBe(true);
});

test('a yes belongs to one account', () => {
  grantAiConsent('pr_a');
  expect(hasAiConsent('pr_b')).toBe(false);
});

test('a yes to an older disclosure is not a yes', () => {
  useAiConsent.setState({ byUid: { pr_a: { version: AI_CONSENT_VERSION - 1, at: 1 } } });
  expect(hasAiConsent('pr_a')).toBe(false);
});

test('withdrawing undoes it for that account only', () => {
  grantAiConsent('pr_a');
  grantAiConsent('pr_b');
  withdrawAiConsent('pr_a');
  expect(hasAiConsent('pr_a')).toBe(false);
  expect(hasAiConsent('pr_b')).toBe(true);
});

test.each(['ko', 'en', 'ja', 'zh-CN', 'zh-TW', 'vi'] as const)('the %s screen names both providers', lang => {
  const c = aiConsentCopy(lang);
  const names = c.who.map(w => w.name).join(' ');
  expect(names).toContain('Google');
  expect(names).toContain('Gemini');
  expect(names).toContain('OpenAI');
  expect(c.what.length).toBeGreaterThanOrEqual(5);
});
