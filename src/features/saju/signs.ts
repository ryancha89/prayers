import type { Lang } from '../../shared/i18n';

/**
 * The two "what am I" answers a birth date gives at a glance, next to the saju (10-15: shown on the
 * birth form as soon as the date is typed): the Western star sign, and the Chinese zodiac animal.
 *
 * The animal is the YEAR PILLAR's branch, not the lunar new year's: a saju year turns at 立春
 * (~4 Feb), so someone born on 1 Feb belongs to the previous year's animal here, and the card
 * agrees with the pillars printed right under it.
 */

/** Tropical sign boundaries: [month, first day] of each sign, Capricorn first (it starts in December). */
const SIGN_STARTS: [number, number][] = [
  [1, 20], [2, 19], [3, 21], [4, 20], [5, 21], [6, 21], [7, 23], [8, 23], [9, 23], [10, 23], [11, 22], [12, 22],
];
/** Aquarius … Capricorn, in the order of SIGN_STARTS. */
const SIGN_ORDER = [10, 11, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Text presentation (U+FE0E), so the symbol is drawn in the text colour, not as an emoji tile. */
const SIGN_SYMBOLS = ['♈', '♉', '♊', '♋', '♌', '♍', '♎', '♏', '♐', '♑', '♒', '♓'].map(s => `${s}︎`);

/** Aries first. */
const SIGN_NAMES: Record<Lang, string[]> = {
  en: ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'],
  ko: ['양자리', '황소자리', '쌍둥이자리', '게자리', '사자자리', '처녀자리', '천칭자리', '전갈자리', '사수자리', '염소자리', '물병자리', '물고기자리'],
  ja: ['牡羊座', '牡牛座', '双子座', '蟹座', '獅子座', '乙女座', '天秤座', '蠍座', '射手座', '山羊座', '水瓶座', '魚座'],
  'zh-CN': ['白羊座', '金牛座', '双子座', '巨蟹座', '狮子座', '处女座', '天秤座', '天蝎座', '射手座', '摩羯座', '水瓶座', '双鱼座'],
  'zh-TW': ['牡羊座', '金牛座', '雙子座', '巨蟹座', '獅子座', '處女座', '天秤座', '天蠍座', '射手座', '摩羯座', '水瓶座', '雙魚座'],
  vi: ['Bạch Dương', 'Kim Ngưu', 'Song Tử', 'Cự Giải', 'Sư Tử', 'Xử Nữ', 'Thiên Bình', 'Bọ Cạp', 'Nhân Mã', 'Ma Kết', 'Bảo Bình', 'Song Ngư'],
};

/** 子 first. Vietnam's own zodiac has the Cat and the Buffalo, and is named that way. */
const ANIMAL_NAMES: Record<Lang, string[]> = {
  en: ['Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake', 'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'],
  ko: ['쥐띠', '소띠', '호랑이띠', '토끼띠', '용띠', '뱀띠', '말띠', '양띠', '원숭이띠', '닭띠', '개띠', '돼지띠'],
  ja: ['子年（ねずみ）', '丑年（うし）', '寅年（とら）', '卯年（うさぎ）', '辰年（たつ）', '巳年（へび）', '午年（うま）', '未年（ひつじ）', '申年（さる）', '酉年（とり）', '戌年（いぬ）', '亥年（いのしし）'],
  'zh-CN': ['属鼠', '属牛', '属虎', '属兔', '属龙', '属蛇', '属马', '属羊', '属猴', '属鸡', '属狗', '属猪'],
  'zh-TW': ['屬鼠', '屬牛', '屬虎', '屬兔', '屬龍', '屬蛇', '屬馬', '屬羊', '屬猴', '屬雞', '屬狗', '屬豬'],
  vi: ['Tý (Chuột)', 'Sửu (Trâu)', 'Dần (Hổ)', 'Mão (Mèo)', 'Thìn (Rồng)', 'Tỵ (Rắn)', 'Ngọ (Ngựa)', 'Mùi (Dê)', 'Thân (Khỉ)', 'Dậu (Gà)', 'Tuất (Chó)', 'Hợi (Lợn)'],
};

const ANIMAL_EMOJI = ['🐭', '🐮', '🐯', '🐰', '🐲', '🐍', '🐴', '🐑', '🐵', '🐔', '🐶', '🐷'];
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];

/** Index into Aries-first tables for a month (1-12) and day. */
export function starSignIndex(month: number, day: number): number {
  let i = SIGN_STARTS.length - 1; // before 20 Jan: still Capricorn (December's)
  for (let k = 0; k < SIGN_STARTS.length; k++) {
    const [m, d] = SIGN_STARTS[k];
    if (month > m || (month === m && day >= d)) i = k;
  }
  return SIGN_ORDER[i];
}

export function starSign(month: number, day: number, lang: Lang): { name: string; symbol: string } {
  const i = starSignIndex(month, day);
  return { name: (SIGN_NAMES[lang] ?? SIGN_NAMES.en)[i], symbol: SIGN_SYMBOLS[i] };
}

/** The animal of a year pillar (e.g. `己巳` → Snake); null for anything that is not a 간지. */
export function zodiacAnimal(yearPillar: string, lang: Lang): { name: string; emoji: string } | null {
  const i = BRANCHES.indexOf(yearPillar?.[1]);
  if (i < 0) return null;
  return { name: (ANIMAL_NAMES[lang] ?? ANIMAL_NAMES.en)[i], emoji: ANIMAL_EMOJI[i] };
}
