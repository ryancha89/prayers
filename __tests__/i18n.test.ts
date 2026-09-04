import { translations, translate } from '../src/shared/i18n/translations';
import { LANGUAGES, isLang, labelFor, DEFAULT_LANG } from '../src/shared/i18n/store';
import { localizeCounselors } from '../src/features/counselors/data/mockCounselors';
import { ui } from '../src/features/counseling/flow/strings';

// The point of this file is the boring half of localization: not "is the Japanese good", which a
// test cannot judge, but "is anything missing, and is anything still in the wrong language".
// A missing key renders as the key itself — a screen full of `my.privacy` — and nothing else in the
// app would report it.
describe('i18n coverage', () => {
  const codes = LANGUAGES.map(l => l.code);
  const koKeys = Object.keys(translations.ko);

  it('ships every language the picker offers', () => {
    codes.forEach(code => {
      expect(translations[code]).toBeDefined();
    });
  });

  it('has every key in every language, with nothing blank', () => {
    codes.forEach(code => {
      const missing = koKeys.filter(k => !(translations as any)[code][k]);
      expect(missing).toEqual([]);
    });
  });

  it('keeps the {token} placeholders identical across languages', () => {
    // A dropped {name} is a sentence with a hole in it, and only in one language.
    const tokensOf = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    koKeys.forEach(key => {
      const expected = tokensOf((translations.ko as any)[key]);
      codes.forEach(code => {
        expect(tokensOf((translations as any)[code][key])).toEqual(expected);
      });
    });
  });

  it('does not leave a language as an untranslated copy of another', () => {
    const joined = codes.map(c => koKeys.map(k => (translations as any)[c][k]).join('|'));
    expect(new Set(joined).size).toBe(codes.length);
  });

  it('interpolates in every language', () => {
    codes.forEach(code => {
      expect(translate(code, 'detail.about', { name: 'Seoyeon' })).toContain('Seoyeon');
    });
  });
});

describe('language store helpers', () => {
  it('accepts only the codes it offers', () => {
    LANGUAGES.forEach(l => expect(isLang(l.code)).toBe(true));
    ['zh', 'kr', '', null, undefined, 'en-US'].forEach(bad => expect(isLang(bad)).toBe(false));
  });

  it('labels each language in its own script', () => {
    expect(labelFor('ja')).toBe('日本語');
    expect(labelFor('vi')).toBe('Tiếng Việt');
    // Simplified and Traditional must not read the same, or the picker offers the same thing twice.
    expect(labelFor('zh-CN')).not.toBe(labelFor('zh-TW'));
  });

  it('falls back rather than rendering an app of missing keys', () => {
    expect(DEFAULT_LANG).toBe('ko');
  });
});

describe('counselor catalog', () => {
  it('localizes every counselor into every language', () => {
    LANGUAGES.forEach(({ code }) => {
      const list = localizeCounselors(code);
      expect(list.length).toBeGreaterThan(0);
      list.forEach(c => {
        expect(c.name).toBeTruthy();
        expect(c.title).toBeTruthy();
        expect(c.hook).toBeTruthy();
        expect(c.about).toBeTruthy();
        expect(c.specialties.length).toBeGreaterThan(0);
      });
    });
  });

  it('gives Simplified and Traditional their own copy', () => {
    const cn = localizeCounselors('zh-CN')[0];
    const tw = localizeCounselors('zh-TW')[0];
    expect(cn.about).not.toBe(tw.about);
  });
});

describe('consultation copy RN owns', () => {
  it('answers in every language, and never returns the raw key', () => {
    LANGUAGES.forEach(({ code }) => {
      const sent = ui('loop.send', code);
      expect(sent).toBeTruthy();
      expect(sent).not.toBe('loop.send');
    });
  });
});
