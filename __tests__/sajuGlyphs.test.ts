import { sayGlyphs } from '../src/features/counseling/api/sajuGlyphs';

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
  for (const lang of ['en', 'vi', 'ko'] as const) {
    const said = sayGlyphs(all, lang);
    expect(said).not.toMatch(/undefined/);
    expect(said).not.toMatch(/[㐀-鿿]/);
    expect(said.split(/\s+/).filter(Boolean)).toHaveLength(22);
  }
});

test('a clean sentence is returned untouched', () => {
  const s = 'Your chart is steady this year.';
  expect(sayGlyphs(s, 'en')).toBe(s);
});
