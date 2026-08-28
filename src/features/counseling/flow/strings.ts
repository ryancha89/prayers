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

// RN ships ko/en (see shared/i18n/store.ts). The Unity table also carries vi;
// when a Vietnamese locale is added here, `loc()` already resolves it.
const bundles: Record<Lang, Bundle> = { ko: KO, en: EN };

export function ui(key: keyof typeof EN, lang: Lang): string {
  return bundles[lang]?.[key] ?? EN[key] ?? key;
}
