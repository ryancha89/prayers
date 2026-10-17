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
  if (lang === 'ko') return sayKorean(text, table);

  return text.replace(RUN, (run, at: number) => {
    const said = run.split('').map((c: string) => table[c]).join(' ');
    const before = text[at - 1];
    const after = text[at + run.length];
    const padBefore = STARTS_LATIN.test(said) && !!before && LATIN_NEIGHBOUR.test(before);
    const padAfter = ENDS_LATIN.test(said) && !!after && LATIN_NEIGHBOUR.test(after);
    return (padBefore ? ' ' : '') + said + (padAfter ? ' ' : '');
  });
}

/* ── Korean: one word, with the hanja beside it ─────────────────────────────────────────────────

   THE BUG (16-10, "갑 자 이렇게 띄어져 나오는데 갑자일 이라고 해야하고 한자도 넣어줘"). The room's
   prompt tells the model to write ganji in hanja, so "내일운은?" came back as "10월 17일 甲子일은…",
   and the run-join above — right for Pinyin, "Jia Zi" — made it "갑 자일". A Korean pillar is ONE
   word: 갑자일, 병오년, 무술월. And on screen a reader of 명리 expects the characters too, so a pillar
   is written the way Korean saju text writes it: 갑자일(甲子日), first the reading, then the hanja.

   Only a real pillar gets the gloss: stem + branch of the same parity (甲子 yes, 癸子 never exists).
   A lone stem or branch stays a bare reading — "월주의 庚과" is "월주의 경과", the particle attaching.
   The voice must not read the gloss twice; `spokenText` below takes it out again before TTS. */

const KO_UNIT_HANJA: Record<string, string> = { 년: '年', 월: '月', 일: '日', 시: '時' };
const KO_UNIT_HANGUL: Record<string, string> = { 年: '년', 月: '월', 日: '일', 時: '시' };

/** A pillar (optionally with its unit in hanja or Hangul, optionally glossed "(갑자)" by the model),
 *  or a lone glyph. Pillars first, so 甲子 is never read as two lone glyphs. A Hangul 일/월/년/시
 *  followed by 주·간·지·령 is not the pillar's unit but the start of 일주/월간/일지/월령. */
const KO_TOKEN = new RegExp(
  `([${STEMS}][${BRANCHES}])([年月日時])?(?:\\s*[(（]\\s*([가-힣]+)\\s*[)）])?([년월일시](?![주간지령]))?|[${STEMS}${BRANCHES}]`,
  'g',
);

/** "갑자(甲子)일" → "갑자일(甲子日)": the model's other habit, the unit outside the parenthesis. */
const KO_UNIT_OUTSIDE = new RegExp(`([가-힣]{2})[(（]([${STEMS}][${BRANCHES}])[)）]([년월일시])`, 'g');

function isPillar(pair: string): boolean {
  const s = STEMS.indexOf(pair[0]);
  const b = BRANCHES.indexOf(pair[1]);
  return s >= 0 && b >= 0 && s % 2 === b % 2;
}

function sayKorean(text: string, table: Record<string, string>): string {
  const read = (s: string) => s.replace(/./g, c => table[c] ?? c);
  const once = text.replace(KO_UNIT_OUTSIDE, (all, reading: string, pair: string, unit: string) =>
    reading === read(pair) ? `${reading}${unit}(${pair}${KO_UNIT_HANJA[unit]})` : all,
  );
  return once.replace(
    KO_TOKEN,
    (all: string, pair: string | undefined, hanjaUnit: string | undefined, gloss: string | undefined,
     hangulUnit: string | undefined, at: number) => {
      // Already the gloss of a reading written just before it: "갑자일(甲子日)" stays as it is.
      const before = once[at - 1];
      if (before === '(' || before === '（') return all;
      if (!pair) return table[all] ?? all;
      if (!isPillar(pair)) return read(all);

      const reading = read(pair);
      // A gloss that is not this pillar's reading is the model's own aside — keep it, after the label.
      const glossUnit = gloss && gloss.startsWith(reading) ? gloss.slice(reading.length) : undefined;
      const strayGloss = gloss !== undefined && glossUnit === undefined ? `(${gloss})` : '';
      const unitKo =
        (hanjaUnit && KO_UNIT_HANGUL[hanjaUnit]) ||
        (glossUnit && KO_UNIT_HANJA[glossUnit] ? glossUnit : undefined) ||
        hangulUnit ||
        '';
      const label = `${reading}${unitKo}(${pair}${unitKo ? KO_UNIT_HANJA[unitKo] : ''})`;
      // A Hangul unit that lost to the hanja one ("甲子年월") is not the pillar's — give it back.
      const tail = hangulUnit && unitKo !== hangulUnit ? hangulUnit : '';
      return label + strayGloss + tail;
    },
  );
}

/** Hanja glossed after a Hangul word — "갑자일(甲子日)", "정관(正官)". The screen shows them; a
 *  voice reading them would say the word twice, or say it in Chinese. */
const HANJA_GLOSS = /([가-힣])\s*[(（][\u3400-\u9FFF]+[)）]/g;

/**
 * The text as the counselor SAYS it. The room sends the bubble's string to TTS (Unity speaks
 * `STAGE_SPEAK.text` and shows nothing of it), so the gloss added for the eye comes out here.
 * Only after Hangul: in ja/zh the characters ARE the words, and a parenthesis there is content.
 */
export function spokenText(text: string): string {
  if (!text) return text;
  const out = text.replace(HANJA_GLOSS, '$1');
  // An answer in a Latin-script language that kept its hanja (asked in English in a Korean app —
  // see `replyLangFor`): the screen keeps "Mu-jin/戊辰", the voice says "Mu-jin" — and a bare
  // 甲子 is read the way that language's own answers read it, not in Chinese.
  const lang = scriptLang(out);
  if (lang !== 'en' && lang !== 'vi') return out;
  return sayGlyphs(out.replace(LATIN_HANJA_GLOSS, '$1').replace(EMPTY_PARENS, ''), lang);
}

/* ── Which language a text is in, by its script ─────────────────────────────────────────────────

   16-10 ("영어로 질문했는데 한글이 섞여있어"). The counsellor answers in the language she is asked
   in (the server's rule), but the room assumed the APP's language: in a Korean app an English
   question got a Korean "잠깐만요…" before the English answer, and the answer's hanja were turned
   into Korean readings mid-English — "(Mu-jin/무진(戊辰))". Script alone decides it, and only
   across scripts: Latin text in an English or Vietnamese app is that app's language (a Vietnamese
   player typing without diacritics is not writing English). */

const HANGUL = /[\uAC00-\uD7A3]/g;
const KANA = /[\u3040-\u30FF]/g;
const HAN = /[\u3400-\u9FFF]/g;
const LATIN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/g;
const VI_MARKS = /[ăâđêôơưĂÂĐÊÔƠƯ\u1EA0-\u1EF9]/;
const LATIN_HANJA_GLOSS = /([A-Za-z\u00C0-\u024F\u1E00-\u1EFF.'’-])\s*(?:\/\s*[\u3400-\u9FFF]+|[(（][\u3400-\u9FFF]+[)）])/g;
const EMPTY_PARENS = /\s*[(（]\s*[)）]/g;

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

/** The language `text` is written in, by script: ko, ja, zh-CN, vi or en; null when it has no letters. */
export function scriptLang(text: string): Lang | null {
  const ko = count(text, HANGUL), kana = count(text, KANA), han = count(text, HAN), latin = count(text, LATIN);
  if (ko + kana + han + latin === 0) return null;
  if (latin > ko + kana + han) return VI_MARKS.test(text) ? 'vi' : 'en';
  if (ko > 0 && ko >= kana) return 'ko';
  if (kana > 0) return 'ja';
  return 'zh-CN';
}

/** The language her answer to `question` will be in: the app's, unless the question is plainly in
 *  another script. Latin vs Latin, and Chinese in either written form, keep the app's language. */
export function replyLangFor(question: string, appLang: Lang): Lang {
  const said = scriptLang(question);
  if (!said) return appLang;
  const family = (l: Lang) => (l === 'en' || l === 'vi' ? 'latin' : l === 'zh-TW' ? 'zh-CN' : l);
  return family(said) === family(appLang) ? appLang : said;
}
