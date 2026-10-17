import type { ImageSourcePropType } from 'react-native';
import type { Lang } from '../../../shared/i18n';
import KO from './schopenhauer.ko.json';
import EN from './schopenhauer.en.json';
import JA from './schopenhauer.ja.json';
import VI from './schopenhauer.vi.json';
import ZH_CN from './schopenhauer.zh-CN.json';
import ZH_TW from './schopenhauer.zh-TW.json';

/**
 * A recorded lecture series (16-10, user: "쇼펜하우어의 인생철학으로 메인화면에 만들어줘 — 이건 상담이
 * 아님"). Not a consultation: nobody is asked anything, nothing is charged, nothing is generated. The
 * text is the script "Prayers_쇼펜하우어_12강_전체대본", and every line was recorded ONCE by
 * tools/schopenhauer/bake_lecture.py into a bundled m4a — so a line plays the same take, offline,
 * every time, at no cost. `ms` is that take's length.
 *
 * One series per language (16-10, user: "언어별로 다르게 구현해야함"): the Korean script, and the
 * English, Japanese, Vietnamese and Simplified Chinese translations, each recorded in the same voice.
 * zh-TW shows the Simplified script converted to Traditional over the Mandarin recordings
 * (tools/schopenhauer/import_scripts.py).
 */
export interface LectureLine {
  text: string;
  file: string;
  ms: number;
}

export interface LectureChapter {
  no: number;
  title: string;
  /** The script's stage direction ("강의실에 등장 → 청중을 바라봄"), shown under the title. */
  staging: string;
  lines: LectureLine[];
  /** The question each lecture closes on — left with the listener, not answered by anyone. */
  question: LectureLine;
}

export interface LectureSeries {
  id: string;
  chapters: LectureChapter[];
  portrait: ImageSourcePropType;
  avatar: ImageSourcePropType;
}

const BY_LANG: Record<Lang, { chapters: unknown }> = { ko: KO, en: EN, ja: JA, vi: VI, 'zh-CN': ZH_CN, 'zh-TW': ZH_TW };

const portrait = require('../assets/schopenhauer.jpg');
const avatar = require('../assets/schopenhauer_avatar.jpg');

/** The series in `lang` — every language the app offers has one. */
export function seriesFor(lang: Lang): LectureSeries {
  return { id: 'schopenhauer', chapters: (BY_LANG[lang] ?? KO).chapters as LectureChapter[], portrait, avatar };
}

/** Three camera angles on the 3D model (front knees-up, three-quarter left, low right), rendered in
 *  Blender from "Old Man.fbx" — the lecture cuts between them (16-10, user: "앵글 움직여야하고"). */
const shots = [
  require('../assets/schopenhauer_shot_front.jpg'),
  require('../assets/schopenhauer_shot_left.jpg'),
  require('../assets/schopenhauer_shot_low.jpg'),
];

/** The art, the same in every language. */
export const SCHOPENHAUER_ART = { portrait, avatar, shots };

/** Twelve in every language. */
export const LECTURE_COUNT = 12;

export function chapterOf(lang: Lang, no: number): LectureChapter | undefined {
  return seriesFor(lang).chapters.find(c => c.no === no);
}

/** A chapter's whole running time, question included. */
export function chapterMs(c: LectureChapter): number {
  return c.lines.reduce((sum, l) => sum + l.ms, c.question.ms);
}
