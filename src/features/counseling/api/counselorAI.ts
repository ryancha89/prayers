import { Lang } from '../../../shared/i18n';
import {
  CounselingSubject,
  CounselingTopic,
  CounselorAnimation,
  CounselorCamera,
  CounselorEmotion,
  CounselorResponse,
} from '../types';

/**
 * Counselor AI service contract. The mock below stands in for a backend that
 * owns the LLM, memory and TTS (spec §38). Swap the implementation without
 * touching the UI (rule §52-8). Bilingual (KO default / EN).
 */
export interface CounselorAIService {
  greeting(input: {
    counselorName: string;
    subject: CounselingSubject;
    topic?: CounselingTopic;
    resuming?: boolean;
    lastTopicSummary?: string;
    lang: Lang;
  }): Promise<CounselorResponse>;

  reply(input: {
    counselorName: string;
    subject: CounselingSubject;
    topic?: CounselingTopic;
    userText: string;
    turn: number;
    lang: Lang;
  }): Promise<CounselorResponse>;
}

let counter = 1000;
const nextId = () => `response_${counter++}`;

type Beat = {
  text: string;
  emotion: CounselorEmotion;
  animation: CounselorAnimation;
  camera: CounselorCamera;
};

const REPLY_BEATS: Record<Lang, Beat[]> = {
  ko: [
    {
      text: '그렇군요. 올해 이 부분에 움직임이 있어요. 다만 시기를 설명하기 전에 — 이미 마음을 정하신 건가요, 아니면 아직 저울질 중이신가요?',
      emotion: 'thinking',
      animation: 'thinking',
      camera: 'closeUp',
    },
    {
      text: '제가 보는 것과 맞아요. 기운이 막힌 게 아니라 조급할 뿐이에요. 이게 잘 풀린다고 상상하면, 가장 먼저 달라지는 건 뭘까요?',
      emotion: 'neutral',
      animation: 'talk',
      camera: 'default',
    },
    {
      text: '음. 그건 생각보다 중요한 부분이에요. 삶의 다른 곳에서도 이런 패턴을 느낀 적 있으세요?',
      emotion: 'concerned',
      animation: 'concern',
      camera: 'closeUp',
    },
    {
      text: '좋아요. 스스로 생각하는 것보다 훨씬 또렷하시네요. 조금 더 깊이 볼게요 — 그리고 앞으로 몇 달 동안 무엇을 지켜봐야 할지 말씀드릴게요.',
      emotion: 'happy',
      animation: 'nod',
      camera: 'default',
    },
  ],
  en: [
    {
      text: 'I see. There is movement around this for you this year. But before I explain the timing — is this something you have already decided, or are you still weighing it?',
      emotion: 'thinking',
      animation: 'thinking',
      camera: 'closeUp',
    },
    {
      text: 'That fits what I am seeing. The energy is not blocked, only impatient. Tell me — when you imagine this working out, what is the first thing that changes for you?',
      emotion: 'neutral',
      animation: 'talk',
      camera: 'default',
    },
    {
      text: 'Mm. That matters more than you think. Have you noticed this pattern before, in another part of your life?',
      emotion: 'concerned',
      animation: 'concern',
      camera: 'closeUp',
    },
    {
      text: 'Good. You are clearer than you give yourself credit for. Let me look a little deeper — and then I will tell you what I would watch for over the next few months.',
      emotion: 'happy',
      animation: 'nod',
      camera: 'default',
    },
  ],
  ja: [
    {
      text: 'なるほど。今年はこのあたりに動きがあります。ただ時期の話をする前に — もう心は決まっていますか、それともまだ量っているところですか？',
      emotion: 'thinking',
      animation: 'thinking',
      camera: 'closeUp',
    },
    {
      text: '私が見ているものと合っています。気が塞がっているのではなく、急いているだけです。これがうまくいったと想像したら、最初に変わるのは何でしょう？',
      emotion: 'neutral',
      animation: 'talk',
      camera: 'default',
    },
    {
      text: 'ふむ。それは思っているより大事なところです。人生の別の場面でも、同じ形を感じたことはありますか？',
      emotion: 'concerned',
      animation: 'concern',
      camera: 'closeUp',
    },
    {
      text: 'いいですね。ご自身で思っているよりずっとはっきりしています。もう少し深く見て — これから数か月、何を見ておくべきかをお伝えします。',
      emotion: 'happy',
      animation: 'nod',
      camera: 'default',
    },
  ],
  'zh-CN': [
    {
      text: '明白了。今年这一块是有动静的。不过在说时机之前 — 你是已经拿定主意了，还是仍在掂量？',
      emotion: 'thinking',
      animation: 'thinking',
      camera: 'closeUp',
    },
    {
      text: '这和我看到的对得上。气不是堵住了，只是太急。你设想这件事顺了，第一个会变的是什么？',
      emotion: 'neutral',
      animation: 'talk',
      camera: 'default',
    },
    {
      text: '嗯。这一点比你以为的要紧。在生活的别处，你有没有察觉过同样的路数？',
      emotion: 'concerned',
      animation: 'concern',
      camera: 'closeUp',
    },
    {
      text: '很好。你比自己以为的清楚得多。我再往深里看一点 — 然后告诉你未来几个月该盯住什么。',
      emotion: 'happy',
      animation: 'nod',
      camera: 'default',
    },
  ],
  'zh-TW': [
    {
      text: '明白了。今年這一塊是有動靜的。不過在說時機之前 — 你是已經拿定主意了，還是仍在掂量？',
      emotion: 'thinking',
      animation: 'thinking',
      camera: 'closeUp',
    },
    {
      text: '這和我看到的對得上。氣不是堵住了，只是太急。你設想這件事順了，第一個會變的是什麼？',
      emotion: 'neutral',
      animation: 'talk',
      camera: 'default',
    },
    {
      text: '嗯。這一點比你以為的要緊。在生活的別處，你有沒有察覺過同樣的路數？',
      emotion: 'concerned',
      animation: 'concern',
      camera: 'closeUp',
    },
    {
      text: '很好。你比自己以為的清楚得多。我再往深裡看一點 — 然後告訴你未來幾個月該盯住什麼。',
      emotion: 'happy',
      animation: 'nod',
      camera: 'default',
    },
  ],
  vi: [
    {
      text: 'Ta hiểu rồi. Năm nay chỗ này của con có động. Nhưng trước khi nói về thời điểm — con đã quyết rồi, hay vẫn còn đang cân nhắc?',
      emotion: 'thinking',
      animation: 'thinking',
      camera: 'closeUp',
    },
    {
      text: 'Khớp với điều ta đang thấy. Khí không tắc, chỉ là đang nôn nóng. Con thử hình dung chuyện này xuôi — thứ đầu tiên đổi khác sẽ là gì?',
      emotion: 'neutral',
      animation: 'talk',
      camera: 'default',
    },
    {
      text: 'Ừm. Chỗ đó quan trọng hơn con tưởng. Ở một góc khác của đời mình, con có từng thấy cùng một nếp như vậy không?',
      emotion: 'concerned',
      animation: 'concern',
      camera: 'closeUp',
    },
    {
      text: 'Tốt. Con sáng hơn con tự nghĩ nhiều. Để ta nhìn sâu thêm chút nữa — rồi nói con nghe vài tháng tới nên trông chừng điều gì.',
      emotion: 'happy',
      animation: 'nod',
      camera: 'default',
    },
  ],
};

const TOPIC_LABEL: Record<Lang, Record<CounselingTopic, string>> = {
  ko: {
    love: '연애',
    career: '커리어',
    wealth: '재물',
    relationships: '인간관계',
    life: '인생',
    other: '마음에 담긴 것',
  },
  en: {
    love: 'love',
    career: 'your career',
    wealth: 'your wealth',
    relationships: 'your relationships',
    life: 'your life',
    other: 'what is on your mind',
  },
  ja: {
    love: '恋愛',
    career: 'お仕事',
    wealth: '金運',
    relationships: '人間関係',
    life: '人生',
    other: '心にかかっていること',
  },
  'zh-CN': {
    love: '感情',
    career: '你的事业',
    wealth: '你的财运',
    relationships: '你的人际关系',
    life: '你的人生',
    other: '你心里挂着的事',
  },
  'zh-TW': {
    love: '感情',
    career: '你的事業',
    wealth: '你的財運',
    relationships: '你的人際關係',
    life: '你的人生',
    other: '你心裡掛著的事',
  },
  vi: {
    love: 'chuyện tình cảm',
    career: 'chuyện sự nghiệp của con',
    wealth: 'chuyện tiền bạc của con',
    relationships: 'chuyện quan hệ của con',
    life: 'vận trình của con',
    other: 'điều con đang canh cánh',
  },
};

/** Deterministic bilingual mock — short interpretation + follow-up (spec §26). */
export class MockCounselorAI implements CounselorAIService {
  async greeting(input: {
    subject: CounselingSubject;
    topic?: CounselingTopic;
    resuming?: boolean;
    lastTopicSummary?: string;
    lang: Lang;
  }): Promise<CounselorResponse> {
    const { lang } = input;
    if (input.resuming) {
      const topic = input.lastTopicSummary ?? (lang === 'ko' ? '그때 이야기' : 'your situation');
      const text =
        lang === 'ko'
          ? `다시 오셨네요. 지난번엔 ${topic}에 대해 이야기했었죠. 그 뒤로 달라진 게 있나요?`
          : `Welcome back. Last time we were talking about ${topic}. Did anything change since then?`;
      return this.make({ text, emotion: 'happy', animation: 'smile', camera: 'default', followUp: true });
    }

    const who = input.subject.isUser ? null : input.subject.displayName;
    const topicPart = input.topic ? TOPIC_LABEL[lang][input.topic] : null;
    let text: string;
    if (lang === 'ko') {
      const aboutWho = who ? `${who} 님에 대해 ` : '';
      const aboutTopic = topicPart ? `${topicPart} 관련해서 ` : '';
      text = `만나서 반가워요. 편하게 앉으세요. 오늘은 ${aboutWho}${aboutTopic}무엇이 궁금하세요?`;
    } else {
      const aboutWho = who ? ` about ${who}` : '';
      const aboutTopic = topicPart ? ` about ${topicPart}` : '';
      text = `Nice to meet you. Come, sit. What would you like to ask me today${aboutWho}${aboutTopic}?`;
    }
    return this.make({ text, emotion: 'happy', animation: 'smile', camera: 'default', followUp: true });
  }

  async reply(input: { turn: number; lang: Lang }): Promise<CounselorResponse> {
    const beats = REPLY_BEATS[input.lang];
    const beat = beats[input.turn % beats.length];
    return this.make({ ...beat, followUp: beat.camera === 'closeUp' });
  }

  private make(r: Omit<CounselorResponse, 'id'>): CounselorResponse {
    return { id: nextId(), ...r };
  }
}

export const counselorAI: CounselorAIService = new MockCounselorAI();
