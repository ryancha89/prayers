import { sayGlyphs, spokenText } from '../src/features/counseling/api/sajuGlyphs';

/**
 * The sentences below are REAL, lifted out of the devlog of sessions that actually ran. That
 * matters more than invented cases: the defect was not "the model might emit a Chinese character",
 * it was these exact strings reaching a phone and being read aloud in Chinese mid-English-sentence.
 *
 * Measured over every logged session: 823 Latin-script answers, 79 carrying a Chinese character,
 * and 141 of 141 of those characters were a stem or a branch. That is why a 22-entry table is a
 * complete fix and not a filter that will always lag.
 */

test('the sentences that were actually shipped, said properly', () => {
  expect(
    sayGlyphs('This emphasis comes from 庚 in the month pillar and 酉 beside 癸.', 'en'),
  ).toBe('This emphasis comes from Geng in the month pillar and You beside Gui.');

  expect(sayGlyphs('Your 癸 Water chart suggests a steady pace.', 'en')).toBe(
    'Your Gui Water chart suggests a steady pace.',
  );

  expect(sayGlyphs('With 甲 Wood facing strong Metal, hold your ground.', 'en')).toBe(
    'With Jia Wood facing strong Metal, hold your ground.',
  );
});

test('a pillar is two words, not one run-on', () => {
  // 甲子 is a stem and a branch. "JiaZi" is a word nobody says.
  expect(sayGlyphs('The 甲子 year opens it.', 'en')).toBe('The Jia Zi year opens it.');
});

test('a glyph jammed against a word still comes out as a word', () => {
  // The model writes them both with and without a space; the reader should not be able to tell.
  expect(sayGlyphs('the庚pillar', 'en')).toBe('the Geng pillar');
});

test('Vietnamese gets the names a Vietnamese reader already knows', () => {
  // Not a romanisation of Pinyin — Canh and Dậu are what the pillars are CALLED in Vietnamese.
  expect(sayGlyphs('Trụ tháng có 庚 và 酉 bên cạnh 癸.', 'vi')).toBe(
    'Trụ tháng có Canh và Dậu bên cạnh Quý.',
  );
});

test('Korean says the Hangul', () => {
  expect(sayGlyphs('월주의 庚과 酉가 癸를 돕습니다.', 'ko')).toBe('월주의 경과 유가 계를 돕습니다.');
});

test('Japanese and Chinese keep the characters — there they are the right spelling', () => {
  // The mirror image of the bug: a Japanese reading full of "Geng" would be just as wrong.
  const ja = '癸を支える庚と酉を見ると、流れが分かります。';
  expect(sayGlyphs(ja, 'ja')).toBe(ja);
  expect(sayGlyphs(ja, 'zh-CN')).toBe(ja);
  expect(sayGlyphs(ja, 'zh-TW')).toBe(ja);
});

test('everything that is not a stem or a branch is left alone', () => {
  // The table is deliberately narrow. A reading that quotes 比肩 or 天乙貴人 is a different problem,
  // and quietly mangling it here would hide that rather than fix it.
  const s = 'Your 比肩 shows up beside 庚.';
  expect(sayGlyphs(s, 'en')).toBe('Your 比肩 shows up beside Geng.');
});

test('all 22 glyphs are covered in every language that transliterates', () => {
  // A missing entry would splice `undefined` into a sentence a counselor then reads out.
  const all = '甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥';
  for (const lang of ['en', 'vi'] as const) {
    const said = sayGlyphs(all, lang);
    expect(said).not.toMatch(/undefined/);
    expect(said).not.toMatch(/[㐀-鿿]/);
    expect(said.split(/\s+/).filter(Boolean)).toHaveLength(22);
  }
  // Korean joins: no run here is a real pillar (癸子 has no such day), so no gloss either.
  expect(sayGlyphs(all, 'ko')).toBe('갑을병정무기경신임계자축인묘진사오미신유술해');
});

test('Korean writes a pillar as one word with its hanja — 갑자일(甲子日), never "갑 자일"', () => {
  // The exact answer from the room (16-10, 유나, "내일운은?").
  expect(sayGlyphs('정민 님, 내일인 10월 17일 甲子일은 정관과 편재의 기운이 어우러지는 날이에요.', 'ko')).toBe(
    '정민 님, 내일인 10월 17일 갑자일(甲子日)은 정관과 편재의 기운이 어우러지는 날이에요.',
  );
  expect(sayGlyphs('올해 丙午년과 내년 丁未년', 'ko')).toBe('올해 병오년(丙午年)과 내년 정미년(丁未年)');
  expect(sayGlyphs('10월 戊戌월에는', 'ko')).toBe('10월 무술월(戊戌月)에는');
  expect(sayGlyphs('甲子日에', 'ko')).toBe('갑자일(甲子日)에');
  expect(sayGlyphs('壬申 대운', 'ko')).toBe('임신(壬申) 대운');
});

test('Korean: the model\'s own glosses are normalised, not doubled', () => {
  expect(sayGlyphs('甲子(갑자)일은', 'ko')).toBe('갑자일(甲子日)은');
  expect(sayGlyphs('甲子日(갑자일)은', 'ko')).toBe('갑자일(甲子日)은');
  expect(sayGlyphs('갑자(甲子)일은', 'ko')).toBe('갑자일(甲子日)은');
  const done = '내일은 갑자일(甲子日)이에요.';
  expect(sayGlyphs(done, 'ko')).toBe(done);
});

test('Korean: 일주·월간 are not a pillar\'s unit', () => {
  expect(sayGlyphs('己卯일주인 당신', 'ko')).toBe('기묘(己卯)일주인 당신');
  expect(sayGlyphs('일간 己土', 'ko')).toBe('일간 기土');
});

test('the voice says the pillar once — the hanja gloss is for the eye', () => {
  expect(spokenText('10월 17일 갑자일(甲子日)은 정관(正官)의 날이에요.')).toBe('10월 17일 갑자일은 정관의 날이에요.');
  // Chinese and Japanese parentheses are content there, not a gloss after Hangul.
  const zh = '甲子日（正官）很好。';
  expect(spokenText(zh)).toBe(zh);
});

test('a clean sentence is returned untouched', () => {
  const s = 'Your chart is steady this year.';
  expect(sayGlyphs(s, 'en')).toBe(s);
});

describe('asked in another language (16-10: "영어로 질문했는데 한글이 섞여있어")', () => {
  const { replyLangFor, scriptLang } = require('../src/features/counseling/api/sajuGlyphs');

  it('reads the question by script, only across scripts', () => {
    expect(replyLangFor('How is my love luck this month?', 'ko')).toBe('en');
    expect(replyLangFor('Tháng này tình duyên của tôi thế nào?', 'ko')).toBe('vi');
    expect(replyLangFor('今日の運勢は？', 'ko')).toBe('ja');
    expect(replyLangFor('내일운은?', 'en')).toBe('ko');
    expect(replyLangFor('내일운은?', 'ko')).toBe('ko');
    // Latin in a Latin app, Chinese in either form: the app's own language.
    expect(replyLangFor('thang nay the nao', 'vi')).toBe('vi');
    expect(replyLangFor('Hello', 'vi')).toBe('vi');
    expect(replyLangFor('今天运势如何', 'zh-TW')).toBe('zh-TW');
    expect(replyLangFor('???', 'ko')).toBe('ko');
    expect(scriptLang('The Mu-jin (戊辰) day')).toBe('en');
  });

  it('speaks an English answer without its hanja, and a bare pillar in Pinyin', () => {
    const { spokenText } = require('../src/features/counseling/api/sajuGlyphs');
    expect(spokenText('the upcoming 20th (Mu-jin/戊辰) and 28th (Byeong-ja (丙子))'))
      .toBe('the upcoming 20th (Mu-jin) and 28th (Byeong-ja)');
    expect(spokenText('Tomorrow is a 甲子 day.')).toBe('Tomorrow is a Jia Zi day.');
    // Korean is untouched by this path.
    expect(spokenText('내일인 갑자일(甲子日)은')).toBe('내일인 갑자일은');
  });
});
