/**
 * What the player's own question is about.
 *
 * There is no topic picker (removed 18-09); a session opens on the counselor's specialty
 * (`defaultTopicFor`). That is right for the opening and wrong for the question: Yuna opened every
 * session on `life`, so "will I get the job?" was read with the life takes, the life variants and a
 * server prompt that named "life". The decision (23-09): the topic follows the counselor, THEN the
 * words the player typed.
 *
 * Keyword matching, not a model call. The answer is needed the instant the question is sent — the
 * P06 take that follows is recorded per topic — and a second request on the transport already busy
 * writing the reading would land after the take it was meant to choose.
 *
 * Returns null when nothing matched, so the caller keeps what it had. A miss must never move a
 * specialist off her ground.
 */

/** The seven topics the flow has takes for (`consult_topic_*`). */
export type Topic = 'love' | 'relationships' | 'career' | 'business' | 'wealth' | 'health' | 'life';

/**
 * Lower-case stems, all six app languages mixed in one list per topic. Stems rather than words:
 * "promot" catches promotion/promoted, "투자" catches 투자해도/투자할까. CJK has no word breaks, so
 * substring is the only match there is.
 *
 * Order within the table is also the tie-break: a question that says both "boyfriend" and "money"
 * is about the relationship first.
 */
const KEYWORDS: ReadonlyArray<[Topic, readonly string[]]> = [
  ['love', [
    'love', 'boyfriend', 'girlfriend', 'crush', 'dating', 'date ', 'romance', 'marry', 'marriage',
    'wedding', 'husband', 'wife', 'breakup', 'break up', 'soulmate', 'ex ', 'my ex',
    '연애', '사랑', '남자친구', '여자친구', '남친', '여친', '결혼', '썸', '이별', '짝사랑', '배우자', '남편', '아내', '재회',
    '恋愛', '恋人', '彼氏', '彼女', '結婚', '片思い', '失恋', '旦那', '奥さん',
    '恋爱', '恋人', '男朋友', '女朋友', '结婚', '暗恋', '分手', '老公', '老婆', '戀愛', '結婚', '暗戀', '男友', '女友',
    'tình yêu', 'người yêu', 'bạn trai', 'bạn gái', 'kết hôn', 'cưới', 'chia tay', 'hôn nhân', 'crush', 'vợ', 'chồng',
  ]],
  ['relationships', [
    'friend', 'family', 'parent', 'mother', 'father', 'coworker', 'colleague', 'boss ', 'conflict',
    'relationship', 'people around',
    '친구', '가족', '부모', '엄마', '아빠', '동료', '상사', '인간관계', '관계', '갈등',
    '友達', '家族', '両親', '母親', '父親', '同僚', '上司', '人間関係',
    '朋友', '家人', '父母', '妈妈', '爸爸', '同事', '上司', '人际', '人際', '關係', '关系',
    'bạn bè', 'gia đình', 'bố mẹ', 'cha mẹ', 'đồng nghiệp', 'sếp', 'mối quan hệ', 'mâu thuẫn',
  ]],
  ['career', [
    'job', 'career', 'work', 'promot', 'interview', 'resign', 'quit', 'hired', 'employ', 'office',
    'exam ', 'exams', 'study', 'school', 'university', 'college',
    '직장', '취업', '이직', '승진', '면접', '퇴사', '커리어', '진로', '시험', '합격', '공부', '회사',
    '仕事', '就職', '転職', '昇進', '面接', '退職', '進路', '試験', '合格', '勉強', '会社',
    '工作', '就业', '跳槽', '升职', '面试', '辞职', '职业', '考试', '学习', '公司', '就業', '升職', '面試', '辭職', '職業', '考試',
    'công việc', 'việc làm', 'sự nghiệp', 'thăng chức', 'phỏng vấn', 'nghỉ việc', 'chuyển việc', 'thi ', 'học tập', 'đi học', 'việc học', 'công ty',
  ]],
  ['business', [
    'business', 'startup', 'start-up', 'company of my own', 'shop', 'store', 'customer', 'client',
    'partner', 'launch', 'entrepreneur',
    '사업', '창업', '가게', '장사', '매장', '고객', '거래처', '동업',
    '事業', '起業', 'お店', '店を', '商売', '顧客', '取引',
    '生意', '创业', '創業', '店铺', '店鋪', '客户', '客戶', '合伙', '合夥',
    'kinh doanh', 'khởi nghiệp', 'cửa hàng', 'buôn bán', 'khách hàng', 'đối tác',
  ]],
  ['wealth', [
    'money', 'wealth', 'rich', 'invest', 'stock', 'crypto', 'debt', 'loan', 'salary', 'income',
    'saving', 'spend', 'financ', 'fortune', 'lottery', 'house', 'real estate',
    '돈', '재물', '재산', '투자', '주식', '코인', '빚', '대출', '월급', '연봉', '수입', '저축', '부동산', '집 ', '로또',
    'お金', '金運', '財産', '投資', '株式', '株価', '借金', 'ローン', '給料', '年収', '収入', '貯金', '不動産',
    '钱', '錢', '财运', '財運', '财富', '財富', '投资', '股票', '债', '債', '贷款', '貸款', '工资', '工資', '收入', '存钱', '存錢', '房子',
    'tiền', 'tài chính', 'đầu tư', 'chứng khoán', 'cổ phiếu', 'nợ', 'vay', 'lương', 'thu nhập', 'tiết kiệm', 'nhà đất', 'giàu',
  ]],
  ['health', [
    'health', 'sick', 'ill ', 'illness', 'disease', 'hospital', 'surgery', 'pregnan', 'weight', 'diet',
    'sleep', 'tired', 'stress', 'anxiety', 'depress', 'pain ', 'painful',
    '건강', '아프', '질병', '병원', '병이', '수술', '임신', '다이어트', '잠이', '잠을', '피곤', '스트레스', '우울', '불안',
    '健康', '病気', '病院', '手術', '妊娠', 'ダイエット', '睡眠', '疲れ', 'ストレス', '不安',
    '健康', '生病', '医院', '醫院', '手术', '手術', '怀孕', '懷孕', '减肥', '減肥', '失眠', '压力', '壓力', '焦虑', '焦慮', '抑郁',
    'sức khỏe', 'sức khoẻ', 'bệnh', 'bị ốm', 'bệnh viện', 'phẫu thuật', 'mang thai', 'giảm cân', 'mất ngủ', 'căng thẳng', 'lo âu', 'trầm cảm',
  ]],
];

/** A letter of an alphabet with case (Latin incl. Vietnamese, Cyrillic…). CJK has no case, so it
 *  never counts — which is right: there is no word boundary to respect there. */
const isCasedLetter = (ch: string) => ch.toLowerCase() !== ch.toUpperCase();

/**
 * Does `q` contain `stem` where a word STARTS?
 *
 * ⚠️ Plain substring was wrong for alphabetic stems: "ill" is inside "will", "date " inside
 * "update ", "exam" inside "example" — "will I get the job?" was a health question. A Latin stem
 * must follow a non-letter. The END stays open on purpose: stems are prefixes ("promot", "invest").
 */
function hasStem(q: string, stem: string): boolean {
  const cased = isCasedLetter(stem[0]);
  for (let at = q.indexOf(stem); at !== -1; at = q.indexOf(stem, at + 1)) {
    if (!cased || at === 0 || !isCasedLetter(q[at - 1])) return true;
  }
  return false;
}

export function topicFromQuestion(question: string): Topic | null {
  // Punctuation becomes space and the whole is padded, so a stem written with a trailing space
  // ("exam ", "boss ") still matches in "exam?" or at the very end.
  const q = ' ' + (question ?? '').toLowerCase().replace(/[?!.,;:'"()\[\]？！。、，；：「」『』]/g, ' ') + ' ';
  let best: Topic | null = null;
  let bestHits = 0;
  for (const [topic, words] of KEYWORDS) {
    let hits = 0;
    for (const w of words) if (hasStem(q, w)) hits += 1;
    // Strictly greater: an equal count keeps the earlier topic, which is the table's tie-break.
    if (hits > bestHits) {
      best = topic;
      bestHits = hits;
    }
  }
  return best;
}
