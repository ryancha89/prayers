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
  'loop.wait.0': '잠시만요, 그 부분을 사주에서 다시 한 번 살펴볼게요.',
  'loop.wait.1': '음, 좋은 질문이에요. 잠깐만 생각해 볼게요.',
  'loop.wait.2': '네, 기둥을 찬찬히 다시 들여다보고 있어요. 조금만 기다려 주세요.',
  'loop.wait.3': '잠깐만요, 흐름을 한 번 더 읽어볼게요.',
  'mic.listening': '듣고 있어요 — 다 말하면 탭하세요',
  'mic.transcribing': '받아 적는 중',
  'mic.error.permission': '마이크 권한이 필요해요. 설정에서 허용해 주세요.',
  'mic.error.nodevice': '마이크를 찾지 못했어요.',
  'mic.error.nospeech': '아무 소리도 들리지 않았어요.',
  'mic.error.failed': '말을 옮겨 적지 못했어요. 글로 적어 주세요.',
  'mic.error.unavailable': '지금은 음성으로 물어볼 수 없어요. 글로 적어 주세요.',
  'loop.stopTalking': '그만 말하기',
  'mic.opening': '마이크를 여는 중',
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
  'loop.wait.0': 'One moment, let me look at that part of your chart again.',
  'loop.wait.1': 'Mm, good question. Give me a second to think.',
  'loop.wait.2': 'Let me go over the pillars once more. Just a moment.',
  'loop.wait.3': 'Hold on, I want to read the flow one more time.',
  'mic.listening': 'Listening — tap when you have finished',
  'mic.transcribing': 'Writing it down',
  'mic.error.permission': 'The microphone needs permission. Allow it in Settings.',
  'mic.error.nodevice': 'No microphone was found.',
  'mic.error.nospeech': 'I did not hear anything.',
  'mic.error.failed': 'I could not make out the words. Please type instead.',
  'mic.error.unavailable': 'Asking out loud is not available right now. Please type instead.',
  'loop.stopTalking': 'Stop talking',
  'mic.opening': 'Opening the microphone',
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
  'loop.wait.0': '少し待ってくださいね、命式のその部分をもう一度見てみます。',
  'loop.wait.1': 'うん、いい質問ですね。少し考えさせてください。',
  'loop.wait.2': '柱をもう一度ゆっくり見直しています。少しだけお待ちください。',
  'loop.wait.3': 'ちょっと待ってください、流れをもう一度読んでみます。',
  'mic.listening': '聞いています — 話し終えたらタップ',
  'mic.transcribing': '書き取っています',
  'mic.error.permission': 'マイクの許可が必要です。設定で許可してください。',
  'mic.error.nodevice': 'マイクが見つかりませんでした。',
  'mic.error.nospeech': '何も聞こえませんでした。',
  'mic.error.failed': '聞き取れませんでした。文字で書いてください。',
  'mic.error.unavailable': '今は音声で質問できません。文字で書いてください。',
  'loop.stopTalking': '話をとめる',
  'mic.opening': 'マイクを準備しています',
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
  'loop.wait.0': '稍等一下，我再看看命盘里的这一部分。',
  'loop.wait.1': '嗯，好问题。让我想一想。',
  'loop.wait.2': '我再仔细看一遍四柱，请稍等。',
  'loop.wait.3': '等一下，我再把这股走势读一遍。',
  'mic.listening': '正在听 — 说完请点一下',
  'mic.transcribing': '正在记下来',
  'mic.error.permission': '需要麦克风权限，请在设置里允许。',
  'mic.error.nodevice': '没有找到麦克风。',
  'mic.error.nospeech': '我没有听到声音。',
  'mic.error.failed': '没能听清，请用文字写下来。',
  'mic.error.unavailable': '现在还不能用语音提问，请用文字写下来。',
  'loop.stopTalking': '让他先停下',
  'mic.opening': '正在打开麦克风',
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
  'loop.wait.0': '稍等一下，我再看看命盤裡的這一部分。',
  'loop.wait.1': '嗯，好問題。讓我想一想。',
  'loop.wait.2': '我再仔細看一遍四柱，請稍等。',
  'loop.wait.3': '等一下，我再把這股走勢讀一遍。',
  'mic.listening': '正在聽 — 說完請點一下',
  'mic.transcribing': '正在記下來',
  'mic.error.permission': '需要麥克風權限，請在設定裡允許。',
  'mic.error.nodevice': '沒有找到麥克風。',
  'mic.error.nospeech': '我沒有聽到聲音。',
  'mic.error.failed': '沒能聽清，請用文字寫下來。',
  'mic.error.unavailable': '現在還不能用語音提問，請用文字寫下來。',
  'loop.stopTalking': '讓他先停下',
  'mic.opening': '正在開啟麥克風',
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
  'loop.wait.0': 'Con chờ ta một chút, ta xem lại chỗ đó trong lá số.',
  'loop.wait.1': 'Ừm, câu hỏi hay đấy. Để ta nghĩ một lát.',
  'loop.wait.2': 'Ta đang xem lại bốn trụ cho kỹ. Con đợi ta chút nhé.',
  'loop.wait.3': 'Khoan đã, ta đọc lại mạch vận này một lần nữa.',
  'mic.listening': 'Ta đang nghe — nói xong thì chạm',
  'mic.transcribing': 'Đang ghi lại lời con',
  'mic.error.permission': 'Cần quyền dùng micro. Con cho phép trong Cài đặt nhé.',
  'mic.error.nodevice': 'Không tìm thấy micro.',
  'mic.error.nospeech': 'Ta không nghe thấy gì cả.',
  'mic.error.failed': 'Ta nghe không rõ. Con viết ra giúp ta.',
  'mic.error.unavailable': 'Bây giờ chưa hỏi bằng giọng nói được. Con viết ra giúp ta.',
  'loop.stopTalking': 'Xin thầy dừng',
  'mic.opening': 'Đang mở micro',
};

// These are RN's own copy, so RN carries all six languages for them. The room's other lines
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
