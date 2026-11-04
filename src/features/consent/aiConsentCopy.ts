import type { Lang } from '../../shared/i18n';

/**
 * What AiConsentScreen tells the person before anything is sent to a third-party AI.
 *
 * ⚠️ Every line is a statement about what saju_server does, read off its code on 2026-11-04:
 *   - answers, readings, journeys, story, cafe, memory routing, diary reflections → Google Gemini
 *     (`gemini-3*` in app/services/prayers/*), with OpenAI as the fallback (LlmFailover)
 *   - spoken questions → OpenAI Whisper (Prayers::SttService)
 *   - counselor voices → OpenAI gpt-4o-mini-tts, some voices Google Gemini TTS (Prayers::TtsService)
 *   - diary photos and profile photos are never sent (DiaryReflection: "Never its photos")
 * If a provider or a kind of data is added, change this list AND bump AI_CONSENT_VERSION.
 */
export interface AiConsentCopy {
  title: string;
  intro: string;
  whatTitle: string;
  what: string[];
  notSent: string;
  whoTitle: string;
  who: { name: string; role: string }[];
  whyTitle: string;
  why: string[];
  policyLink: string;
  agree: string;
  decline: string;
  declineTitle: string;
  declineBody: string;
  declineBack: string;
  declineSignOut: string;
  /** Review mode, opened from My Page after agreeing. */
  grantedOn: string;
  withdraw: string;
  withdrawTitle: string;
  withdrawBody: string;
  withdrawConfirm: string;
  cancel: string;
}

const EN: AiConsentCopy = {
  title: 'Your data and AI',
  intro:
    'The counselors in Prayers are AI. To answer you, the app sends some of your information to third-party AI services. Nothing is sent until you agree.',
  whatTitle: 'What is sent',
  what: [
    'The questions and messages you write or say to a counselor, and the earlier conversation and saved memories the counselor draws on.',
    'Birth details — name, gender, date and time of birth — and the saju chart calculated from them, for you and for anyone you add.',
    'Recordings of questions you ask out loud, to turn them into text.',
    'Diary text you write, and your answers in journeys, stories and the cafe.',
    'The counselor’s reply text, to turn it into a spoken voice.',
  ],
  notSent: 'Your photos, email address, payment details and sign-in account are not sent to these services.',
  whoTitle: 'Who receives it',
  who: [
    { name: 'Google (Gemini API)', role: 'Writes the counselors’ answers, readings, journey reports and diary replies, and some voices.' },
    { name: 'OpenAI (OpenAI API)', role: 'Turns spoken questions into text, produces most counselor voices, and writes answers when Gemini is unavailable.' },
  ],
  whyTitle: 'How it is used',
  why: [
    'Only to produce the reply, reading or voice you asked for. The data goes from our server to these providers; it is not sold or used for advertising.',
    'You can withdraw this permission at any time in My Page › AI data sharing. Without it, consultations and other AI features cannot be used.',
  ],
  policyLink: 'Read the privacy policy',
  agree: 'Agree and continue',
  decline: 'Don’t agree',
  declineTitle: 'AI features need this permission',
  declineBody:
    'Every counselor reply is written by these AI services, so the app cannot be used without sending them your questions. You can read the details again, or sign out.',
  declineBack: 'Go back',
  declineSignOut: 'Sign out',
  grantedOn: 'You agreed on {date}.',
  withdraw: 'Withdraw permission',
  withdrawTitle: 'Withdraw permission?',
  withdrawBody:
    'Nothing more will be sent to these AI services. The app will ask again before you can use the counselors.',
  withdrawConfirm: 'Withdraw',
  cancel: 'Cancel',
};

const KO: AiConsentCopy = {
  title: '내 정보와 AI',
  intro:
    'Prayers의 상담사는 AI입니다. 답변을 만들기 위해 앱은 일부 정보를 외부(제3자) AI 서비스로 보냅니다. 동의하기 전에는 아무것도 보내지 않습니다.',
  whatTitle: '보내는 정보',
  what: [
    '상담사에게 쓰거나 말한 질문과 메시지, 그리고 상담사가 참고하는 이전 대화와 저장된 기억.',
    '본인과 추가한 사람의 출생 정보(이름, 성별, 생년월일과 태어난 시각)와 그것으로 계산한 사주.',
    '소리 내어 한 질문의 녹음(글자로 바꾸기 위해).',
    '직접 쓴 일기 내용, 운세 여행·스토리·카페에서 한 대답.',
    '상담사 답변 텍스트(목소리로 읽어 주기 위해).',
  ],
  notSent: '사진, 이메일 주소, 결제 정보, 로그인 계정은 이 서비스들로 보내지 않습니다.',
  whoTitle: '받는 곳',
  who: [
    { name: 'Google (Gemini API)', role: '상담 답변, 사주 풀이, 여행 리포트, 일기 답장과 일부 목소리를 만듭니다.' },
    { name: 'OpenAI (OpenAI API)', role: '음성 질문을 글자로 바꾸고, 대부분의 상담사 목소리를 만들며, Gemini를 쓸 수 없을 때 답변을 만듭니다.' },
  ],
  whyTitle: '이용 목적',
  why: [
    '요청한 답변·풀이·목소리를 만드는 데에만 씁니다. 정보는 저희 서버를 거쳐 이 제공자들에게 전달되며, 판매하거나 광고에 쓰지 않습니다.',
    '동의는 언제든 마이페이지 › AI 데이터 공유에서 철회할 수 있습니다. 동의하지 않으면 상담 등 AI 기능을 쓸 수 없습니다.',
  ],
  policyLink: '개인정보 처리방침 보기',
  agree: '동의하고 계속하기',
  decline: '동의하지 않음',
  declineTitle: 'AI 기능에는 동의가 필요해요',
  declineBody:
    '상담사의 모든 답변은 이 AI 서비스가 만들기 때문에, 질문을 보내지 않고는 앱을 쓸 수 없어요. 내용을 다시 읽거나 로그아웃할 수 있어요.',
  declineBack: '돌아가기',
  declineSignOut: '로그아웃',
  grantedOn: '{date}에 동의했어요.',
  withdraw: '동의 철회',
  withdrawTitle: '동의를 철회할까요?',
  withdrawBody: '이후로는 AI 서비스에 아무것도 보내지 않습니다. 상담사를 쓰려면 다시 동의해야 해요.',
  withdrawConfirm: '철회',
  cancel: '취소',
};

const VI: AiConsentCopy = {
  title: 'Dữ liệu của bạn và AI',
  intro:
    'Các thầy trong Prayers là AI. Để trả lời bạn, ứng dụng gửi một số thông tin của bạn tới dịch vụ AI bên thứ ba. Không có gì được gửi cho tới khi bạn đồng ý.',
  whatTitle: 'Những gì được gửi',
  what: [
    'Câu hỏi và tin nhắn bạn viết hoặc nói với thầy, cùng cuộc trò chuyện trước đó và những ký ức đã lưu mà thầy dựa vào.',
    'Thông tin ngày sinh — tên, giới tính, ngày và giờ sinh — cùng lá số tính từ đó, của bạn và của người bạn thêm vào.',
    'Bản ghi âm câu hỏi bạn nói thành tiếng, để chuyển thành chữ.',
    'Nội dung nhật ký bạn viết, và câu trả lời của bạn trong hành trình, câu chuyện và quán cà phê.',
    'Văn bản câu trả lời của thầy, để đọc thành giọng nói.',
  ],
  notSent: 'Ảnh, địa chỉ email, thông tin thanh toán và tài khoản đăng nhập của bạn không được gửi tới các dịch vụ này.',
  whoTitle: 'Ai nhận dữ liệu',
  who: [
    { name: 'Google (Gemini API)', role: 'Viết câu trả lời, luận giải, báo cáo hành trình, hồi đáp nhật ký và một số giọng nói.' },
    { name: 'OpenAI (OpenAI API)', role: 'Chuyển câu hỏi bằng giọng nói thành chữ, tạo phần lớn giọng của thầy, và viết câu trả lời khi Gemini không dùng được.' },
  ],
  whyTitle: 'Cách sử dụng',
  why: [
    'Chỉ để tạo câu trả lời, luận giải hoặc giọng nói bạn yêu cầu. Dữ liệu đi từ máy chủ của chúng tôi tới các nhà cung cấp này; không bị bán hay dùng cho quảng cáo.',
    'Bạn có thể rút lại sự đồng ý bất cứ lúc nào tại Trang của tôi › Chia sẻ dữ liệu AI. Nếu không đồng ý, bạn không thể dùng tư vấn và các tính năng AI khác.',
  ],
  policyLink: 'Đọc chính sách quyền riêng tư',
  agree: 'Đồng ý và tiếp tục',
  decline: 'Không đồng ý',
  declineTitle: 'Tính năng AI cần sự đồng ý này',
  declineBody:
    'Mọi câu trả lời của thầy đều do các dịch vụ AI này viết, nên không thể dùng ứng dụng mà không gửi câu hỏi cho họ. Bạn có thể đọc lại chi tiết, hoặc đăng xuất.',
  declineBack: 'Quay lại',
  declineSignOut: 'Đăng xuất',
  grantedOn: 'Bạn đã đồng ý vào {date}.',
  withdraw: 'Rút lại đồng ý',
  withdrawTitle: 'Rút lại đồng ý?',
  withdrawBody: 'Sẽ không gửi gì thêm tới các dịch vụ AI này. Ứng dụng sẽ hỏi lại trước khi bạn dùng các thầy.',
  withdrawConfirm: 'Rút lại',
  cancel: 'Huỷ',
};

const JA: AiConsentCopy = {
  title: 'あなたの情報とAI',
  intro:
    'Prayersのカウンセラーは AI です。回答を作るため、アプリはあなたの情報の一部を第三者の AI サービスに送信します。同意するまで何も送信しません。',
  whatTitle: '送信する情報',
  what: [
    'カウンセラーに書いた・話した質問とメッセージ、カウンセラーが参照する過去の会話と保存された記憶。',
    'あなたと追加した人の出生情報(名前、性別、生年月日と出生時刻)と、そこから計算した四柱。',
    '声で話した質問の録音(文字にするため)。',
    'あなたが書いた日記の本文、旅・ストーリー・カフェでの回答。',
    'カウンセラーの回答テキスト(音声で読み上げるため)。',
  ],
  notSent: '写真、メールアドレス、決済情報、ログインアカウントはこれらのサービスに送信しません。',
  whoTitle: '送信先',
  who: [
    { name: 'Google (Gemini API)', role: '相談の回答、鑑定、旅のレポート、日記への返事と一部の音声を作成します。' },
    { name: 'OpenAI (OpenAI API)', role: '音声の質問を文字にし、ほとんどのカウンセラーの音声を作り、Gemini が使えないときに回答を作成します。' },
  ],
  whyTitle: '利用目的',
  why: [
    'ご依頼の回答・鑑定・音声を作るためだけに使います。情報は当社のサーバーからこれらの提供者に送られ、販売や広告には使いません。',
    '同意はいつでもマイページ › AIデータ共有 から撤回できます。同意がない場合、相談などの AI 機能は使えません。',
  ],
  policyLink: 'プライバシーポリシーを読む',
  agree: '同意して続ける',
  decline: '同意しない',
  declineTitle: 'AI 機能には同意が必要です',
  declineBody:
    'カウンセラーの回答はすべてこれらの AI サービスが作るため、質問を送らずにアプリを使うことはできません。内容を読み直すか、ログアウトできます。',
  declineBack: '戻る',
  declineSignOut: 'ログアウト',
  grantedOn: '{date} に同意しました。',
  withdraw: '同意を撤回',
  withdrawTitle: '同意を撤回しますか?',
  withdrawBody: '以後、これらの AI サービスには何も送信しません。カウンセラーを使うには再度同意が必要です。',
  withdrawConfirm: '撤回',
  cancel: 'キャンセル',
};

const ZH_CN: AiConsentCopy = {
  title: '你的数据与 AI',
  intro: 'Prayers 的咨询师是 AI。为了回答你,应用会把你的部分信息发送给第三方 AI 服务。在你同意之前,不会发送任何内容。',
  whatTitle: '发送的信息',
  what: [
    '你写给或说给咨询师的问题和消息,以及咨询师参考的之前的对话和已保存的记忆。',
    '你和你添加的人的出生信息(姓名、性别、出生日期和时间)以及据此计算的八字。',
    '你说出的问题的录音(用于转成文字)。',
    '你写的日记内容,以及你在旅程、故事和咖啡馆中的回答。',
    '咨询师的回复文本(用于转成语音)。',
  ],
  notSent: '你的照片、邮箱地址、支付信息和登录账号不会发送给这些服务。',
  whoTitle: '接收方',
  who: [
    { name: 'Google (Gemini API)', role: '生成咨询回答、命理解读、旅程报告、日记回信和部分语音。' },
    { name: 'OpenAI (OpenAI API)', role: '把语音问题转成文字,生成大部分咨询师语音,并在 Gemini 不可用时生成回答。' },
  ],
  whyTitle: '使用方式',
  why: [
    '仅用于生成你请求的回答、解读或语音。数据从我们的服务器发送给这些提供方,不会出售,也不会用于广告。',
    '你可以随时在 我的 › AI 数据共享 中撤回同意。不同意则无法使用咨询等 AI 功能。',
  ],
  policyLink: '阅读隐私政策',
  agree: '同意并继续',
  decline: '不同意',
  declineTitle: 'AI 功能需要你的同意',
  declineBody: '咨询师的每条回复都由这些 AI 服务生成,不发送问题就无法使用本应用。你可以重新阅读说明,或退出登录。',
  declineBack: '返回',
  declineSignOut: '退出登录',
  grantedOn: '你已于 {date} 同意。',
  withdraw: '撤回同意',
  withdrawTitle: '撤回同意?',
  withdrawBody: '之后不会再向这些 AI 服务发送任何内容。再次使用咨询师前需要重新同意。',
  withdrawConfirm: '撤回',
  cancel: '取消',
};

const ZH_TW: AiConsentCopy = {
  title: '你的資料與 AI',
  intro: 'Prayers 的諮詢師是 AI。為了回答你,應用程式會把你的部分資訊傳送給第三方 AI 服務。在你同意之前,不會傳送任何內容。',
  whatTitle: '傳送的資訊',
  what: [
    '你寫給或說給諮詢師的問題和訊息,以及諮詢師參考的先前對話和已儲存的記憶。',
    '你和你新增的人的出生資訊(姓名、性別、出生日期和時間)以及據此計算的八字。',
    '你說出的問題的錄音(用於轉成文字)。',
    '你寫的日記內容,以及你在旅程、故事和咖啡館中的回答。',
    '諮詢師的回覆文字(用於轉成語音)。',
  ],
  notSent: '你的照片、電子郵件地址、付款資訊和登入帳號不會傳送給這些服務。',
  whoTitle: '接收方',
  who: [
    { name: 'Google (Gemini API)', role: '產生諮詢回答、命理解讀、旅程報告、日記回信和部分語音。' },
    { name: 'OpenAI (OpenAI API)', role: '把語音問題轉成文字,產生大部分諮詢師語音,並在 Gemini 無法使用時產生回答。' },
  ],
  whyTitle: '使用方式',
  why: [
    '僅用於產生你要求的回答、解讀或語音。資料從我們的伺服器傳送給這些提供者,不會出售,也不會用於廣告。',
    '你可以隨時在 我的 › AI 資料分享 中撤回同意。不同意則無法使用諮詢等 AI 功能。',
  ],
  policyLink: '閱讀隱私權政策',
  agree: '同意並繼續',
  decline: '不同意',
  declineTitle: 'AI 功能需要你的同意',
  declineBody: '諮詢師的每則回覆都由這些 AI 服務產生,不傳送問題就無法使用本應用程式。你可以重新閱讀說明,或登出。',
  declineBack: '返回',
  declineSignOut: '登出',
  grantedOn: '你已於 {date} 同意。',
  withdraw: '撤回同意',
  withdrawTitle: '撤回同意?',
  withdrawBody: '之後不會再向這些 AI 服務傳送任何內容。再次使用諮詢師前需要重新同意。',
  withdrawConfirm: '撤回',
  cancel: '取消',
};

const BY_LANG: Record<Lang, AiConsentCopy> = { ko: KO, en: EN, vi: VI, ja: JA, 'zh-CN': ZH_CN, 'zh-TW': ZH_TW };

export function aiConsentCopy(lang: Lang): AiConsentCopy {
  return BY_LANG[lang] ?? EN;
}
