import type { Lang } from '../../../shared/i18n';

/**
 * The stems and branches, said in the language the counselor is speaking.
 *
 * THE BUG. An English reading came back with bare Chinese characters in it:
 *
 *     "This emphasis comes from 庚 in the month pillar and 酉 beside 癸."
 *
 * and the voice read them aloud as Chinese, mid-sentence, in an English answer. Measured across
 * every logged session: 823 Latin-script answers, 79 of them (9%) carrying a Chinese character —
 * and **141 out of 141 of those characters were a heavenly stem or an earthly branch**. Not one
 * came from anywhere else. So this is a bounded problem with a 22-entry answer, not a general
 * "strip the CJK" problem.
 *
 * WHY THEY LEAK, AND WHY THE SERVER IS NOT THE PLACE TO STOP IT. The chart is computed in stems and
 * branches; they are the notation, the way sharps and flats are. The prompt carries them because
 * the reading cannot be derived without them, and the model quotes its working. Telling the server
 * to suppress them would also reach saju_front, whose documented English standard deliberately
 * prints the characters ("Shoulder (比肩)") on a screen nobody reads aloud. Prayers is the client
 * that SPEAKS, so Prayers is where the reading gets said out loud properly.
 *
 * WHY NOT JUST DELETE THEM. "This emphasis comes from in the month pillar" is a broken sentence,
 * and the stem is the subject of it. They are transliterated, not removed.
 *
 * ja / zh-CN / zh-TW get the characters untouched — there they are the correct spelling, and a
 * Japanese reading full of "Geng" would be the same bug pointed the other way.
 */

/** 10 heavenly stems, then 12 earthly branches, in canonical order. */
const STEMS = '甲乙丙丁戊己庚辛壬癸';
const BRANCHES = '子丑寅卯辰巳午未申酉戌亥';

/**
 * Pinyin for English, per the standard saju_server's own guide sets out (甲 → Jia, 庚 → Geng).
 *
 * ⚠️ 戊 and 午 are both "Wu". That is Pinyin's collision, not a typo, and it is the one place this
 * table loses information a reader could have recovered from the character. Spoken aloud — which is
 * the case this exists for — it costs nothing: nobody hears the difference in the original either.
 */
const PINYIN_STEMS = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui'];
const PINYIN_BRANCHES = ['Zi', 'Chou', 'Yin', 'Mao', 'Chen', 'Si', 'Wu', 'Wei', 'Shen', 'You', 'Xu', 'Hai'];

/** Sino-Vietnamese. These are the names a Vietnamese reader already knows the pillars by — Canh,
 *  Quý, Dậu — so this is the natural spelling, not a romanisation of a foreign one. */
const VI_STEMS = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const VI_BRANCHES = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

/** Hangul. Korean prints the hanja in scholarly text but says the Hangul, and this is speech. */
const KO_STEMS = ['갑', '을', '병', '정', '무', '기', '경', '신', '임', '계'];
const KO_BRANCHES = ['자', '축', '인', '묘', '진', '사', '오', '미', '신', '유', '술', '해'];

const TABLES: Partial<Record<Lang, Record<string, string>>> = {
  en: build(PINYIN_STEMS, PINYIN_BRANCHES),
  vi: build(VI_STEMS, VI_BRANCHES),
  ko: build(KO_STEMS, KO_BRANCHES),
};

function build(stems: string[], branches: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  STEMS.split('').forEach((c, i) => (out[c] = stems[i]));
  BRANCHES.split('').forEach((c, i) => (out[c] = branches[i]));
  return out;
}

const RUN = new RegExp(`[${STEMS}${BRANCHES}]+`, 'g');

/** A neighbour that would fuse with a LATIN replacement: "the庚pillar" must not become
 *  "theGengpillar". Deliberately not `\p{L}` — that matches Hangul, and Korean particles ATTACH:
 *  the first version of this turned 庚과 into "경 과", which is two words where the language has
 *  one. A test written from a real Korean sentence caught it. */
const LATIN_NEIGHBOUR = /[A-Za-z0-9\u00C0-\u024F\u1E00-\u1EFF]/;
const STARTS_LATIN = /^[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/;
const ENDS_LATIN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]$/;

/**
 * Say the stems and branches in `lang`. Anything else in the string is untouched.
 *
 * Runs are handled together so a two-character pillar reads as two words: 甲子 → "Jia Zi", never
 * "JiaZi". And a replacement that would end up jammed against a neighbouring word gets a space,
 * because the model writes them both with and without one.
 */
export function sayGlyphs(text: string, lang: Lang): string {
  const table = TABLES[lang];
  if (!table || !text) return text;

  return text.replace(RUN, (run, at: number) => {
    const said = run.split('').map((c: string) => table[c]).join(' ');
    const before = text[at - 1];
    const after = text[at + run.length];
    const padBefore = STARTS_LATIN.test(said) && !!before && LATIN_NEIGHBOUR.test(before);
    const padAfter = ENDS_LATIN.test(said) && !!after && LATIN_NEIGHBOUR.test(after);
    return (padBefore ? ' ' : '') + said + (padAfter ? ' ' : '');
  });
}
