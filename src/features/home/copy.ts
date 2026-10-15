import type { Lang } from '../../shared/i18n';

const ko = {
  question: '오늘 마음은 어떠신가요?', companion: '당신의 마음 곁에',
  quote: '조금 고민이 있나요?\n천천히 이야기해 주세요.', talk: 'Sophia와 대화하기',
  daily: '오늘의 메시지', message: '오늘은 서두르지 마세요', flow: '당신의 흐름 알아보기',
  spaces: '당신을 위한 공간', counseling: '상담', counselingHint: '고민을 나누는 시간',
  meditation: '명상', meditationHint: '잠시 쉬어가는 마음', room: 'My Room', roomHint: '나만의 작은 안식처',
  shop: '상점', shopHint: '마음을 채우는 아이템', close: '닫기', notifications: '알림',
  empty: '새로운 알림이 없어요.', settings: '설정', soon: '준비 중',
  sophiaTitle: 'Sophia를 곧 만나요',
  sophiaHint: 'Sophia와의 대화는 준비 중이에요. 먼저 다른 상담사와 마음속 이야기를 나눠보세요.',
  dailyBody: '모든 답을 오늘 찾지 않아도 괜찮아요. 잠시 숨을 고르고, 지금 가장 마음에 남는 일 하나에 귀 기울여 보세요.',
  choose: '상담사 만나기', roomBody: '좋아하는 아이템으로 나만의 공간을 꾸밀 수 있도록 준비하고 있어요.',
  profile: '내 프로필 보기', shopBody: '공간을 꾸미는 아이템은 준비 중이에요. 상담에 사용하는 질문 티켓은 지금 만나볼 수 있어요.',
  tickets: '질문 티켓 보기',
};
type Copy = Record<keyof typeof ko, string>;
const en: Copy = {
  question: 'How is your heart today?', companion: 'HERE FOR YOU',
  quote: 'Something on your mind?\nTake your time. I’m here.', talk: 'Talk with Sophia',
  daily: 'A message for today', message: 'There’s no need to rush today', flow: 'Explore your path',
  spaces: 'A space for you', counseling: 'Counseling', counselingHint: 'Share what’s on your mind',
  meditation: 'Meditation', meditationHint: 'A moment to breathe', room: 'My Room', roomHint: 'Your little sanctuary',
  shop: 'Shop', shopHint: 'Little things for your space', close: 'Close', notifications: 'Notifications',
  empty: 'No new notifications.', settings: 'Settings', soon: 'Coming soon',
  sophiaTitle: 'Meet Sophia soon', sophiaHint: 'Conversations with Sophia are on their way. In the meantime, share what’s on your mind with a counselor.',
  dailyBody: 'You don’t have to find every answer today. Take a breath and listen to the one thing that stays on your mind.',
  choose: 'Meet a counselor', roomBody: 'Your own space to decorate with your favorite items is on its way.',
  profile: 'View my profile', shopBody: 'Items for your space are on their way. Question tickets for counseling are available now.', tickets: 'View question tickets',
};
// Fall back to English for newly introduced copy until localized editions are available.
export const homeCopy = (lang: Lang): Copy => lang === 'ko' ? ko : en;
