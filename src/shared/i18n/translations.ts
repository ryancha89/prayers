import { Lang } from './store';

/** All user-facing UI strings. `{name}`-style tokens are interpolated by t(). */
export const translations = {
  ko: {
    'tab.home': '홈',
    'tab.conversations': '대화',
    'tab.discover': '발견',
    'tab.my': '마이',

    'cat.recommended': '추천',
    'cat.saju': '사주',
    'cat.love': '연애',
    'cat.career': '커리어',
    'cat.life': '인생',
    'cat.wealth': '재물',
    'cat.tarot': '타로',
    'cat.relationships': '인간관계',

    'card.conversations': '{count}회 상담',

    'detail.preview': '미리보기',
    'detail.previewComingSoon': '3D 모델이 준비되면 미리보기가 열립니다.',
    'detail.about': '{name} 소개',
    'detail.specialties': '전문 분야',
    'detail.start': '상담 시작하기',
    'detail.comingSoon': '준비 중이에요',
    'detail.notFound': '상담사를 찾을 수 없어요.',

    'subject.title': '누구에 대해 상담할까요?',
    'subject.with': '{name} 상담사와',
    'subject.myself': '나 자신',
    'subject.saved': '저장된 사람',
    'subject.add': '사람 추가',
    'subject.continue': '계속하기',

    'addSubject.title': '사람 추가',
    'addSubject.name': '이름',
    'addSubject.namePlaceholder': '예: 김민지',
    'addSubject.birthDate': '생년월일',
    'addSubject.birthTime': '태어난 시각 (선택)',
    'addSubject.save': '저장하기',

    'topic.title': '어떤 이야기를 나눌까요?',
    'topic.subtitle': '상담 주제를 하나 골라주세요 — 자세한 이야기는 {name} 상담사와 나누게 돼요.',
    'topic.enter': '상담실 입장하기',
    'topic.love': '연애',
    'topic.career': '커리어',
    'topic.wealth': '재물',
    'topic.relationships': '인간관계',
    'topic.life': '인생',
    'topic.other': '기타',

    'unity.preparing': '상담실을 준비하고 있어요…',
    'unity.noTickets.title': '질문권이 없어요',
    'unity.noTickets.body': '질문권을 마련한 뒤에 상담실에 들어갈 수 있어요.',
    'unity.noTickets.back': '돌아가기',
    'unity.waiting': '{name} 상담사가 기다리고 있어요.',
    'unity.tip1': '향이 피어오르고, 상담사가 자리를 정돈하고 있어요.',
    'unity.tip2': '사주는 태어난 순간의 하늘을 여덟 글자에 담은 지도예요.',
    'unity.tip3': '친구에게 묻듯 편하게 물어보세요.',

    'room.placeholder': '무엇이든 물어보세요…',
    'room.waitInput': '상담사의 안내를 기다리는 중…',
    'room.unavailable': '세션을 열 수 없어요.',
    'state.preparing': '준비 중…',
    'state.greeting': '인사 중',
    'state.listening': '듣는 중…',
    'state.thinking': '생각 중…',
    'state.speaking': '말하는 중',

    'conv.title': '대화',
    'conv.recent': '최근',
    'conv.emptyTitle': '아직 대화가 없어요',
    'conv.emptyBody': '상담사를 골라 첫 상담을 시작해 보세요 — 여기에서 언제든 이어갈 수 있어요.',
    'conv.tapToContinue': '탭하여 상담을 이어가세요',

    'discover.title': '발견',
    'discover.trending': '인기 상담사',
    'discover.new': '새로운 상담사',
    'discover.browse': '주제별 둘러보기',

    'my.title': '마이',
    'my.savedPeople': '저장된 사람',
    'my.sessions': '상담 횟수',
    'my.favorites': '즐겨찾기',
    'my.credits': '크레딧',
    'my.history': '내역',
    'my.recharge': '충전',
    'my.library': '라이브러리',
    'my.favoriteCounselors': '즐겨찾는 상담사',
    'my.counselingHistory': '상담 기록',
    'my.settings': '설정',
    'my.account': '계정',
    'my.notifications': '알림',
    'my.terms': '약관',
    'my.privacy': '개인정보',
    'my.language': '언어',
  },
  en: {
    'tab.home': 'Home',
    'tab.conversations': 'Conversations',
    'tab.discover': 'Discover',
    'tab.my': 'My',

    'cat.recommended': 'Recommended',
    'cat.saju': 'Saju',
    'cat.love': 'Love',
    'cat.career': 'Career',
    'cat.life': 'Life',
    'cat.wealth': 'Wealth',
    'cat.tarot': 'Tarot',
    'cat.relationships': 'Relationships',

    'card.conversations': '{count} conversations',

    'detail.preview': 'Preview',
    'detail.previewComingSoon': 'Previews open once this counselor has a 3D model.',
    'detail.about': 'About {name}',
    'detail.specialties': 'Specialties',
    'detail.start': 'Start Counseling',
    'detail.comingSoon': 'Coming soon',
    'detail.notFound': 'Counselor not found.',

    'subject.title': 'Who would you like to ask about?',
    'subject.with': 'with {name}',
    'subject.myself': 'Myself',
    'subject.saved': 'Saved People',
    'subject.add': 'Add Person',
    'subject.continue': 'Continue',

    'addSubject.title': 'Add Person',
    'addSubject.name': 'Name',
    'addSubject.namePlaceholder': 'e.g. Minji Kim',
    'addSubject.birthDate': 'Birth date',
    'addSubject.birthTime': 'Birth time (optional)',
    'addSubject.save': 'Save Person',

    'topic.title': 'What would you like to talk about?',
    'topic.subtitle': 'Pick a topic to begin — {name} will take it from there.',
    'topic.enter': 'Enter Counseling Room',
    'topic.love': 'Love',
    'topic.career': 'Career',
    'topic.wealth': 'Wealth',
    'topic.relationships': 'Relationships',
    'topic.life': 'Life',
    'topic.other': 'Other',

    'unity.preparing': 'Preparing your counseling room…',
    'unity.noTickets.title': 'You have no question tickets',
    'unity.noTickets.body': 'Get a ticket and the counselor will read for you.',
    'unity.noTickets.back': 'Go back',
    'unity.waiting': '{name} is waiting for you.',
    'unity.tip1': 'Incense is rising — the counselor is arranging her seat.',
    'unity.tip2': 'A saju chart maps the sky of your birth moment in eight characters.',
    'unity.tip3': 'Ask freely, as you would a close friend.',

    'room.placeholder': 'Ask anything…',
    'room.waitInput': 'Waiting for the counselor…',
    'room.unavailable': 'Session unavailable.',
    'state.preparing': 'Preparing…',
    'state.greeting': 'Greeting',
    'state.listening': 'Listening…',
    'state.thinking': 'Thinking…',
    'state.speaking': 'Speaking',

    'conv.title': 'Conversations',
    'conv.recent': 'Recent',
    'conv.emptyTitle': 'No conversations yet',
    'conv.emptyBody':
      'Choose a counselor and start your first session — it will appear here to continue anytime.',
    'conv.tapToContinue': 'Tap to continue your session',

    'discover.title': 'Discover',
    'discover.trending': 'Trending Counselors',
    'discover.new': 'New Counselors',
    'discover.browse': 'Browse by focus',

    'my.title': 'My',
    'my.savedPeople': 'Saved People',
    'my.sessions': 'Sessions',
    'my.favorites': 'Favorites',
    'my.credits': 'Credits',
    'my.history': 'History',
    'my.recharge': 'Recharge',
    'my.library': 'Library',
    'my.favoriteCounselors': 'Favorite Counselors',
    'my.counselingHistory': 'Counseling History',
    'my.settings': 'Settings',
    'my.account': 'Account',
    'my.notifications': 'Notifications',
    'my.terms': 'Terms',
    'my.privacy': 'Privacy',
    'my.language': 'Language',
  },
} as const;

export type TranslationKey = keyof (typeof translations)['ko'];

export function translate(
  lang: Lang,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  let out: string = translations[lang][key] ?? translations.en[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      out = out.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return out;
}
