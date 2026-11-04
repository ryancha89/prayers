import type { ChapterScript } from '../types';

/**
 * 「수호신 치즈냥이」 1장 · 말하는 고양이와 첫 만남 — from the production pack of 2026-10-30/31
 * (3d-modeling/cheese/references: storyboard CH01-S01..S05, EVT-001/002).
 *
 * Every fixed line below is the storyboard's own wording. The free-talk replies are not scripted:
 * the server writes them (Prayers::StoryTurn) and says what the player meant, and that meaning
 * moves the story — stay → morning chat, leave → he waits outside the door, invite → back on the
 * sofa. The connective narration around those moves ("고양이가 소파에서 내려와…") describes the
 * staging sheets 03_Refusal_Branch.png, which have no fixed line of their own.
 */
const ko: ChapterScript = {
  id: 'cheese-1',
  number: 1,
  title: '말하는 고양이와 첫 만남',
  subtitle: '어느 월요일 아침, 초인종이 울렸다.',
  start: 'arrival',
  prologue: 'prologue',
  nodes: {
    prologue: [
      { kind: 'narr', text: '울음소리가 들려 밥과 물을 놓아줬다. 다음 날 빈 그릇에는 작은 들꽃이 놓여 있었다.' },
      { kind: 'narr', text: '주말 내내 그 자리를 찾다가, 마침내 치즈색 고양이와 눈을 마주쳤다.' },
      { kind: 'goto', node: 'arrival' },
    ],
    arrival: [
      { kind: 'scene', plate: 'door' },
      { kind: 'narr', text: '월요일 아침, 초인종이 울렸다. 문을 살짝 열자 며칠 전 밥을 챙겨줬던 고양이가 나를 올려다보고 있었다.' },
      { kind: 'scene', plate: 'room' },
      { kind: 'narr', text: '열린 문틈으로 쏙 들어온 고양이가 소파에 자리를 잡았다. 발을 닦아줄 수건을 찾는데, 등 뒤에서 목소리가 들렸다.' },
      { kind: 'cat', text: '문부터 닫아라. 찬바람 들어온다.', mood: 'unimpressed' },
      { kind: 'narr', text: '문고리를 잡은 손이 멈췄다. 소파 위 고양이가 태연하게 나를 바라본다.' },
      { kind: 'scene', plate: 'sofa' },
      { kind: 'cat', text: '그렇게 보아도 내가 한 말은 맞다. 놀라는 건 앉아서 해라.', mood: 'smug' },
      { kind: 'cat', text: '내 말을 알아듣는 건 너뿐이다. 다른 사람에게는 그냥 고양이 울음소리로 들리지.' },
      { kind: 'free', stage: 'arrival' },
    ],
    askStay: [
      { kind: 'cat', text: '그런데 내가 잠깐 여기 머물러도 되겠느냐?', mood: 'quiet' },
      { kind: 'free', stage: 'permission' },
    ],
    stayed: [
      { kind: 'set', permission: 'granted' },
      { kind: 'free', stage: 'morning_ready' },
    ],
    leave: [
      { kind: 'set', permission: 'refused' },
      { kind: 'scene', plate: 'room' },
      { kind: 'narr', text: '고양이가 소파에서 내려와 현관으로 걸어갔다. 문밖에 앉더니, 꼬리를 앞발에 감고 나를 돌아봤다.' },
      { kind: 'scene', plate: 'doorstep' },
      { kind: 'free', stage: 'doorstep' },
    ],
    comeBack: [
      { kind: 'set', permission: 'granted' },
      { kind: 'scene', plate: 'room' },
      { kind: 'narr', text: '고양이가 문턱을 넘어 거실을 가로질렀다. 그리고 아무 일 없었다는 듯 다시 소파에 올라앉았다.' },
      { kind: 'scene', plate: 'sofa' },
      { kind: 'free', stage: 'morning_ready' },
    ],
    // EVT-001: permission already given.
    goWork: [
      { kind: 'narr', text: '아직 물어볼 게 한참 남았는데, 시계를 보니 나갈 시간이었다.\n소파에 자리 잡은 고양이가 현관 쪽으로 고개를 돌렸다.' },
      { kind: 'me', text: '다녀올게.' },
      { kind: 'goto', node: 'farewell' },
    ],
    // EVT-002: leaving before ever saying he may stay — the line says it.
    goWorkFirst: [
      { kind: 'narr', text: '아직 물어볼 게 한참 남았는데, 시계를 보니 나갈 시간이었다.\n소파에 자리 잡은 고양이가 현관 쪽으로 고개를 돌렸다.' },
      { kind: 'me', text: '다녀올게. 여기 있어도 돼.' },
      { kind: 'set', permission: 'granted' },
      { kind: 'goto', node: 'farewell' },
    ],
    farewell: [
      { kind: 'cat', text: '알겠다. 다녀와라. 소파는 내가 지키고 있겠다.', mood: 'smug' },
      { kind: 'scene', plate: 'nap', sfx: 'door' },
      { kind: 'narr', text: '아침까지만 해도 평소와 같은 하루일 줄 알았다. 그런데 지금은 말하는 고양이가 우리 집 소파를 차지하고 있다.' },
      { kind: 'narr', text: '아직 물어볼 게 한참 남았는데, 출근할 시간이라니.' },
      { kind: 'narr', text: '돌아와서도 저렇게 태연한 얼굴로 나를 맞아주려나. 오늘은 집에 오면 할 이야기가 있겠다.' },
      { kind: 'end' },
    ],
  },
  stages: {
    arrival: {
      suggestions: ['너 방금 말한 거야?', '일단 앉아도 될까?', '누구 허락으로 들어왔어?'],
      progress: [{ label: '다녀올게. 여기 있어도 돼.', node: 'goWorkFirst', minTurns: 2, permission: ['none'] }],
      nudge: { turns: 2, node: 'askStay' },
    },
    permission: {
      suggestions: ['응, 여기 있어도 돼.', '그전에 너에 대해 조금 더 알려줘.', '아직은 조금 당황스러워.'],
      progress: [{ label: '다녀올게. 여기 있어도 돼.', node: 'goWorkFirst', minTurns: 1, permission: ['none'] }],
    },
    doorstep: {
      suggestions: ['다시 들어와도 돼.', '잠깐만, 거기서 이야기하자.'],
      progress: [],
    },
    morning_ready: {
      suggestions: ['소파는 눈 감고 지키는 거야?', '그럼 우리 집에서 제일 좋은 자리는 어디야?', '다녀올 때까지 기다려줘.'],
      progress: [{ label: '다녀올게', node: 'goWork', minTurns: 1, permission: ['granted'] }],
    },
  },
  next: { title: '2장 · 첫 저녁', note: '퇴근 후 문을 열면, 소파에서 노란 고개가 돌아올 거예요.' },
};

/** English: the storyboard's own English edition (Cheese_Full_Storyboard_EN). */
const en: ChapterScript = {
  ...ko,
  title: 'Meeting the Talking Cat',
  subtitle: 'One Monday morning, the doorbell rang.',
  nodes: {
    prologue: [
      { kind: 'narr', text: 'I heard meowing and left out food and water. The next day, a small wildflower lay in the empty bowl.' },
      { kind: 'narr', text: 'I kept returning to that spot all weekend, until I finally met the eyes of an orange cat.' },
      { kind: 'goto', node: 'arrival' },
    ],
    arrival: [
      { kind: 'scene', plate: 'door' },
      { kind: 'narr', text: 'On Monday morning, the doorbell rang. I opened the door a little. The cat I had fed a few days earlier was looking up at me.' },
      { kind: 'scene', plate: 'room' },
      { kind: 'narr', text: 'The cat slipped through the open door and settled on the sofa. As I looked for a towel to wipe his paws, a voice spoke behind me.' },
      { kind: 'cat', text: "Close the door first. You're letting the cold air in.", mood: 'unimpressed' },
      { kind: 'narr', text: 'My hand froze on the doorknob. The cat on the sofa looked at me as if nothing were unusual.' },
      { kind: 'scene', plate: 'sofa' },
      { kind: 'cat', text: "Staring won't make me wrong. Sit down before you finish being astonished.", mood: 'smug' },
      { kind: 'cat', text: "You're the only one who understands me. To everyone else, it's just a cat meowing." },
      { kind: 'free', stage: 'arrival' },
    ],
    askStay: [
      { kind: 'cat', text: 'By the way, may I stay here for a little while?', mood: 'quiet' },
      { kind: 'free', stage: 'permission' },
    ],
    stayed: ko.nodes.stayed,
    leave: [
      { kind: 'set', permission: 'refused' },
      { kind: 'scene', plate: 'room' },
      { kind: 'narr', text: 'The cat got down from the sofa and walked to the front door. He sat outside, wrapped his tail around his paws and looked back at me.' },
      { kind: 'scene', plate: 'doorstep' },
      { kind: 'free', stage: 'doorstep' },
    ],
    comeBack: [
      { kind: 'set', permission: 'granted' },
      { kind: 'scene', plate: 'room' },
      { kind: 'narr', text: 'The cat stepped over the threshold and crossed the room. Then, as if nothing had happened, he settled back on the sofa.' },
      { kind: 'scene', plate: 'sofa' },
      { kind: 'free', stage: 'morning_ready' },
    ],
    goWork: [
      { kind: 'narr', text: 'I still had so many questions, but a glance at the clock told me it was time to go.\nThe cat settled on the sofa and turned his head toward the front door.' },
      { kind: 'me', text: "I'm off." },
      { kind: 'goto', node: 'farewell' },
    ],
    goWorkFirst: [
      { kind: 'narr', text: 'I still had so many questions, but a glance at the clock told me it was time to go.\nThe cat settled on the sofa and turned his head toward the front door.' },
      { kind: 'me', text: "I'm off. You can stay here." },
      { kind: 'set', permission: 'granted' },
      { kind: 'goto', node: 'farewell' },
    ],
    farewell: [
      { kind: 'cat', text: "Very well. Off you go. I'll guard the sofa.", mood: 'smug' },
      { kind: 'scene', plate: 'nap', sfx: 'door' },
      { kind: 'narr', text: 'This morning, I thought it would be an ordinary day. Now a talking cat has taken over my sofa.' },
      { kind: 'narr', text: 'And just when I have so many questions, it’s time for work.' },
      { kind: 'narr', text: 'Will he greet me with that same unbothered face when I get back? For once, I’ll have something to talk about when I come home.' },
      { kind: 'end' },
    ],
  },
  stages: {
    arrival: {
      ...ko.stages.arrival,
      suggestions: ['Did you just talk?', 'Can I sit down first?', 'Who said you could come in?'],
      progress: [{ label: "I'm off. You can stay here.", node: 'goWorkFirst', minTurns: 2, permission: ['none'] }],
    },
    permission: {
      suggestions: ['Yes, you can stay here.', 'Tell me a little more about yourself first.', "I'm still a bit overwhelmed."],
      progress: [{ label: "I'm off. You can stay here.", node: 'goWorkFirst', minTurns: 1, permission: ['none'] }],
    },
    doorstep: {
      suggestions: ['You can come back in.', "Wait. Let's talk there for a moment."],
      progress: [],
    },
    morning_ready: {
      suggestions: ['You guard the sofa with your eyes closed?', "Then where's the best spot in my place?", 'Wait for me until I get back.'],
      progress: [{ label: "I'm off", node: 'goWork', minTurns: 1, permission: ['granted'] }],
    },
  },
  next: { title: 'Chapter 2 · The First Evening', note: 'Open the door after work, and an orange head will turn from the sofa.' },
};

/** The script in the player's language; Korean and English exist, the rest read English. */
export function cheeseChapter1(lang: string): ChapterScript {
  return lang === 'ko' ? ko : en;
}
