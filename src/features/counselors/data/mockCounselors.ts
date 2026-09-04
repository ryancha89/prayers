import { CounselorSummary } from '../types';
import { Lang } from '../../../shared/i18n';
import { COUNSELOR_AVATAR_ART, COUNSELOR_CARD_ART } from '../assets';
import { PREVIEW_STRIPS } from '../assets/previews';

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

/** m_char_003 blesses instead of nodding. */
const PREVIEW_ACTIONS_JIHO: PreviewAction[] = [
  ...PREVIEW_ACTIONS.slice(0, 4),
  { key: 'bless', ko: '축복', en: 'Blessing', ja: '祝福', 'zh-CN': '祝福', 'zh-TW': '祝福', vi: 'Chúc phúc' },
];

/**
 * The characterIds that have a 3D model in ConsultationSolo, and therefore the ones a consultation
 * can actually be held with.
 *
 *   yuna_01 → persona `wood` → f_char_002 (female)
 *   jiho_01 → persona `dosa` → m_char_003 (male)
 *
 * This list is the counterpart of RNBridge.PersonaFor on the Unity side: adding a counselor means
 * adding it in BOTH places, and the pair is what stops a name being offered before its body exists.
 * Everyone not named here is listed as "coming soon" rather than hidden — the roster stays honest
 * about what is planned without pretending it is ready.
 */
const BUILT_CHARACTER_IDS = new Set(['yuna_01', 'jiho_01']);

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
    category: 'career',
    conversationCount: 960_000,
    characterId: 'yuna_01',
    roomId: 'yuna_room',
    previewActions: PREVIEW_ACTIONS,
    l10n: {
      ko: {
        name: '유나',
        title: '커리어 · 인생 상담사',
        hook: '당신의 일이 정말 어디로 향하는지 함께 또렷하게 봐요.',
        about:
          '유나는 논리적이고 침착해서, 결정이 무겁게 느껴질 때 든든한 사람이에요. 선택하기 전에 두려움과 진짜 신호를 구분하도록 도와줍니다.',
        personality: ['논리적', '침착함', '지지적'],
        specialties: ['커리어', '인생', '성장'],
        tags: ['#커리어', '#인생', '#결정'],
      },
      en: {
        name: 'Yuna',
        title: 'Career & Life Counselor',
        hook: "Let's think clearly about where your work is really headed.",
        about:
          'Yuna is logical and composed, a steady presence when a decision feels heavy. She helps you separate fear from signal before you choose.',
        personality: ['Logical', 'Composed', 'Supportive'],
        specialties: ['Career', 'Life', 'Growth'],
        tags: ['#Career', '#Life', '#Decisions'],
      },
      ja: {
        name: 'ユナ',
        title: '仕事・人生の相談者',
        hook: 'あなたの仕事が本当はどこへ向かうのか、一緒にはっきり見ましょう。',
        about:
          'ユナは理屈が通っていて落ち着いているので、決断が重く感じるときに頼りになります。選ぶ前に、不安と本当の合図を切り分ける手助けをしてくれます。',
        personality: ['理知的', '落ち着き', '支えになる'],
        specialties: ['仕事', '人生', '成長'],
        tags: ['#仕事', '#人生', '#決断'],
      },
      'zh-CN': {
        name: '侑娜',
        title: '事业 · 人生咨询师',
        hook: '你的工作到底在往哪走，我们一起看清楚。',
        about:
          '侑娜讲道理、沉得住气，在决定压得人喘不过气的时候特别靠得住。她会帮你在下决心之前，把害怕和真正的信号分开。',
        personality: ['讲道理', '沉稳', '托得住'],
        specialties: ['事业', '人生', '成长'],
        tags: ['#事业', '#人生', '#抉择'],
      },
      'zh-TW': {
        name: '侑娜',
        title: '事業 · 人生諮詢師',
        hook: '你的工作到底在往哪走，我們一起看清楚。',
        about:
          '侑娜講道理、沉得住氣，在決定壓得人喘不過氣的時候特別靠得住。她會幫你在下決心之前，把害怕和真正的信號分開。',
        personality: ['講道理', '沉穩', '托得住'],
        specialties: ['事業', '人生', '成長'],
        tags: ['#事業', '#人生', '#抉擇'],
      },
      vi: {
        name: 'Yuna',
        title: 'Thầy xem sự nghiệp · vận trình',
        hook: 'Cùng nhìn cho rõ công việc của con thật ra đang đi về đâu.',
        about:
          'Yuna có lý lẽ và điềm đạm, rất đáng dựa vào những lúc một quyết định đè nặng. Cô giúp con tách nỗi sợ ra khỏi tín hiệu thật trước khi chọn.',
        personality: ['Có lý lẽ', 'Điềm đạm', 'Nâng đỡ'],
        specialties: ['Sự nghiệp', 'Vận trình', 'Trưởng thành'],
        tags: ['#SựNghiệp', '#VậnTrình', '#QuyếtĐịnh'],
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
  return [...all.filter(c => !c.comingSoon), ...all.filter(c => c.comingSoon)];
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
  labelKey: 'cat.recommended' | 'cat.saju' | 'cat.love' | 'cat.career' | 'cat.life';
}[] = [
  { key: 'recommended', labelKey: 'cat.recommended' },
  { key: 'saju', labelKey: 'cat.saju' },
  { key: 'love', labelKey: 'cat.love' },
  { key: 'career', labelKey: 'cat.career' },
  { key: 'life', labelKey: 'cat.life' },
];
