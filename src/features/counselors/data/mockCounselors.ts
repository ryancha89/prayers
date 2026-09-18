import { CounselorSummary } from '../types';
import { Lang } from '../../../shared/i18n';
import { COUNSELOR_AVATAR_ART, COUNSELOR_CARD_ART } from '../assets';
import { PREVIEW_STRIPS } from '../assets/previews';
import { builtCharacterIds, registryFor } from './registry';

/**
 * Mock counselor catalog (spec §47), bilingual (KO default / EN). At least six
 * so the feed feels realistic (spec §51-P2). Replace with a real localized API
 * later — keep the localized output shape (`CounselorSummary`) identical.
 */

interface LocalizedContent {
  name: string;
  title: string;
  hook: string;
  about: string;
  personality: string[];
  specialties: string[];
  tags: string[];
}

interface RawCounselor {
  id: string;
  accent: string;
  category: CounselorSummary['category'];
  conversationCount?: number;
  isNew?: boolean;
  isTrending?: boolean;
  characterId: string;
  roomId: string;
  previewActions: PreviewAction[];
  l10n: Record<Lang, LocalizedContent>;
}

/**
 * `key` is what pairs an action with its rendered clip in PREVIEW_STRIPS — so it is not free text:
 * a counselor's action list may only name clips its 3D model actually has. That is why jiho's list
 * is not the generic one; m_char_003 has no nod clip, and inventing one would mean a preview
 * button that plays somebody else's gesture.
 */
interface PreviewAction extends Record<Lang, string> {
  key: string;
}

const PREVIEW_ACTIONS: PreviewAction[] = [
  { key: 'hello', ko: '인사하기', en: 'Say Hello', ja: 'あいさつ', 'zh-CN': '打招呼', 'zh-TW': '打招呼', vi: 'Chào' },
  { key: 'smile', ko: '미소', en: 'Smile', ja: '微笑み', 'zh-CN': '微笑', 'zh-TW': '微笑', vi: 'Mỉm cười' },
  { key: 'thinking', ko: '생각', en: 'Thinking', ja: '考える', 'zh-CN': '思索', 'zh-TW': '思索', vi: 'Ngẫm' },
  { key: 'explaining', ko: '설명', en: 'Explaining', ja: '説明', 'zh-CN': '讲解', 'zh-TW': '講解', vi: 'Giảng giải' },
  { key: 'nod', ko: '끄덕임', en: 'Nod', ja: 'うなずき', 'zh-CN': '点头', 'zh-TW': '點頭', vi: 'Gật đầu' },
];

/**
 * ⚠️ ONE ACTION SINCE 16-09, DOWN FROM FOUR, AND THAT IS THE FIX RATHER THAN A LOSS.
 *
 * While Theo had no model this list was an ORDER LIST — four poses from his sheet, naming what the
 * animator still had to draw, on a card nobody could tap. `m_char_004` landed with a seated idle
 * and a talking loop, his card went `available`, and at that moment the list stopped being a
 * request and became a promise to a player. Three quarters of it was false, and the card-art test
 * said so in the same run.
 *
 * `explaining` is what he can do. The rest comes back a row at a time as clips arrive — with a
 * rendered strip behind each, never before.
 *
 * (For the record, the sheet's four were Explaining, Thinking, Welcome and Revealing. `reveal` was
 * dropped on its own account — see below — and is not waiting in this queue.)
 *
 * ⚠️ `reveal` was dropped on 16-09 and is not coming back — for HIM. Theo runs the same reading
 * every playable counsellor runs, the P06-P10 saju walk, and no card is drawn anywhere in it. The
 * pose came from the sheet's own tarot flavour. (The roster does hold a tarot specialist, `jeonuji`
 * — no model, no topics, `GROUND.tarot` empty — and a card flip would be his, not Theo's.) A
 * preview button that promises a gesture this counsellor's reading never makes is the same broken
 * promise the card art was redrawn to fix, one step further upstream.
 *
 * `nod` replaces it, labelled as LISTENING rather than as a nod: he is the relationship counsellor,
 * and hearing someone out is the gesture that reads as his job. It is the one row here with no pose
 * on the sheet — so it is an animation request, not a record. That is honest for him and for no one
 * else: his model does not exist yet, his card is locked, and this list is the order to draw in.
 */
const PREVIEW_ACTIONS_THEO: PreviewAction[] = [
  { key: 'explaining', ko: '설명 중', en: 'Explaining', ja: '説明中', 'zh-CN': '讲解', 'zh-TW': '講解', vi: 'Giảng giải' },
];

/**
 * TWO actions since the 2026-09-14 delivery. The note here used to say one, and it was right at the
 * time: her only other clips were a seated POSE and a talk loop whose largest arm swing was 0.024,
 * and a button that promises a gesture and plays a still is the same broken promise the card art
 * was redrawn to fix. `Sit_Soft_Smile` is a real gesture, so it can be promised.
 *
 * Still deliberately short. Add rows as clips arrive, not before — and re-render the strips, because
 * a row here with no strip behind it shows the previous counselor's frames.
 */
const PREVIEW_ACTIONS_YUNJUNG: PreviewAction[] = [PREVIEW_ACTIONS[1], PREVIEW_ACTIONS[3]];

/** m_char_003 blesses instead of nodding. */
const PREVIEW_ACTIONS_JIHO: PreviewAction[] = [
  ...PREVIEW_ACTIONS.slice(0, 4),
  { key: 'bless', ko: '축복', en: 'Blessing', ja: '祝福', 'zh-CN': '祝福', 'zh-TW': '祝福', vi: 'Chúc phúc' },
];

/**
 * Which counselors can actually hold a consultation — DERIVED, not listed here any more.
 *
 * This used to be a hand-written `new Set(['yuna_01', 'jiho_01', 'yunjung_01'])` whose comment said
 * "adding a counselor means adding it in BOTH places". That was the bug: nothing checked, and by
 * 14-09 the two lists disagreed — the Unity catalogue had no card at all for Jiho while this app
 * had been offering him for weeks. The roster now comes from the generated registry, so there is
 * one list and `counselorRoster.test.ts` fails if this file drifts from it.
 *
 * Everyone not in it stays visible as "coming soon" rather than hidden: the roster stays honest
 * about what is planned without pretending it is ready.
 */
const BUILT_CHARACTER_IDS = builtCharacterIds;

const RAW: RawCounselor[] = [
  {
    id: 'seoyeon',
    accent: '#8B5CF6',
    category: 'saju',
    conversationCount: 1_820_000,
    isTrending: true,
    characterId: 'seoyeon_01',
    roomId: 'seoyeon_room',
    previewActions: PREVIEW_ACTIONS,
    l10n: {
      ko: {
        name: '서연',
        title: '사주 · 운명 상담사',
        hook: '당신의 운명이 무엇을 경고하려는지 말해줄게요.',
        about:
          '서연은 차분하고 통찰력 있는 시선으로 운명의 흐름을 읽어요. 먼저 귀 기울여 듣고, 다가오는 한 해가 조용히 어디로 향하는지 짚어줍니다.',
        personality: ['차분함', '통찰력', '따뜻함'],
        specialties: ['연애', '커리어', '재물', '인생'],
        tags: ['#사주', '#커리어', '#인생길'],
      },
      en: {
        name: 'Seoyeon',
        title: 'Saju & Destiny Counselor',
        hook: "I'll tell you what your fate is trying to warn you about.",
        about:
          'Seoyeon reads the flow of destiny with a calm, perceptive eye. She listens first, then reveals what the year ahead is quietly moving toward.',
        personality: ['Calm', 'Insightful', 'Warm'],
        specialties: ['Love', 'Career', 'Wealth', 'Life'],
        tags: ['#Saju', '#Career', '#LifePath'],
      },
      ja: {
        name: 'ソヨン',
        title: '四柱推命・運命の相談者',
        hook: 'あなたの運が何を告げようとしているのか、お伝えします。',
        about:
          'ソヨンは落ち着いた洞察のまなざしで運の流れを読みます。まず耳を傾け、これから一年が静かにどこへ向かっているのかを示してくれます。',
        personality: ['穏やか', '洞察力', '温かさ'],
        specialties: ['恋愛', '仕事', '金運', '人生'],
        tags: ['#四柱推命', '#仕事', '#人生の道'],
      },
      'zh-CN': {
        name: '瑞妍',
        title: '八字 · 命运咨询师',
        hook: '你的命想提醒你什么，我说给你听。',
        about:
          '瑞妍以沉静而透彻的眼光读运势的走向。她先听，再指出接下来这一年正悄悄往哪里走。',
        personality: ['沉静', '透彻', '温和'],
        specialties: ['感情', '事业', '财运', '人生'],
        tags: ['#八字', '#事业', '#人生路'],
      },
      'zh-TW': {
        name: '瑞妍',
        title: '八字 · 命運諮詢師',
        hook: '你的命想提醒你什麼，我說給你聽。',
        about:
          '瑞妍以沉靜而透徹的眼光讀運勢的走向。她先聽，再指出接下來這一年正悄悄往哪裡走。',
        personality: ['沉靜', '透徹', '溫和'],
        specialties: ['感情', '事業', '財運', '人生'],
        tags: ['#八字', '#事業', '#人生路'],
      },
      vi: {
        name: 'Seoyeon',
        title: 'Thầy xem tứ trụ · vận mệnh',
        hook: 'Để ta nói cho con nghe vận của con đang muốn nhắc điều gì.',
        about:
          'Seoyeon đọc dòng vận bằng cái nhìn điềm tĩnh và thấu đáo. Cô nghe trước đã, rồi mới chỉ ra năm tới đang lặng lẽ đi về đâu.',
        personality: ['Điềm tĩnh', 'Thấu đáo', 'Ấm áp'],
        specialties: ['Tình cảm', 'Sự nghiệp', 'Tiền bạc', 'Vận trình'],
        tags: ['#TứTrụ', '#SựNghiệp', '#ĐườngĐời'],
      },
    },
  },
  {
    id: 'mina',
    accent: '#F472B6',
    category: 'love',
    conversationCount: 1_240_000,
    isTrending: true,
    characterId: 'mina_01',
    roomId: 'mina_room',
    previewActions: PREVIEW_ACTIONS,
    l10n: {
      ko: {
        name: '미나',
        title: '연애 · 관계 상담사',
        hook: '무슨 일이 있었는지 말해봐요 — 나는 카드가 아니라 사람을 읽어요.',
        about:
          '미나는 솔직하고 자신감 있으면서 장난기도 있어요. 복잡한 마음의 소음을 걷어내고, 당신이 이미 짐작하던 것을 말해줍니다.',
        personality: ['솔직함', '자신감', '유쾌함'],
        specialties: ['연애', '썸', '인간관계'],
        tags: ['#연애', '#썸', '#관계'],
      },
      en: {
        name: 'Mina',
        title: 'Love & Relationships Counselor',
        hook: 'Tell me what happened — I read people, not just cards.',
        about:
          'Mina is direct, confident and a little playful. She cuts through the noise of a complicated heart and tells you what you already suspect.',
        personality: ['Direct', 'Confident', 'Playful'],
        specialties: ['Love', 'Dating', 'Relationships'],
        tags: ['#Love', '#Dating', '#Relationships'],
      },
      ja: {
        name: 'ミナ',
        title: '恋愛・関係の相談者',
        hook: '何があったのか話して — 私はカードじゃなく、人を読むの。',
        about:
          'ミナは率直で自信があって、少しいたずらっぽい人。こじれた心のざわめきを払って、あなたがもう薄々気づいていることを言ってくれます。',
        personality: ['率直', '自信', '軽やか'],
        specialties: ['恋愛', '片想い', '人間関係'],
        tags: ['#恋愛', '#片想い', '#関係'],
      },
      'zh-CN': {
        name: '美娜',
        title: '感情 · 关系咨询师',
        hook: '说说发生了什么 — 我读的是人，不是牌。',
        about:
          '美娜直率、有底气，还带点俏皮。她会拨开一颗乱心里的杂音，把你其实早已猜到的话说出来。',
        personality: ['直率', '有底气', '俏皮'],
        specialties: ['感情', '暧昧', '人际关系'],
        tags: ['#感情', '#暧昧', '#关系'],
      },
      'zh-TW': {
        name: '美娜',
        title: '感情 · 關係諮詢師',
        hook: '說說發生了什麼 — 我讀的是人，不是牌。',
        about:
          '美娜直率、有底氣，還帶點俏皮。她會撥開一顆亂心裡的雜音，把你其實早已猜到的話說出來。',
        personality: ['直率', '有底氣', '俏皮'],
        specialties: ['感情', '曖昧', '人際關係'],
        tags: ['#感情', '#曖昧', '#關係'],
      },
      vi: {
        name: 'Mina',
        title: 'Thầy xem tình cảm · quan hệ',
        hook: 'Kể ta nghe đã xảy ra chuyện gì — ta đọc người, không đọc lá bài.',
        about:
          'Mina thẳng thắn, tự tin, lại có chút tinh nghịch. Cô gạt đi những tiếng ồn trong một trái tim rối, rồi nói ra đúng điều con vốn đã ngờ ngợ.',
        personality: ['Thẳng thắn', 'Tự tin', 'Tinh nghịch'],
        specialties: ['Tình cảm', 'Tình mới chớm', 'Quan hệ'],
        tags: ['#TìnhCảm', '#MớiChớm', '#QuanHệ'],
      },
    },
  },
  {
    id: 'yuna',
    accent: '#38BDF8',
    // The generalist card. She is the only counsellor whose room answers every topic (her Unity
    // seed has always said `General`), so she sits under the broad chip rather than under Career —
    // where she used to compete with Yunjung and Seri, who are genuinely career-only.
    category: 'saju',
    conversationCount: 960_000,
    characterId: 'yuna_01',
    roomId: 'yuna_room',
    previewActions: PREVIEW_ACTIONS,
    l10n: {
      ko: {
        name: '유나',
        title: '무엇이든 듣는 상담사',
        hook: '무슨 이야기든 좋아요. 앉아서 편하게 꺼내 보세요.',
        about:
          '유나는 주제를 가리지 않습니다. 연애든 돈이든 일이든, 요즘 마음에 얹혀 있는 것을 먼저 듣고 사주에서 그 흐름이 어디로 가는지 함께 짚어봅니다. 어디서부터 말해야 할지 모르겠다면, 그 상태로 오셔도 괜찮아요.',
        personality: ['다정함', '편안함', '솔직함'],
        specialties: ['연애', '재물', '커리어', '인간관계', '건강', '인생'],
        tags: ['#무엇이든', '#편안함', '#인생'],
      },
      en: {
        name: 'Yuna',
        title: 'The counsellor who takes any question',
        hook: 'Anything at all. Sit down and start wherever you like.',
        about:
          'Yuna does not sort people by subject. Love, money, work — she listens to whatever is sitting on you at the moment and then follows that thread through your chart. If you do not know where to begin, that is a fine way to arrive.',
        personality: ['Warm', 'Easy to talk to', 'Honest'],
        specialties: ['Love', 'Money', 'Career', 'Relationships', 'Health', 'Life'],
        tags: ['#Anything', '#Warm', '#Life'],
      },
      ja: {
        name: 'ユナ',
        title: '何でも聞く相談役',
        hook: 'どんな話でも構いません。座って、楽に話し始めてください。',
        about:
          'ユナは話題を選びません。恋でもお金でも仕事でも、いま心に引っかかっていることをまず聞き、その流れが四柱のどこへ向かうのかを一緒に見ていきます。どこから話せばいいか分からないまま来ても大丈夫です。',
        personality: ['やさしい', '話しやすい', '率直'],
        specialties: ['恋愛', '金運', '仕事', '人間関係', '健康', '人生'],
        tags: ['#なんでも', '#やさしい', '#人生'],
      },
      'zh-CN': {
        name: '宥娜',
        title: '什么都听的相谈师',
        hook: '什么话都行。坐下来，从哪儿说起都可以。',
        about:
          '宥娜不挑题目。恋爱也好，钱也好，工作也好，她先听你眼下压着的那件事，再顺着它看八字里这股流向哪儿走。不知道从何说起，就这样来也没关系。',
        personality: ['温和', '好说话', '坦率'],
        specialties: ['恋爱', '财运', '事业', '人际', '健康', '人生'],
        tags: ['#什么都问', '#温和', '#人生'],
      },
      'zh-TW': {
        name: '宥娜',
        title: '什麼都聽的相談師',
        hook: '什麼話都行。坐下來，從哪兒說起都可以。',
        about:
          '宥娜不挑題目。戀愛也好，錢也好，工作也好，她先聽你眼下壓著的那件事，再順著它看八字裡這股流向哪兒走。不知道從何說起，就這樣來也沒關係。',
        personality: ['溫和', '好說話', '坦率'],
        specialties: ['戀愛', '財運', '事業', '人際', '健康', '人生'],
        tags: ['#什麼都問', '#溫和', '#人生'],
      },
      vi: {
        name: 'Yuna',
        title: 'Thầy nghe mọi chuyện',
        hook: 'Chuyện gì cũng được. Cứ ngồi xuống, kể từ đâu cũng không sao.',
        about:
          'Yuna không chia người theo chủ đề. Tình cảm, tiền bạc hay công việc — cô nghe trước cái đang đè lên con lúc này, rồi lần theo nó xem trong lá số dòng ấy đi về đâu. Chưa biết bắt đầu từ đâu thì cứ tới như vậy cũng được.',
        personality: ['Dịu dàng', 'Dễ nói chuyện', 'Thẳng thắn'],
        specialties: ['Tình cảm', 'Tiền bạc', 'Sự nghiệp', 'Quan hệ', 'Sức khoẻ', 'Vận trình'],
        tags: ['#ChuyệnGìCũngĐược', '#DịuDàng', '#VậnTrình'],
      },
    },
  },
  {
    id: 'harin',
    accent: '#E9C46A',
    category: 'wealth',
    conversationCount: 540_000,
    isNew: true,
    characterId: 'harin_01',
    roomId: 'harin_room',
    previewActions: PREVIEW_ACTIONS,
    l10n: {
      ko: {
        name: '하린',
        title: '재물 · 운세 리더',
        hook: '돈에는 리듬이 있어요. 당신의 리듬을 보여줄게요.',
        about:
          '하린은 재물을 타이밍과 기질의 문제로 봐요. 당신의 재운이 흐르는 계절과, 조심하는 것이 이득이 되는 지점을 읽어줍니다.',
        personality: ['현실적', '예리함', '솔직함'],
        specialties: ['재물', '투자', '타이밍'],
        tags: ['#재물', '#사주', '#타이밍'],
      },
      en: {
        name: 'Harin',
        title: 'Wealth & Fortune Reader',
        hook: 'Money has a rhythm. I can show you yours.',
        about:
          'Harin treats wealth as a matter of timing and temperament. She reads the seasons of your fortune and where caution pays.',
        personality: ['Grounded', 'Sharp', 'Frank'],
        specialties: ['Wealth', 'Investing', 'Timing'],
        tags: ['#Wealth', '#Saju', '#Timing'],
      },
      ja: {
        name: 'ハリン',
        title: '金運・運勢の読み手',
        hook: 'お金にはリズムがあります。あなたのリズムをお見せしましょう。',
        about:
          'ハリンは金運を、時期と気質の問題として見ます。あなたの財の運が流れる季節と、慎重さが得になる地点を読んでくれます。',
        personality: ['地に足がつく', '鋭い', '率直'],
        specialties: ['金運', '投資', '時期'],
        tags: ['#金運', '#四柱推命', '#時期'],
      },
      'zh-CN': {
        name: '荷琳',
        title: '财运 · 运势解读',
        hook: '钱是有节奏的。我把你的节奏指给你看。',
        about:
          '荷琳把财运看成时机与性情的事。她读的是你财气流动的季节，以及在哪一段谨慎反而更划算。',
        personality: ['接地气', '锐利', '直言'],
        specialties: ['财运', '投资', '时机'],
        tags: ['#财运', '#八字', '#时机'],
      },
      'zh-TW': {
        name: '荷琳',
        title: '財運 · 運勢解讀',
        hook: '錢是有節奏的。我把你的節奏指給你看。',
        about:
          '荷琳把財運看成時機與性情的事。她讀的是你財氣流動的季節，以及在哪一段謹慎反而更划算。',
        personality: ['接地氣', '銳利', '直言'],
        specialties: ['財運', '投資', '時機'],
        tags: ['#財運', '#八字', '#時機'],
      },
      vi: {
        name: 'Harin',
        title: 'Thầy xem tiền bạc · vận thế',
        hook: 'Tiền có nhịp của nó. Để ta chỉ cho con nhịp của con.',
        about:
          'Harin xem chuyện tiền bạc là chuyện của thời điểm và tính khí. Cô đọc ra mùa nào tài vận của con đang chảy, và chỗ nào cẩn trọng lại là có lời.',
        personality: ['Thực tế', 'Sắc sảo', 'Nói thẳng'],
        specialties: ['Tiền bạc', 'Đầu tư', 'Thời điểm'],
        tags: ['#TiềnBạc', '#TứTrụ', '#ThờiĐiểm'],
      },
    },
  },
  {
    id: 'doyun',
    accent: '#A78BFA',
    category: 'tarot',
    conversationCount: 410_000,
    isNew: true,
    characterId: 'doyun_01',
    roomId: 'doyun_room',
    previewActions: PREVIEW_ACTIONS,
    l10n: {
      ko: {
        name: '도윤',
        title: '타로 · 직관 가이드',
        hook: '함께 카드를 뽑고, 당신이 느끼는 것부터 시작해요.',
        about:
          '도윤은 직관과 이미지로 작업해요. 카드가 판결을 내리기보다는, 대화를 여는 실마리가 되도록 이끌어줍니다.',
        personality: ['다정함', '직관적', '호기심'],
        specialties: ['타로', '연애', '인생'],
        tags: ['#타로', '#직관', '#연애'],
      },
      en: {
        name: 'Doyun',
        title: 'Tarot & Intuition Guide',
        hook: 'Draw a card with me and we start from what you feel.',
        about:
          'Doyun works with intuition and imagery, letting the cards open a conversation rather than deliver a verdict.',
        personality: ['Gentle', 'Intuitive', 'Curious'],
        specialties: ['Tarot', 'Love', 'Life'],
        tags: ['#Tarot', '#Intuition', '#Love'],
      },
      ja: {
        name: 'ドユン',
        title: 'タロット・直感のガイド',
        hook: '一緒に一枚引いて、あなたが感じたことから始めましょう。',
        about:
          'ドユンは直感とイメージで進めます。カードが判決を下すのではなく、話のきっかけになるように導いてくれます。',
        personality: ['やさしい', '直感的', '好奇心'],
        specialties: ['タロット', '恋愛', '人生'],
        tags: ['#タロット', '#直感', '#恋愛'],
      },
      'zh-CN': {
        name: '道润',
        title: '塔罗 · 直觉引导',
        hook: '跟我抽一张牌，从你感觉到的那点开始。',
        about:
          '道润凭直觉和意象来读。他让牌成为一段对话的开头，而不是一纸判决。',
        personality: ['温和', '直觉', '好奇'],
        specialties: ['塔罗', '感情', '人生'],
        tags: ['#塔罗', '#直觉', '#感情'],
      },
      'zh-TW': {
        name: '道潤',
        title: '塔羅 · 直覺引導',
        hook: '跟我抽一張牌，從你感覺到的那點開始。',
        about:
          '道潤憑直覺和意象來讀。他讓牌成為一段對話的開頭，而不是一紙判決。',
        personality: ['溫和', '直覺', '好奇'],
        specialties: ['塔羅', '感情', '人生'],
        tags: ['#塔羅', '#直覺', '#感情'],
      },
      vi: {
        name: 'Doyun',
        title: 'Người dẫn tarot · trực giác',
        hook: 'Rút một lá cùng ta, rồi bắt đầu từ chính cảm giác của con.',
        about:
          'Doyun làm việc bằng trực giác và hình ảnh. Anh để lá bài mở ra một cuộc chuyện trò, chứ không tuyên một bản án.',
        personality: ['Dịu dàng', 'Trực giác', 'Tò mò'],
        specialties: ['Tarot', 'Tình cảm', 'Vận trình'],
        tags: ['#Tarot', '#TrựcGiác', '#TìnhCảm'],
      },
    },
  },
  {
    id: 'jiho',
    accent: '#34D399',
    category: 'life',
    conversationCount: 720_000,
    characterId: 'jiho_01',
    roomId: 'jiho_room',
    previewActions: PREVIEW_ACTIONS_JIHO,
    l10n: {
      ko: {
        name: '지호',
        title: '인생 · 의미 상담사',
        hook: '삶이 멈춘 것 같을 때, 다음의 솔직한 한 걸음을 함께 찾아요.',
        about:
          '지호는 따뜻하고 사려 깊어서, 잘못된 건 없는데 아무것도 맞지 않는 계절에 잘 맞아요. 당신이 진짜 원하는 것에 이름을 붙이도록 도와줍니다.',
        personality: ['따뜻함', '성찰적', '인내심'],
        specialties: ['인생', '의미', '성장'],
        tags: ['#인생', '#의미', '#성장'],
      },
      en: {
        name: 'Jiho',
        title: 'Life Path & Meaning Counselor',
        hook: "When life feels stuck, let's find the next honest step.",
        about:
          'Jiho is warm and reflective, good for the seasons when nothing is wrong yet nothing feels right. He helps you name what you actually want.',
        personality: ['Warm', 'Reflective', 'Patient'],
        specialties: ['Life', 'Meaning', 'Growth'],
        tags: ['#Life', '#Meaning', '#Growth'],
      },
      ja: {
        name: 'ジホ',
        title: '人生・意味の相談者',
        hook: '人生が止まって見えるとき、次の正直な一歩を一緒に探しましょう。',
        about:
          'ジホは温かく、よく考える人。何も間違っていないのに何もしっくりこない季節に合います。あなたが本当に望んでいるものに、名前をつける手助けをしてくれます。',
        personality: ['温かい', '思慮深い', '辛抱強い'],
        specialties: ['人生', '意味', '成長'],
        tags: ['#人生', '#意味', '#成長'],
      },
      'zh-CN': {
        name: '志豪',
        title: '人生 · 意义咨询师',
        hook: '当日子像卡住了，我们一起找出下一步该怎么走才不违心。',
        about:
          '志豪温和又爱琢磨，很适合那种什么都没出错、却什么都不对劲的时节。他帮你给心里真正想要的东西起个名字。',
        personality: ['温和', '爱琢磨', '有耐心'],
        specialties: ['人生', '意义', '成长'],
        tags: ['#人生', '#意义', '#成长'],
      },
      'zh-TW': {
        name: '志豪',
        title: '人生 · 意義諮詢師',
        hook: '當日子像卡住了，我們一起找出下一步該怎麼走才不違心。',
        about:
          '志豪溫和又愛琢磨，很適合那種什麼都沒出錯、卻什麼都不對勁的時節。他幫你給心裡真正想要的東西起個名字。',
        personality: ['溫和', '愛琢磨', '有耐心'],
        specialties: ['人生', '意義', '成長'],
        tags: ['#人生', '#意義', '#成長'],
      },
      vi: {
        name: 'Jiho',
        title: 'Thầy xem vận trình · ý nghĩa',
        hook: 'Khi đời như khựng lại, cùng tìm bước kế tiếp mà con thấy thật lòng.',
        about:
          'Jiho ấm áp và hay ngẫm, hợp với những mùa chẳng có gì sai mà cũng chẳng có gì vừa vặn. Anh giúp con gọi tên đúng thứ mình thật sự muốn.',
        personality: ['Ấm áp', 'Hay ngẫm', 'Kiên nhẫn'],
        specialties: ['Vận trình', 'Ý nghĩa', 'Trưởng thành'],
        tags: ['#VậnTrình', '#ÝNghĩa', '#TrưởngThành'],
      },
    },
  },
  /**
   * Go Yunjung — the career specialist, and since 16-09 the roster's first counsellor whose CARD is
   * held to what her room actually does.
   *
   * ⚠️ `specialties` is not decoration: her topic picker shows `career` + `wealth` and nothing else
   * (`groupTopicsFor`), so the card has to advertise those two. It used to read "Career, Decisions,
   * Life" — a menu of one thing under a card promising three is the specialty made decorative, the
   * exact failure the filter was introduced to fix.
   *
   * ⚠️ VIETNAMESE PRONOUNS ARE THE REGISTER. Her hook said "Ta … con", the grandmaster-to-disciple
   * pairing every other card uses — while her own room speaks "tôi / bạn" (`flow/voice.ts`). One
   * counsellor cannot address the player two ways in one session, and it is the CARD that was
   * wrong: she talks straight to an adult about work and money. The other five languages already
   * carried that in their politeness level and needed no change.
   */
  {
    id: 'yunjung',
    accent: '#B07C9B',
    category: 'career',
    isNew: true,
    characterId: 'yunjung_01',
    roomId: 'yunjung_room',
    previewActions: PREVIEW_ACTIONS_YUNJUNG,
    l10n: {
      ko: {
        name: '고윤정',
        title: '현실을 직시하는 전문가',
        hook: '돌려 말하지 않습니다. 들으실 준비가 되셨나요?',
        about:
          '고윤정은 사주를 위로가 아니라 자료로 읽습니다. 지금 무엇이 사실인지 먼저 정리하고, 그 위에서 고를 수 있는 길을 짚어줍니다.',
        personality: ['직설적', '냉철함', '현실적'],
        specialties: ['커리어', '재물', '선택'],
        tags: ['#커리어', '#재물', '#직설'],
      },
      en: {
        name: 'Go Yunjung',
        title: 'The one who looks straight at reality',
        hook: 'I do not soften things. Are you ready to hear it?',
        about:
          'Yunjung reads a chart as evidence, not as comfort. She settles what is actually true first, and only then points at the choices that are still open.',
        personality: ['Direct', 'Clear-eyed', 'Practical'],
        specialties: ['Career', 'Money', 'Decisions'],
        tags: ['#Career', '#Money', '#Straight'],
      },
      ja: {
        name: 'コ・ユンジョン',
        title: '現実を直視する専門家',
        hook: '遠回しには言いません。聞く覚悟はありますか。',
        about:
          'ユンジョンは四柱を慰めではなく資料として読みます。まず事実を整理し、その上で残されている選択肢を示します。',
        personality: ['率直', '冷静', '現実的'],
        specialties: ['仕事', '金運', '決断'],
        tags: ['#仕事', '#金運', '#率直'],
      },
      'zh-CN': {
        name: '高允祯',
        title: '直面现实的专家',
        hook: '我不绕弯子。你准备好听了吗？',
        about:
          '允祯把八字当资料读，不当安慰。她先把现在真实的情况理清楚，再指出还能选的路。',
        personality: ['直接', '冷静', '务实'],
        specialties: ['事业', '财运', '抉择'],
        tags: ['#事业', '#财运', '#直说'],
      },
      'zh-TW': {
        name: '高允禎',
        title: '直面現實的專家',
        hook: '我不繞彎子。你準備好聽了嗎？',
        about:
          '允禎把八字當資料讀，不當安慰。她先把現在真實的情況理清楚，再指出還能選的路。',
        personality: ['直接', '冷靜', '務實'],
        specialties: ['事業', '財運', '抉擇'],
        tags: ['#事業', '#財運', '#直說'],
      },
      vi: {
        name: 'Go Yunjung',
        title: 'Chuyên gia nhìn thẳng vào thực tế',
        hook: 'Tôi không nói vòng. Bạn nghe thẳng được chứ?',
        about:
          'Yunjung đọc lá số như đọc dữ liệu, không phải như lời an ủi. Cô chốt lại điều gì đang là sự thật trước đã, rồi mới chỉ ra những đường còn chọn được.',
        personality: ['Thẳng thắn', 'Tỉnh táo', 'Thực tế'],
        specialties: ['Sự nghiệp', 'Tiền bạc', 'Quyết định'],
        tags: ['#SựNghiệp', '#TiềnBạc', '#NóiThẳng'],
      },
    },
  },
  /**
   * The meditation guide — the app's first counsellor who does not talk.
   *
   * Her "room" is the RN breathing screen, so she is playable TODAY while everyone else waits on a
   * model: no Unity scene, no clips, no voice. That is recorded in the registry as `silent`, not
   * left for a reader to infer from three empty fields.
   *
   * She is a card and not a tab (15-09). A tab for one feature does not survive the second one —
   * add another guide and it is another card here, and nothing else moves.
   */
  {
    id: 'breathe',
    accent: '#C9A6C4',
    category: 'meditation',
    characterId: 'breathe_01',
    roomId: 'breathe_room',
    isNew: true,
    previewActions: [],
    l10n: {
      ko: {
        name: '하은',
        title: '호흡 · 명상 가이드',
        hook: '십 분이면 돼요. 숨만 고르고 가세요.',
        about:
          '하은은 아무것도 묻지 않습니다. 십 분 동안 들이쉬고 내쉬는 것만 함께 해요. 사주도 조언도 없고, 오늘 하루를 잠시 내려놓는 자리입니다.',
        personality: ['고요함', '느긋함', '다정함'],
        specialties: ['호흡', '명상', '휴식'],
        tags: ['#명상', '#호흡', '#십분'],
      },
      en: {
        name: 'Haeun',
        title: 'Breathing & meditation guide',
        hook: 'Ten minutes is enough. Just breathe, then go.',
        about:
          'Haeun asks you nothing. For ten minutes you breathe in and out together — no chart, no advice, just somewhere to put the day down for a while.',
        personality: ['Still', 'Unhurried', 'Kind'],
        specialties: ['Breathing', 'Meditation', 'Rest'],
        tags: ['#Meditation', '#Breathe', '#TenMinutes'],
      },
      ja: {
        name: 'ハウン',
        title: '呼吸・瞑想ガイド',
        hook: '十分で充分です。呼吸を整えて行ってください。',
        about:
          'ハウンは何も聞きません。十分のあいだ、ただ一緒に吸って吐くだけ。四柱も助言もなく、今日を少し下ろしておく場所です。',
        personality: ['静けさ', 'ゆったり', 'やさしさ'],
        specialties: ['呼吸', '瞑想', '休息'],
        tags: ['#瞑想', '#呼吸', '#十分'],
      },
      'zh-CN': {
        name: '荷恩',
        title: '呼吸 · 冥想向导',
        hook: '十分钟就够。把呼吸调匀再走。',
        about:
          '荷恩什么都不问。十分钟里只陪你一吸一呼——没有八字，没有建议，只是把今天先放下的地方。',
        personality: ['安静', '从容', '温和'],
        specialties: ['呼吸', '冥想', '休息'],
        tags: ['#冥想', '#呼吸', '#十分钟'],
      },
      'zh-TW': {
        name: '荷恩',
        title: '呼吸 · 冥想嚮導',
        hook: '十分鐘就夠。把呼吸調勻再走。',
        about:
          '荷恩什麼都不問。十分鐘裡只陪你一吸一呼——沒有八字，沒有建議，只是把今天先放下的地方。',
        personality: ['安靜', '從容', '溫和'],
        specialties: ['呼吸', '冥想', '休息'],
        tags: ['#冥想', '#呼吸', '#十分鐘'],
      },
      vi: {
        name: 'Haeun',
        title: 'Người dẫn thở · thiền',
        hook: 'Mười phút là đủ. Thở cho đều rồi đi.',
        about:
          'Haeun không hỏi con điều gì. Mười phút đó chỉ cùng con hít vào thở ra — không lá số, không lời khuyên, chỉ là chỗ đặt ngày hôm nay xuống một lát.',
        personality: ['Tĩnh', 'Thong thả', 'Dịu dàng'],
        specialties: ['Hơi thở', 'Thiền', 'Nghỉ ngơi'],
        tags: ['#Thiền', '#HơiThở', '#MườiPhút'],
      },
    },
  },
  /**
   * Theo (테오) — from the character sheet delivered 15-09: turnaround, eight expressions, four
   * animation poses (Welcome / Thinking / Explaining / Revealing) and a study of his own.
   *
   * ⚠️ The sheet is titled "Career & Money Guidance" and that is NOT his role. He is the
   * relationship counsellor — the brief that ordered him, confirmed 15-09. The copy below follows
   * the brief; only the look comes from the sheet. His voice follows the role too (`metal`/sudam,
   * this roster's relationship expert), because a wrong voice is re-recording, not re-typing.
   *
   * His ROOM exists since 16-09: ConsultationSolo03, "Theo's Study", built to the object list on
   * the sheet. What is still missing is his MODEL, so the room's seat holds a stand-in sage and the
   * card stays locked — `comingSoon` is derived from the built-model list, never hand-set.
   */
  {
    id: 'theo',
    accent: '#3B4E8C',
    category: 'love',
    characterId: 'theo_01',
    roomId: 'theo_study',
    isNew: true,
    previewActions: PREVIEW_ACTIONS_THEO,
    l10n: {
      ko: {
        name: '테오',
        title: '인연 · 관계 상담사',
        hook: '끊을 인연인지 이어갈 인연인지, 같이 봅시다.',
        about:
          '테오는 사람 사이의 일을 운으로만 풀지 않습니다. 두 사람의 기운이 어디서 어긋나는지 차분히 짚고, 지금 이 관계에서 당신이 쥘 수 있는 선택까지 함께 정리합니다.',
        personality: ['냉철함', '논리적', '은근한 다정함'],
        specialties: ['연애', '인간관계', '가족'],
        tags: ['#연애', '#인연', '#관계'],
      },
      en: {
        name: 'Theo',
        title: 'Ties & relationships counsellor',
        hook: 'A tie worth keeping, or worth ending — let us look at it together.',
        about:
          'Theo does not explain people away with fortune alone. He finds, calmly, where two charts pull against each other, and settles what is actually yours to decide in the relationship you are in now.',
        personality: ['Cool-headed', 'Logical', 'Quietly kind'],
        specialties: ['Love', 'Relationships', 'Family'],
        tags: ['#Love', '#Ties', '#Relationships'],
      },
      ja: {
        name: 'テオ',
        title: '縁・関係の相談役',
        hook: '切る縁か、続ける縁か。一緒に見ていきましょう。',
        about:
          'テオは人と人の問題を運だけで片づけません。二人の気がどこで食い違うのかを静かに示し、今のその関係であなたが選べることまで一緒に整理します。',
        personality: ['冷静', '論理的', 'さりげない優しさ'],
        specialties: ['恋愛', '人間関係', '家族'],
        tags: ['#恋愛', '#縁', '#関係'],
      },
      'zh-CN': {
        name: '泰奥',
        title: '缘分 · 关系顾问',
        hook: '该断的缘还是该续的缘，我们一起看。',
        about:
          '泰奥不把人与人的事只推给运气。他冷静地指出两个人的气在哪里相冲，再把此刻这段关系里你真正能决定的事一条条理清。',
        personality: ['冷静', '有逻辑', '不动声色的体贴'],
        specialties: ['恋爱', '人际', '家庭'],
        tags: ['#恋爱', '#缘分', '#关系'],
      },
      'zh-TW': {
        name: '泰奧',
        title: '緣分 · 關係顧問',
        hook: '該斷的緣還是該續的緣，我們一起看。',
        about:
          '泰奧不把人與人的事只推給運氣。他冷靜地指出兩個人的氣在哪裡相沖，再把此刻這段關係裡你真正能決定的事一條條理清。',
        personality: ['冷靜', '有邏輯', '不動聲色的體貼'],
        specialties: ['戀愛', '人際', '家庭'],
        tags: ['#戀愛', '#緣分', '#關係'],
      },
      vi: {
        name: 'Theo',
        title: 'Cố vấn nhân duyên · quan hệ',
        hook: 'Duyên nên giữ hay nên buông, ta cùng nhìn cho rõ.',
        about:
          'Theo không đổ chuyện người với người cho số phận. Anh điềm tĩnh chỉ ra khí của hai người vênh nhau ở đâu, rồi cùng con sắp lại những điều con thật sự quyết được trong mối quan hệ lúc này.',
        personality: ['Lạnh đầu', 'Có logic', 'Tử tế ngầm'],
        specialties: ['Tình cảm', 'Quan hệ', 'Gia đình'],
        tags: ['#TìnhCảm', '#NhânDuyên', '#QuanHệ'],
      },
    },
  },
];

function localize(raw: RawCounselor, lang: Lang): CounselorSummary {
  const c = raw.l10n[lang];
  return {
    id: raw.id,
    accent: raw.accent,
    // Undefined for a counselor with no art yet — the card falls back to the accent block rather
    // than rendering an empty well. Looked up here so no screen has to know where art lives.
    cardImage: COUNSELOR_CARD_ART[raw.id],
    avatarImage: COUNSELOR_AVATAR_ART[raw.id],
    category: raw.category,
    conversationCount: raw.conversationCount,
    isNew: raw.isNew,
    isTrending: raw.isTrending,
    characterId: raw.characterId,
    roomId: raw.roomId,
    // Derived, not authored: the flag follows the model list above, so it cannot drift out of
    // sync with reality the way six hand-set booleans would.
    comingSoon: !BUILT_CHARACTER_IDS.has(raw.characterId),
    name: c.name,
    title: c.title,
    hook: c.hook,
    about: c.about,
    personality: c.personality,
    specialties: c.specialties,
    tags: c.tags,
    previews: raw.previewActions.map(a => ({
      id: `${raw.id}_${a.key}`,
      label: a[lang],
      // Undefined for a counselor with no 3D model — there is nothing to render, and the carousel
      // says so rather than offering a play button over a colour block.
      strip: PREVIEW_STRIPS[raw.id]?.[a.key],
    })),
  };
}

/**
 * The roster, with the counselors you can actually consult first.
 *
 * Sorted HERE rather than in each screen: Home and Discover both start from this list and then
 * filter it — by category, by trending, by new — so a screen that sorted for itself would leave the
 * others showing coming-soon characters above ones that work. One order, defined once.
 *
 * Partitioned rather than `.sort()`ed on purpose. Both halves keep the order they were authored in,
 * which is the order the feed was designed to read in; a comparator returning 0 for everything else
 * relies on sort stability to do the same thing less clearly.
 */
export function localizeCounselors(lang: Lang): CounselorSummary[] {
  const all = RAW.map(r => localize(r, lang));
  const soon = all.filter(c => c.comingSoon);
  // Three bands, not two. "Coming soon" covered two very different things once the 15-09 pair was
  // seeded: counselors whose identity is decided and whose art is being made (they have a row in
  // the generated registry — persona, tone and room all chosen), and four older placeholders that
  // are a costume board and a name. Showing the placeholders first put the least real cards
  // closest to the top.
  //
  // Derived from the registry rather than hand-ordered, so a counselor moves up the feed by being
  // seeded, not by someone remembering to re-sort this list.
  const announced = soon.filter(c => registryFor(c.characterId));
  const placeholders = soon.filter(c => !registryFor(c.characterId));
  return [...all.filter(c => !c.comingSoon), ...announced, ...placeholders];
}

export function getLocalizedCounselor(
  id: string,
  lang: Lang,
): CounselorSummary | undefined {
  const raw = RAW.find(r => r.id === id);
  return raw ? localize(raw, lang) : undefined;
}

/** Categories shipped in the first version (spec §7). Labels resolved via t(). */
export const CATEGORIES: {
  key: 'recommended' | CounselorSummary['category'];
  labelKey:
    | 'cat.recommended'
    | 'cat.saju'
    | 'cat.love'
    | 'cat.career'
    | 'cat.life'
    | 'cat.meditation';
}[] = [
  { key: 'recommended', labelKey: 'cat.recommended' },
  { key: 'saju', labelKey: 'cat.saju' },
  { key: 'love', labelKey: 'cat.love' },
  { key: 'career', labelKey: 'cat.career' },
  { key: 'life', labelKey: 'cat.life' },
  { key: 'meditation', labelKey: 'cat.meditation' },
];
