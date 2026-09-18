import { translations, translate } from '../src/shared/i18n/translations';
import { LANGUAGES, isLang, labelFor, DEFAULT_LANG, langFromLocale } from '../src/shared/i18n/store';
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

/**
 * The two defects a read-through does not catch, and a machine does.
 *
 * Nobody native has reviewed the ja / zh-CN / zh-TW strings — including the ones added for the
 * login, account and ticket screens. That review is still owed and these tests do not replace it:
 * tone, register and whether a sentence sounds like a person are exactly what is not checked here.
 * What is checked is the kind of mistake that survives a read because it LOOKS right.
 *
 * The same checks run over Unity's 189 counselor lines in Tools/i18n/audit_translations.py, which
 * found none there either — after its own first version was fixed for reporting the data clean
 * while it was in fact auditing empty strings.
 */
describe('ja / zh strings, the machine-checkable half', () => {
  // High-frequency simplified↔traditional pairs. Not exhaustive and does not need to be: one column
  // copied into the other trips several of these in the first few strings.
  const PAIRS: [string, string][] = [
    ['运', '運'], ['势', '勢'], ['问', '問'], ['时', '時'], ['间', '間'], ['语', '語'],
    ['话', '話'], ['谈', '談'], ['询', '詢'], ['关', '關'], ['开', '開'], ['门', '門'],
    ['学', '學'], ['会', '會'], ['说', '說'], ['请', '請'], ['见', '見'], ['现', '現'],
    ['发', '發'], ['对', '對'], ['应', '應'], ['长', '長'], ['业', '業'], ['东', '東'],
    ['气', '氣'], ['财', '財'], ['号', '號'], ['岁', '歲'], ['选', '選'], ['后', '後'],
    ['单', '單'], ['体', '體'], ['点', '點'], ['还', '還'], ['这', '這'], ['样', '樣'],
    ['结', '結'], ['总', '總'], ['题', '題'], ['码', '碼'], ['几', '幾'], ['帐', '帳'],
  ];
  const SIMPLIFIED = new Set(PAIRS.map(p => p[0]));
  const TRADITIONAL = new Set(PAIRS.map(p => p[1]));

  const offenders = (lang: 'zh-CN' | 'zh-TW', wrong: Set<string>) =>
    Object.entries(translations[lang])
      .map(([key, value]) => {
        const bad = [...new Set([...String(value)].filter(c => wrong.has(c)))];
        return bad.length ? `${key}: ${bad.join('')}` : null;
      })
      .filter(Boolean);

  it('keeps simplified out of the traditional column', () => {
    // The likeliest single defect in this data: zh-CN pasted into zh-TW and never converted.
    expect(offenders('zh-TW', SIMPLIFIED)).toEqual([]);
  });

  it('keeps traditional out of the simplified column', () => {
    expect(offenders('zh-CN', TRADITIONAL)).toEqual([]);
  });

  it('leaves no Korean or Vietnamese inside a ja or zh string', () => {
    // A copy-paste that escaped. Reads as the app switching language mid-sentence.
    const hangul = /[가-힣]/;
    const viet = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;
    const found: string[] = [];
    for (const lang of ['ja', 'zh-CN', 'zh-TW'] as const) {
      for (const [key, value] of Object.entries(translations[lang])) {
        if (hangul.test(String(value))) found.push(`${lang}/${key}: Hangul`);
        if (viet.test(String(value))) found.push(`${lang}/${key}: Vietnamese`);
      }
    }
    expect(found).toEqual([]);
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

describe('langFromLocale', () => {
  it('reads the plain cases, in either separator', () => {
    expect(langFromLocale('vi_VN')).toBe('vi');
    expect(langFromLocale('vi-VN')).toBe('vi');
    expect(langFromLocale('ko_KR')).toBe('ko');
    expect(langFromLocale('ja')).toBe('ja');
    expect(langFromLocale('en-GB')).toBe('en');
  });

  // ⚠️ THIS TEST USED TO ASSERT THE OPPOSITE, and the reversal is the point. It split Chinese by
  // SCRIPT, because sending a Taiwanese reader a Simplified reading was a bug worth a test.
  // Traditional was retired on 18-09: it is gone from LANGUAGES, so nobody can pick it and nothing
  // can land on it. Every `zh` tag now goes to Simplified — still the wrong script for a reader in
  // Taipei, but now a decision somebody made rather than a mistake nobody noticed.
  it('sends every Chinese tag to Simplified, now that Traditional is retired', () => {
    expect(langFromLocale('zh-Hans-CN')).toBe('zh-CN');
    expect(langFromLocale('zh_CN')).toBe('zh-CN');
    expect(langFromLocale('zh-SG')).toBe('zh-CN');
    expect(langFromLocale('zh-Hant-TW')).toBe('zh-CN');
    expect(langFromLocale('zh_TW')).toBe('zh-CN');
    expect(langFromLocale('zh-HK')).toBe('zh-CN');
    expect(langFromLocale('zh-MO')).toBe('zh-CN');
  });

  it('will not offer Traditional in the picker, and drops it if a player had it saved', () => {
    expect(LANGUAGES.map(l => l.code)).not.toContain('zh-TW');
    // isLang reads LANGUAGES, which is what makes a persisted 'zh-TW' fall back to the device
    // instead of stranding that player on a language the build no longer renders.
    expect(isLang('zh-TW')).toBe(false);
  });

  it('is undefined for a language the app is not written in, and for nothing at all', () => {
    // undefined, not DEFAULT_LANG: the caller decides what to fall back to, and a silent 'ko' here
    // is exactly the bug this replaced.
    expect(langFromLocale('fr-FR')).toBeUndefined();
    expect(langFromLocale('')).toBeUndefined();
    expect(langFromLocale(undefined)).toBeUndefined();
    expect(langFromLocale(null)).toBeUndefined();
  });
});
