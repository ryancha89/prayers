import { CounselorSummary } from '../types';
import { Lang } from '../../../shared/i18n';

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
  previewLabels: { ko: string; en: string }[];
  l10n: Record<Lang, LocalizedContent>;
}

const PREVIEW_ACTIONS: { ko: string; en: string }[] = [
  { ko: '인사하기', en: 'Say Hello' },
  { ko: '미소', en: 'Smile' },
  { ko: '생각', en: 'Thinking' },
  { ko: '설명', en: 'Explaining' },
  { ko: '끄덕임', en: 'Nod' },
];

const RAW: RawCounselor[] = [
  {
    id: 'seoyeon',
    accent: '#8B5CF6',
    category: 'saju',
    conversationCount: 1_820_000,
    isTrending: true,
    characterId: 'seoyeon_01',
    roomId: 'seoyeon_room',
    previewLabels: PREVIEW_ACTIONS,
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
    previewLabels: PREVIEW_ACTIONS,
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
    },
  },
  {
    id: 'yuna',
    accent: '#38BDF8',
    category: 'career',
    conversationCount: 960_000,
    characterId: 'yuna_01',
    roomId: 'yuna_room',
    previewLabels: PREVIEW_ACTIONS,
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
    previewLabels: PREVIEW_ACTIONS,
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
    previewLabels: PREVIEW_ACTIONS,
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
    },
  },
  {
    id: 'jiho',
    accent: '#34D399',
    category: 'life',
    conversationCount: 720_000,
    characterId: 'jiho_01',
    roomId: 'jiho_room',
    previewLabels: PREVIEW_ACTIONS,
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
    },
  },
];

function localize(raw: RawCounselor, lang: Lang): CounselorSummary {
  const c = raw.l10n[lang];
  return {
    id: raw.id,
    accent: raw.accent,
    category: raw.category,
    conversationCount: raw.conversationCount,
    isNew: raw.isNew,
    isTrending: raw.isTrending,
    characterId: raw.characterId,
    roomId: raw.roomId,
    name: c.name,
    title: c.title,
    hook: c.hook,
    about: c.about,
    personality: c.personality,
    specialties: c.specialties,
    tags: c.tags,
    previews: raw.previewLabels.map((p, i) => ({
      id: `${raw.id}_p${i}`,
      label: p[lang],
    })),
  };
}

export function localizeCounselors(lang: Lang): CounselorSummary[] {
  return RAW.map(r => localize(r, lang));
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
