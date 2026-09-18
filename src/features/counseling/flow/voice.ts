/**
 * The counselor's REGISTER — the handful of room lines that should not sound the same coming from
 * a career reader as from a grandmother.
 *
 * WHAT THIS IS NOT. It is not the server's `tone`, which decides how the ANSWER is written (see the
 * Rails persona table), and it is not a second roster. It is the chrome the room says in its own
 * voice while nothing is coming from the server: the waiting lines, the thinking caption, the input
 * placeholders, and the two scripted beats where the reading opens. Those were written once, in the
 * mystical register every counselor shared — "Let me examine your Four Pillars", "이 흐름을 다시
 * 읽어볼게요" — and out of Go Yunjung's mouth, whose card promises a straight answer about work and
 * money, they are somebody else talking.
 *
 * KEYED BY SPECIALTY, NOT BY NAME. `voiceFor` asks the registry what this counselor reads; a second
 * career counselor inherits the register with no edit here, and a counselor with no row keeps the
 * default. There is exactly one register beside the default today (`business`) because there is
 * exactly one specialist whose copy was wrong; adding `love` later is adding a block below.
 *
 * ⚠️ THESE LINES ARE SPOKEN. The room sends the same string to TTS that it puts on screen, so a
 * line written here is read aloud in her voice — keep them short, keep them sayable, and do not put
 * anything in them that only makes sense written down (no brackets, no ellipsis runs).
 *
 * ⚠️ Overriding a `consult_*` key overrides the GENERATED table (`consultationStrings.json`, which
 * comes from Unity). That is deliberate — the table is shared by every counselor and cannot answer
 * "who is speaking" — but it means a line changed in Unity will not show up for a counselor whose
 * register overrides it. Only three scripted keys are overridden for that reason.
 */
import type { Lang } from '../../../shared/i18n';
import { registryFor } from '../../counselors/data/registry';

export type CounselorVoice = 'default' | 'business';

/** Specialties that speak in the business register. `wealth` is here too: the roster splits money
 *  and career into two cards, but it is one reading and one way of talking. */
const BUSINESS_SPECIALTIES = new Set(['career', 'wealth']);

/** Which register this counselor speaks in. Unknown counselor → the default; there is no guessing
 *  from a name, because the name is not what decides it. */
export function voiceFor(characterId: string | undefined): CounselorVoice {
  const specialty = registryFor(characterId)?.specialty;
  return specialty && BUSINESS_SPECIALTIES.has(specialty) ? 'business' : 'default';
}

type Bundle = Record<string, string>;

/**
 * The business register, per language.
 *
 * Both kinds of key live in one table on purpose: `loop.*` / `thinking` are RN's own copy and
 * `consult_*` are the generated table's, but the player hears one voice and the person editing it
 * should see one list.
 */
const BUSINESS: Record<Lang, Bundle> = {
  ko: {
    thinking: '직업운 흐름을 읽는 중',
    consult_thinking: '직업운 흐름을 읽는 중',
    'loop.intro': '더 확실히 듣고 싶은 게 있나요?',
    'loop.placeholder': '일, 돈, 시기에 대해 물어보세요',
    'question.placeholder': '지금 고민 중인 결정을 적어주세요',
    'loop.wait.0': '잠시만요, 올해 흐름과 맞춰 볼게요.',
    'loop.wait.1': '좋은 질문이네요. 사주와 맞춰 보고 답할게요.',
    'loop.wait.2': '잠깐만요, 재성이 어디에 있는지 보고요.',
    'loop.wait.3': '조금만요. 시기를 한 번 더 확인하고 말할게요.',
    consult_p02_l0: '앉으세요. 오늘은 무엇을 정해야 하죠?',
    consult_p07_l0: '사주를 펴고 직업과 재물의 기둥을 보겠습니다.',
    consult_p08_l0: '앞으로의 길에 대해 사주가 하는 말입니다.',
  },
  en: {
    thinking: 'Reading your work and money cycles',
    consult_thinking: 'Reading your work and money cycles',
    'loop.intro': 'Anything else you want a straight answer on?',
    'loop.placeholder': 'Ask about work, money, or timing',
    'question.placeholder': 'What decision are you weighing?',
    'loop.wait.0': 'One moment — let me check that against this year.',
    'loop.wait.1': 'Good question. Let me line it up with your chart first.',
    'loop.wait.2': 'Give me a second. I want to see where your money pillar sits.',
    'loop.wait.3': 'Hold on. I will read the timing once more before I answer.',
    consult_p02_l0: 'Have a seat. What are we deciding today?',
    consult_p07_l0: 'Let me open your chart and look at the work and money pillars.',
    consult_p08_l0: 'Here is what your chart says about the road ahead.',
  },
  ja: {
    thinking: '仕事運とお金の流れを読んでいます',
    consult_thinking: '仕事運とお金の流れを読んでいます',
    'loop.intro': 'ほかにはっきり聞いておきたいことは？',
    'loop.placeholder': '仕事・お金・時期について聞いてください',
    'question.placeholder': 'いま迷っている決断を書いてください',
    'loop.wait.0': '少々お待ちを。今年の流れと照らし合わせます。',
    'loop.wait.1': 'いい質問ですね。命式と突き合わせてから答えます。',
    'loop.wait.2': '少しだけ。財の柱がどこにあるか見ます。',
    'loop.wait.3': 'お待ちを。時期をもう一度確かめてから言います。',
    consult_p02_l0: 'どうぞ。今日は何を決めますか。',
    consult_p07_l0: '命式を開いて、仕事と財の柱を見ます。',
    consult_p08_l0: 'この先の道について、命式が示すことです。',
  },
  'zh-CN': {
    thinking: '正在读你的事业与财运流年',
    consult_thinking: '正在读你的事业与财运流年',
    'loop.intro': '还有什么想听个准话的？',
    'loop.placeholder': '问工作、钱，或者时机',
    'question.placeholder': '写下你正在权衡的决定',
    'loop.wait.0': '稍等，我把它对上今年的流年。',
    'loop.wait.1': '问得好。我先对一下命盘再回答。',
    'loop.wait.2': '等一下，我看看财星落在哪。',
    'loop.wait.3': '稍等，时机我再确认一遍再说。',
    consult_p02_l0: '请坐。今天我们要定什么？',
    consult_p07_l0: '我把命盘打开，看事业与财的柱。',
    consult_p08_l0: '关于接下来的路，你的命盘是这么说的。',
  },
  'zh-TW': {
    thinking: '正在讀你的事業與財運流年',
    consult_thinking: '正在讀你的事業與財運流年',
    'loop.intro': '還有什麼想聽個準話的？',
    'loop.placeholder': '問工作、錢，或者時機',
    'question.placeholder': '寫下你正在權衡的決定',
    'loop.wait.0': '稍等，我把它對上今年的流年。',
    'loop.wait.1': '問得好。我先對一下命盤再回答。',
    'loop.wait.2': '等一下，我看看財星落在哪。',
    'loop.wait.3': '稍等，時機我再確認一遍再說。',
    consult_p02_l0: '請坐。今天我們要定什麼？',
    consult_p07_l0: '我把命盤打開，看事業與財的柱。',
    consult_p08_l0: '關於接下來的路，你的命盤是這麼說的。',
  },
  vi: {
    // ⚠️ "tôi / bạn", not the "ta / con" of the default register. That pairing is the grandmaster
    // voice; her card says she talks straight to an adult, and the pronouns are most of that.
    thinking: 'Đang đọc vận sự nghiệp và tài lộc của bạn',
    consult_thinking: 'Đang đọc vận sự nghiệp và tài lộc của bạn',
    'loop.intro': 'Còn chuyện gì bạn muốn nghe cho rõ ràng không?',
    'loop.placeholder': 'Hỏi về công việc, tiền bạc, hoặc thời điểm',
    'question.placeholder': 'Bạn đang cân nhắc quyết định gì?',
    'loop.wait.0': 'Chờ chút, tôi đối chiếu với vận năm nay.',
    'loop.wait.1': 'Câu hỏi hay. Để tôi soi lá số rồi trả lời.',
    'loop.wait.2': 'Chờ một chút, tôi xem tài tinh nằm ở đâu.',
    'loop.wait.3': 'Khoan, tôi xác nhận lại thời điểm rồi nói.',
    consult_p02_l0: 'Mời ngồi. Hôm nay ta quyết chuyện gì?',
    consult_p07_l0: 'Tôi mở lá số, xem trụ sự nghiệp và tài lộc.',
    consult_p08_l0: 'Lá số nói thế này về con đường phía trước.',

    // ⚠️ VIETNAMESE ONLY, AND THERE IS A REASON THE LIST IS THIS LONG (16-09).
    //
    // The three keys above were overridden because their WORDS were mystical. These twelve are
    // overridden because of their PRONOUNS: the shared table says "Ta … con", grandmaster to
    // disciple, and there is no neutral "you" in Vietnamese to fall back on — every sentence takes
    // a side. So a counsellor who says "tôi / bạn" in her opening line and "ta / con" four phases
    // later has changed who she is mid-session. The other five languages carry the same distinction
    // in their politeness level and are already correct, which is why there is no `ko`/`ja`/`zh`
    // twin for any of these: `voiced` falls back language → en → shared, and a key absent from `en`
    // means every other language keeps the shared line, which is what should happen.
    //
    // `{0}` survives an override: `locV` is wrapped in `withTopic`, so the topic is substituted
    // after this table is consulted. Leave the placeholder in.
    consult_p05_l0: 'Bạn cứ hỏi thẳng, tôi trả lời thẳng.',
    consult_p06_l0: 'Rõ. Bạn muốn biết dòng chảy {0} của mình.',
    consult_p10_l0: 'Chỗ này nối thẳng với {0} của bạn.',
    consult_p11_l0: '{0} của bạn không hề yếu.',
    consult_p12_l0: 'Tôi hỏi một điều. Bạn có định bắt đầu việc mới hay đầu tư không?',
    consult_p14_business_l0: 'Theo tứ trụ, bạn bắt đầu được, nhưng hãy bắt đầu nhỏ.',
    consult_p17_l0: 'Tóm lại về {0} của bạn...',
    consult_p17_business_l0: 'Tóm lại về {0} của bạn...',
    consult_p17_invest_l0: 'Tóm lại về {0} của bạn...',
    consult_p17_none_l0: 'Tóm lại về {0} của bạn...',
    consult_p17_side_l0: 'Tóm lại về {0} của bạn...',
    consult_p17_none_l1: 'Bạn chưa cần quyết định. Quan trọng là sẵn sàng khi cơ hội tới.',
  },
};

const REGISTERS: Record<CounselorVoice, Record<Lang, Bundle> | null> = {
  default: null,
  business: BUSINESS,
};

/**
 * This register's line for a key, or undefined to use the shared one.
 *
 * Falls back within the register (language → en) rather than out of it: a missing Japanese business
 * line should read as this counselor in English, not as a different counselor in Japanese.
 */
export function voiced(voice: CounselorVoice, key: string, lang: Lang): string | undefined {
  const table = REGISTERS[voice];
  if (!table) return undefined;
  return table[lang]?.[key] ?? table.en?.[key];
}
