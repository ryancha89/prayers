/**
 * Consultation copy that RN owns.
 *
 * Most of the session's words come out of the Unity string table (see
 * `consultationStrings.json`). These are the ones that never had a key there:
 * the free-chat loop's chrome lived in inspector fields on `ConsultationLoop`,
 * and the tap hint / input placeholder were built into the Unity canvas that
 * this screen replaces. They belong to the React UI now, so they live here.
 */
import type { Lang } from '../../../shared/i18n';

type Bundle = Record<string, string>;

const KO: Bundle = {
  'loop.intro': '더 궁금한 것이 있으신가요?',
  'loop.placeholder': '무엇이든 물어보세요',
  'loop.leave': '상담 마치기',
  'loop.send': '보내기',
  'question.placeholder': '궁금한 것을 적어주세요',
  'question.consult': '상담 받기',
  'tap.continue': '탭하여 계속',
  'thinking': '사주를 살펴보는 중',
};

const EN: Bundle = {
  'loop.intro': 'Is there anything else you would like to ask?',
  'loop.placeholder': 'Ask me anything',
  'loop.leave': 'End the consultation',
  'loop.send': 'Send',
  'question.placeholder': 'Write what you would like to know',
  'question.consult': 'Consult',
  'tap.continue': 'Tap to continue',
  'thinking': 'Reading your chart',
};

const JA: Bundle = {
  'loop.intro': 'ほかに気がかりなことはありますか？',
  'loop.placeholder': '何でも聞いてください',
  'loop.leave': '相談を終える',
  'loop.send': '送る',
  'question.placeholder': '聞きたいことを書いてください',
  'question.consult': '相談する',
  'tap.continue': 'タップして続ける',
  thinking: '命式を読んでいます',
};

const ZH_CN: Bundle = {
  'loop.intro': '还有别的想问吗？',
  'loop.placeholder': '想问什么都可以',
  'loop.leave': '结束这次咨询',
  'loop.send': '发送',
  'question.placeholder': '写下你想知道的事',
  'question.consult': '开始咨询',
  'tap.continue': '点一下继续',
  thinking: '正在看你的命盘',
};

const ZH_TW: Bundle = {
  'loop.intro': '還有別的想問嗎？',
  'loop.placeholder': '想問什麼都可以',
  'loop.leave': '結束這次諮詢',
  'loop.send': '送出',
  'question.placeholder': '寫下你想知道的事',
  'question.consult': '開始諮詢',
  'tap.continue': '點一下繼續',
  thinking: '正在看你的命盤',
};

const VI: Bundle = {
  'loop.intro': 'Con còn muốn hỏi gì nữa không?',
  'loop.placeholder': 'Hỏi gì cũng được',
  'loop.leave': 'Kết thúc buổi tư vấn',
  'loop.send': 'Gửi',
  'question.placeholder': 'Viết điều con muốn biết',
  'question.consult': 'Xin thầy xem',
  'tap.continue': 'Chạm để đi tiếp',
  thinking: 'Đang xem lá số của con',
};

// These eight are RN's own copy, so RN carries all six languages for them. The room's other lines
// come from consultationStrings.json, which is generated from the Unity table and still ships
// ko/en/vi — those fall back until the table itself gains ja and Chinese.
const bundles: Record<Lang, Bundle> = {
  ko: KO,
  en: EN,
  ja: JA,
  'zh-CN': ZH_CN,
  'zh-TW': ZH_TW,
  vi: VI,
};

export function ui(key: keyof typeof EN, lang: Lang): string {
  return bundles[lang]?.[key] ?? EN[key] ?? key;
}
