/**
 * The topic follows the counselor, then what the player typed (23-09).
 */
import { topicFromQuestion } from '../src/features/counseling/topicFromQuestion';

describe('topicFromQuestion', () => {
  it.each([
    ['Will I get the job I interviewed for?', 'career'],
    ['Should I invest in stocks this year?', 'wealth'],
    ['Is my boyfriend the one?', 'love'],
    ['How do I deal with my boss?', 'relationships'],
    ['Is it a good time to open my own shop?', 'business'],
    ['I cannot sleep and I feel tired all the time', 'health'],
    ['올해 이직해도 될까요?', 'career'],
    ['남자친구랑 결혼해도 될까요', 'love'],
    ['주식 투자 괜찮을까요', 'wealth'],
    ['転職するべきですか', 'career'],
    ['今年は投資してもいいですか', 'wealth'],
    ['我该不该跳槽', 'career'],
    ['他是我的真命天子吗？男朋友', 'love'],
    ['Năm nay có nên đầu tư không?', 'wealth'],
    ['Tôi có nên chia tay người yêu không?', 'love'],
  ])('%s → %s', (q, topic) => {
    expect(topicFromQuestion(q)).toBe(topic);
  });

  it('returns null when nothing matched, so the counselor keeps her topic', () => {
    expect(topicFromQuestion('What should I focus on this month?')).toBeNull();
    expect(topicFromQuestion('')).toBeNull();
  });

  it('does not read a stem inside another word', () => {
    // "ill" in "will", "date" in "update", "exam" in "example" used to make these health/love/career.
    expect(topicFromQuestion('Will things update for me soon, for example?')).toBeNull();
    // 大丈夫 ("it is fine") contains 夫 (husband); 잠깐 ("a moment") contains 잠 (sleep).
    expect(topicFromQuestion('大丈夫ですか')).toBeNull();
    expect(topicFromQuestion('잠깐만요')).toBeNull();
  });

  it('matches a stem followed by punctuation', () => {
    expect(topicFromQuestion('Will I pass the exam?')).toBe('career');
  });
});
