/**
 * The two documents render, in every language the app offers.
 *
 * Cheap, and it catches the two ways this breaks silently: a language with no document (ja and the
 * two Chinese fall back to English on purpose — a machine-translated privacy policy is a promise
 * nobody checked), and a section whose text went missing in an edit, which would ship a heading
 * with nothing under it.
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

import { docFor, type LegalDoc } from '../src/features/profile/data/legalDocs';
import { LANGUAGES } from '../src/shared/i18n';

const DOCS: LegalDoc[] = ['terms', 'privacy'];

test('every language resolves both documents, with no empty section', () => {
  for (const { code: lang } of LANGUAGES) {
    for (const doc of DOCS) {
      const d = docFor(doc, lang);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.sections.length).toBeGreaterThan(2);
      for (const section of d.sections) {
        expect(section.heading.length).toBeGreaterThan(0);
        expect(section.body.length).toBeGreaterThan(0);
        expect(section.body.every(line => line.trim().length > 0)).toBe(true);
      }
    }
  }
});

test('the privacy policy says the three things a reviewer looks for', () => {
  const en = docFor('privacy', 'en');
  const text = en.sections.flatMap(s => [s.heading, ...s.body]).join(' ').toLowerCase();
  // What is collected, that a third party processes it, and how to delete the account. Each of
  // these is a claim about what the code actually does — see the header of legalDocs.ts.
  expect(text).toContain('birth');
  expect(text).toContain('third-party ai');
  expect(text).toContain('delete');
});

test('the privacy policy declares every permission Info.plist asks for', () => {
  // Until 28-10 the policy said "no photos, no microphone or camera access" while the app asked for
  // all three. Reading the plist keeps the two from drifting apart again.
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');
  const plist = fs.readFileSync(path.join(__dirname, '../ios/prayers/Info.plist'), 'utf8');
  const text = docFor('privacy', 'en').sections.flatMap(s => s.body).join(' ').toLowerCase();
  const declared: Record<string, string> = {
    NSCameraUsageDescription: 'camera',
    NSMicrophoneUsageDescription: 'microphone',
    NSPhotoLibraryUsageDescription: 'photos',
  };
  for (const [key, word] of Object.entries(declared)) {
    if (plist.includes(`<key>${key}</key>`)) expect(text).toContain(word);
  }
  expect(text).not.toMatch(/no photos|no microphone|no camera/);
});

test('the terms do not promise a provider the app does not offer', () => {
  // saju_front's document names KakaoTalk and Google. Copying it over would have been a false
  // declaration; this test is what stops that copy-paste coming back.
  const all = LANGUAGES.flatMap(({ code }) =>
    DOCS.flatMap(doc => docFor(doc, code).sections.flatMap(s => [s.heading, ...s.body])),
  ).join(' ');
  expect(all).not.toMatch(/Kakao/i);
  expect(all).not.toMatch(/Manse Calendar/i);
});

test('every language states the purchase-record retention that account deletion keeps', () => {
  // Until 29-10 the policy said deletion removed "coins" with no exception, while the server
  // (saju_server Api::V1::Prayers::AccountController#destroy) keeps store purchase rows for 5 years.
  // Each written-out language must name the exception, the period and the law; ja and both Chinese
  // fall back to English and are checked through that fallback.
  const retention: Record<string, RegExp[]> = {
    'Privacy Policy': [/5 years/, /Act on Consumer Protection in Electronic Commerce/, /transaction ID/],
    '개인정보 처리방침': [/5년/, /전자상거래 등에서의 소비자보호에 관한 법률/, /거래 ID/],
    'Chính sách quyền riêng tư': [/5 năm/, /thương mại điện tử/, /mã giao dịch/],
  };
  for (const { code: lang } of LANGUAGES) {
    const d = docFor('privacy', lang);
    const patterns = retention[d.title];
    expect(patterns).toBeDefined();
    const text = d.sections.flatMap(s => s.body).join(' ');
    for (const p of patterns) expect(text).toMatch(p);
  }
});
