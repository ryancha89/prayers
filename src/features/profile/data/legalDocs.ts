import type { Lang } from '../../../shared/i18n';

/**
 * The Terms and the Privacy Policy, as the app shows them.
 *
 * ⚠️⚠️ THE WORDING NEEDS A LEGAL REVIEW BEFORE SUBMISSION. What is written below is accurate about
 * what this app actually DOES — every claim was read off the code: which server it calls, which
 * third parties see a question, what is stored on the device, what deleting the account removes.
 * That is an engineering statement, not a legal one. A privacy policy is a promise the operator
 * makes, and the operator has to make it.
 *
 * ⚠️ It is deliberately NOT a copy of saju_front's. That document names a different app ("Manse
 * Calendar Guide") and a different set of sign-in providers, and describes advertising SDKs this
 * app does not carry. Shipping it here would be a false declaration, not a shortcut.
 *
 * Korean, English and Vietnamese are written out; ja and both Chinese fall back to English, which
 * is normal for legal text and honest — a machine-translated privacy policy is a promise nobody
 * checked. `docFor` is the only place that fallback lives.
 */
export type LegalDoc = 'terms' | 'privacy';

interface Section {
  heading: string;
  body: string[];
}

interface Document {
  title: string;
  updated: string;
  sections: Section[];
}

/** Last substantive edit. Shown to the reader, because a policy with no date is unverifiable. */
const UPDATED = '2026-10-29';

const EN: Record<LegalDoc, Document> = {
  terms: {
    title: 'Terms of Service',
    updated: UPDATED,
    sections: [
      {
        heading: '1. What this app is',
        body: [
          'Prayers offers readings based on saju (four pillars) astrology, delivered as a conversation with a counselor character.',
          'The readings are for reflection and entertainment. They are not advice about your health, finances, employment, relationships or legal position, and they must not be used in place of a qualified professional.',
        ],
      },
      {
        heading: '2. Your account',
        body: [
          'You sign in with a third-party provider. We keep the account identifier that provider returns, so your readings, Prayer Coins, character and diary stay with you across devices.',
          'You may delete your account from inside the app at any time, under Profile → Account. Deletion is immediate and permanent.',
        ],
      },
      {
        heading: '3. Prayer Coins',
        body: [
          'Consultations, journey moments and room items are paid for with Prayer Coins. You can earn coins by checking in, or buy them through the App Store; the purchase is processed by Apple, and we only receive the receipt that confirms it.',
          'Coins are a licence to use features of the app, not a currency. They have no cash value and cannot be exchanged, transferred or refunded outside the store rules that apply to your purchase.',
          'Unused coins are lost when an account is deleted.',
        ],
      },
      {
        heading: '4. What you may not do',
        body: [
          'Do not use the app to harass another person, to impersonate anyone, or to attempt to extract the underlying prompts or models.',
          'Do not submit another person’s birth details unless you are entitled to do so.',
        ],
      },
      {
        heading: '5. Availability and change',
        body: [
          'Counselors, rooms and features may change or be withdrawn. We will not remove a feature you have already paid for without offering the equivalent.',
          'These terms may change; the date at the top is when they last did.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    updated: UPDATED,
    sections: [
      {
        heading: '1. What we collect',
        body: [
          'Account identifier from your sign-in provider, and the display name it returns if you allow it. We do not receive your password.',
          'Birth details you enter — name, date, time when known, and gender — for yourself and for anyone you add. These are what a reading is calculated from; without them there is no reading.',
          'Your questions and the counselor’s answers, so a consultation can continue where it left off. The same applies to tarot and coffee readings in the cafe.',
          'What you write in your diary, and the photos you choose to attach to it.',
          'A profile photo, if you choose to add one.',
          'Your Prayer Coin balance, purchases and check-in days, your room decorations, your character and hair, your language, sound preference, and which counselors you marked as favourites.'
        ],
      },
      {
        heading: '2. What we do not collect',
        body: [
          'No location and no contacts.',
          'Photos: only the photos you pick for your profile or your diary are read and uploaded. The rest of your library is never accessed.',
          'Microphone: only while you are recording a question to ask out loud. That recording is sent to our server to be turned into text, and is not kept after it has been transcribed.',
          'Camera: only when you take a profile photo, or when you let your character copy your facial expressions. Expression tracking runs on your phone; the camera image is never recorded or sent.',
          'No advertising identifier, and no advertising or analytics SDK is embedded in this app.',
        ],
      },
      {
        heading: '3. Who else sees it',
        body: [
          'Your question, together with the pillars calculated from the birth details, is sent to a third-party AI provider to generate the answer. Do not put anything in a question that you would not want processed that way.',
          'When you ask a question out loud, the recording is sent to a third-party speech-to-text service to be transcribed.',
          'The diary reflection a counselor writes is generated by the same AI provider from the diary text you wrote.',
          'The counselor’s spoken voice is produced by a third-party text-to-speech service from the same text.',
          'Purchases are processed by Apple. We do not receive your payment details.',
          'We do not sell personal information, and we do not share it for advertising.',
        ],
      },
      {
        heading: '4. Where it is kept',
        body: [
          'On our servers, against your account, and on this device so the app works between launches.',
          'Deleting your account deletes from our servers everything attached to it — readings and conversations, birth details, diary, diary and profile photos, coin balance, check-ins, character and room — and clears the saved people, history and favourites from this device.',
          'One exception: records of store purchases (product, amount, platform, transaction ID and date) are kept for 5 years, as the Korean Act on Consumer Protection in Electronic Commerce requires, and then deleted. They are no longer linked to your name, email or photo. After they are deleted we keep only an irreversibly hashed code derived from each store transaction number, which cannot identify you, so the same purchase can never be credited twice.',
          'We also keep a note that the account was deleted — when, which sign-in provider, and the reason if you gave one — with no name, email or photo, so the deleted account can never be signed into again.',
        ],
      },
      {
        heading: '5. Your choices',
        body: [
          'You can edit or remove a saved person at any time, change the app language, and delete your account under Profile → Account.',
          'For any question about this policy, contact the operator through the store listing.',
        ],
      },
    ],
  },
};

const KO: Record<LegalDoc, Document> = {
  terms: {
    title: '이용약관',
    updated: UPDATED,
    sections: [
      {
        heading: '1. 이 앱에 대하여',
        body: [
          'Prayers는 사주(四柱)에 기반한 풀이를 상담사 캐릭터와의 대화 형식으로 제공합니다.',
          '풀이는 성찰과 오락을 위한 것입니다. 건강·재무·취업·인간관계·법률에 관한 조언이 아니며, 전문가의 판단을 대신할 수 없습니다.',
        ],
      },
      {
        heading: '2. 계정',
        body: [
          '외부 제공자를 통해 로그인합니다. 제공자가 돌려주는 계정 식별자를 보관하여, 기기를 바꿔도 상담 기록, Prayer Coins, 캐릭터, 일기가 따라가도록 합니다.',
          '프로필 → 계정에서 언제든 앱 안에서 계정을 삭제할 수 있습니다. 삭제는 즉시, 되돌릴 수 없습니다.',
        ],
      },
      {
        heading: '3. Prayer Coins',
        body: [
          '상담, 운세 여행의 순간, 방 꾸미기 아이템은 Prayer Coins로 이용합니다. 출석으로 받거나 App Store에서 구매할 수 있으며, 결제는 Apple이 처리하고 저희는 결제를 확인하는 영수증만 받습니다.',
          'Prayer Coins는 앱 기능의 이용 권한이며 화폐가 아닙니다. 현금 가치가 없고, 구매에 적용되는 스토어 규정 외에는 교환·양도·환불되지 않습니다.',
          '계정을 삭제하면 남은 Prayer Coins도 함께 사라집니다.',
        ],
      },
      {
        heading: '4. 금지 행위',
        body: [
          '타인을 괴롭히거나 사칭하는 데, 또는 내부 프롬프트나 모델을 빼내려는 시도에 이 앱을 사용하지 마세요.',
          '권한이 없는 타인의 생년월일 정보를 입력하지 마세요.',
        ],
      },
      {
        heading: '5. 변경',
        body: [
          '상담사·방·기능은 변경되거나 중단될 수 있습니다. 이미 결제한 기능은 동등한 대체 없이 제거하지 않습니다.',
          '약관은 변경될 수 있으며, 상단의 날짜가 마지막 변경일입니다.',
        ],
      },
    ],
  },
  privacy: {
    title: '개인정보 처리방침',
    updated: UPDATED,
    sections: [
      {
        heading: '1. 수집하는 정보',
        body: [
          '로그인 제공자로부터 받은 계정 식별자와, 허용한 경우 표시 이름. 비밀번호는 받지 않습니다.',
          '입력한 생년월일 정보 — 이름, 생년월일, 아는 경우 태어난 시각, 성별. 본인과 추가한 사람에 대해 수집하며, 풀이를 계산하는 근거입니다.',
          '질문과 상담사의 답변. 상담을 이어가기 위해 보관합니다. 카페의 타로·커피 풀이도 같습니다.',
          '일기에 쓴 내용과, 일기에 직접 첨부한 사진.',
          '직접 추가한 경우 프로필 사진.',
          'Prayer Coins 잔액·구매·출석 기록, 방 꾸미기, 캐릭터와 머리 모양, 언어 설정, 소리 설정, 즐겨찾는 상담사.'
        ],
      },
      {
        heading: '2. 수집하지 않는 정보',
        body: [
          '위치와 연락처는 수집하지 않습니다.',
          '사진: 프로필이나 일기에 직접 고른 사진만 읽고 업로드합니다. 나머지 사진 보관함에는 접근하지 않습니다.',
          '마이크: 질문을 소리 내어 녹음하는 동안에만 사용합니다. 녹음은 글로 바꾸기 위해 서버로 전송되며, 변환이 끝나면 보관하지 않습니다.',
          '카메라: 프로필 사진을 찍을 때, 또는 캐릭터가 표정을 따라 하도록 허용했을 때만 사용합니다. 표정 인식은 휴대폰 안에서 처리되며 카메라 영상은 녹화되거나 전송되지 않습니다.',
          '광고 식별자를 수집하지 않으며, 광고·분석 SDK를 탑재하지 않습니다.',
        ],
      },
      {
        heading: '3. 제3자 처리',
        body: [
          '질문과, 생년월일로 계산한 사주 간지는 답변 생성을 위해 외부 AI 제공자에게 전송됩니다. 그렇게 처리되기를 원하지 않는 내용은 질문에 담지 마세요.',
          '질문을 소리 내어 말하면, 녹음은 글로 바꾸기 위해 외부 음성인식 서비스로 전송됩니다.',
          '상담사가 써 주는 일기 답장은 작성한 일기 내용을 바탕으로 같은 AI 제공자가 생성합니다.',
          '상담사의 음성은 같은 텍스트를 외부 음성합성 서비스로 생성한 것입니다.',
          '결제는 Apple이 처리하며, 저희는 결제 수단 정보를 받지 않습니다.',
          '개인정보를 판매하지 않으며, 광고 목적으로 제공하지 않습니다.',
        ],
      },
      {
        heading: '4. 보관 위치',
        body: [
          '계정에 연결하여 서버에 보관하며, 앱이 실행 사이에 동작하도록 이 기기에도 저장합니다.',
          '계정을 삭제하면 계정에 연결된 모든 정보 — 상담 기록과 대화, 생년월일 정보, 일기, 일기·프로필 사진, 코인 잔액, 출석 기록, 캐릭터와 방 — 가 서버에서 삭제되고, 이 기기에 저장된 사람·기록·즐겨찾기도 지워집니다.',
          '예외: 스토어 구매 기록(상품, 금액, 플랫폼, 거래 ID, 일시)은 「전자상거래 등에서의 소비자보호에 관한 법률」에 따라 5년간 보관한 뒤 삭제합니다. 이 기록은 더 이상 이름·이메일·사진과 연결되지 않습니다. 삭제 후에는 같은 구매가 두 번 적립되지 않도록, 각 스토어 거래 번호에서 되돌릴 수 없게 변환한 코드만 남기며 이 코드로는 이용자를 알아볼 수 없습니다.',
          '삭제된 계정으로 다시 로그인되지 않도록, 계정이 삭제되었다는 사실(삭제 일시, 로그인 제공자, 입력한 경우 탈퇴 사유)은 이름·이메일·사진 없이 남겨 둡니다.',
        ],
      },
      {
        heading: '5. 이용자의 선택',
        body: [
          '저장된 사람은 언제든 수정·삭제할 수 있고, 언어를 바꿀 수 있으며, 프로필 → 계정에서 계정을 삭제할 수 있습니다.',
          '이 방침에 대한 문의는 스토어 등록 정보의 연락처로 보내주세요.',
        ],
      },
    ],
  },
};

const VI: Record<LegalDoc, Document> = {
  terms: {
    title: 'Điều khoản sử dụng',
    updated: UPDATED,
    sections: [
      {
        heading: '1. Ứng dụng này là gì',
        body: [
          'Prayers đưa ra các luận giải dựa trên tứ trụ (saju), trình bày dưới dạng một cuộc trò chuyện với nhân vật tư vấn.',
          'Bài luận dành cho việc chiêm nghiệm và giải trí. Đó không phải lời khuyên về sức khoẻ, tài chính, việc làm, quan hệ hay pháp lý, và không thay thế được ý kiến của người có chuyên môn.',
        ],
      },
      {
        heading: '2. Tài khoản',
        body: [
          'Bạn đăng nhập qua một nhà cung cấp bên thứ ba. Chúng tôi giữ mã định danh tài khoản mà bên đó trả về, để lịch sử tư vấn, Prayer Coins, nhân vật và nhật ký đi theo bạn khi đổi thiết bị.',
          'Bạn có thể xoá tài khoản ngay trong ứng dụng bất cứ lúc nào, tại Hồ sơ → Tài khoản. Xoá là lập tức và không khôi phục được.',
        ],
      },
      {
        heading: '3. Prayer Coins',
        body: [
          'Phiên tư vấn, các khoảnh khắc trên chuyến tàu vận mệnh và đồ trang trí phòng được trả bằng Prayer Coins. Bạn nhận coin khi điểm danh hoặc mua qua App Store; giao dịch do Apple xử lý, chúng tôi chỉ nhận biên nhận xác nhận giao dịch.',
          'Coin là quyền dùng tính năng của ứng dụng, không phải tiền tệ. Coin không có giá trị quy đổi, không chuyển nhượng và không hoàn lại ngoài quy định của cửa hàng ứng dụng.',
          'Coin chưa dùng sẽ mất khi tài khoản bị xoá.',
        ],
      },
      {
        heading: '4. Những điều không được làm',
        body: [
          'Không dùng ứng dụng để quấy rối hay mạo danh người khác, cũng không tìm cách moi ra prompt hoặc mô hình bên dưới.',
          'Không nhập thông tin ngày sinh của người khác nếu bạn không có quyền làm việc đó.',
        ],
      },
      {
        heading: '5. Thay đổi',
        body: [
          'Thầy, phòng và tính năng có thể thay đổi hoặc ngừng. Chúng tôi không gỡ một tính năng bạn đã trả tiền mà không có phương án tương đương.',
          'Điều khoản có thể thay đổi; ngày ở đầu trang là lần thay đổi gần nhất.',
        ],
      },
    ],
  },
  privacy: {
    title: 'Chính sách quyền riêng tư',
    updated: UPDATED,
    sections: [
      {
        heading: '1. Chúng tôi thu thập gì',
        body: [
          'Mã định danh tài khoản từ nhà cung cấp đăng nhập, và tên hiển thị nếu bạn cho phép. Chúng tôi không nhận mật khẩu của bạn.',
          'Thông tin ngày sinh bạn nhập — tên, ngày sinh, giờ sinh nếu biết, giới tính — cho chính bạn và cho những người bạn thêm vào. Đây là căn cứ để lập lá số; không có thì không thể luận giải.',
          'Câu hỏi của bạn và câu trả lời của thầy, để phiên tư vấn nối tiếp được. Các lần xem tarot và bói cà phê trong quán cafe cũng vậy.',
          'Những gì bạn viết trong nhật ký, và ảnh bạn tự chọn đính kèm.',
          'Ảnh đại diện, nếu bạn thêm.',
          'Số dư Prayer Coins, giao dịch mua và ngày điểm danh, đồ trang trí phòng, nhân vật và kiểu tóc, ngôn ngữ, thiết lập âm thanh, và những thầy bạn đánh dấu yêu thích.'
        ],
      },
      {
        heading: '2. Chúng tôi không thu thập gì',
        body: [
          'Không vị trí, không danh bạ.',
          'Ảnh: chỉ những ảnh bạn tự chọn cho hồ sơ hoặc nhật ký mới được đọc và tải lên. Phần còn lại của thư viện ảnh không bao giờ bị truy cập.',
          'Micro: chỉ trong lúc bạn đang ghi âm câu hỏi bằng giọng nói. Đoạn ghi âm được gửi lên máy chủ để chuyển thành chữ và không được giữ lại sau khi chuyển xong.',
          'Camera: chỉ khi bạn chụp ảnh đại diện, hoặc khi bạn cho nhân vật bắt chước nét mặt mình. Việc nhận diện nét mặt chạy ngay trên điện thoại; hình ảnh camera không bao giờ được ghi lại hay gửi đi.',
          'Không mã quảng cáo, và ứng dụng không nhúng SDK quảng cáo hay phân tích nào.',
        ],
      },
      {
        heading: '3. Ai khác nhìn thấy',
        body: [
          'Câu hỏi của bạn, cùng các trụ tính từ ngày sinh, được gửi tới một nhà cung cấp AI bên thứ ba để tạo câu trả lời. Đừng đưa vào câu hỏi những gì bạn không muốn được xử lý như vậy.',
          'Khi bạn hỏi bằng giọng nói, đoạn ghi âm được gửi tới một dịch vụ nhận dạng giọng nói bên thứ ba để chuyển thành chữ.',
          'Lời hồi đáp nhật ký của thầy do cùng nhà cung cấp AI đó tạo ra từ nội dung nhật ký bạn viết.',
          'Giọng nói của thầy do một dịch vụ tổng hợp giọng nói bên thứ ba tạo ra từ chính đoạn văn bản đó.',
          'Giao dịch mua do Apple xử lý. Chúng tôi không nhận thông tin thanh toán của bạn.',
          'Chúng tôi không bán thông tin cá nhân và không chia sẻ cho mục đích quảng cáo.',
        ],
      },
      {
        heading: '4. Lưu ở đâu',
        body: [
          'Trên máy chủ của chúng tôi, gắn với tài khoản của bạn, và trên chính thiết bị này để ứng dụng hoạt động giữa các lần mở.',
          'Xoá tài khoản sẽ xoá khỏi máy chủ mọi thứ gắn với nó — kết quả xem và cuộc trò chuyện, thông tin ngày sinh, nhật ký, ảnh nhật ký và ảnh đại diện, số dư coin, ngày điểm danh, nhân vật và căn phòng — và xoá những người đã lưu, lịch sử và mục yêu thích khỏi thiết bị này.',
          'Một ngoại lệ: hồ sơ giao dịch mua trên cửa hàng (sản phẩm, số tiền, nền tảng, mã giao dịch và ngày) được giữ 5 năm theo yêu cầu của Luật Bảo vệ người tiêu dùng trong thương mại điện tử của Hàn Quốc, sau đó bị xoá. Hồ sơ này không còn gắn với tên, email hay ảnh của bạn. Sau khi xoá, chúng tôi chỉ giữ một mã băm không thể đảo ngược, tạo từ mã giao dịch của cửa hàng, để cùng một giao dịch không bao giờ được cộng hai lần; mã này không thể dùng để nhận ra bạn.',
          'Chúng tôi cũng giữ một ghi chú rằng tài khoản đã bị xoá — thời điểm, phương thức đăng nhập, và lý do nếu bạn có ghi — không kèm tên, email hay ảnh, để tài khoản đã xoá không bao giờ đăng nhập lại được.',
        ],
      },
      {
        heading: '5. Lựa chọn của bạn',
        body: [
          'Bạn có thể sửa hoặc xoá người đã lưu bất cứ lúc nào, đổi ngôn ngữ, và xoá tài khoản tại Hồ sơ → Tài khoản.',
          'Mọi thắc mắc về chính sách này, xin liên hệ nhà vận hành qua thông tin trên trang cửa hàng.',
        ],
      },
    ],
  },
};

export function docFor(doc: LegalDoc, lang: Lang): Document {
  if (lang === 'ko') return KO[doc];
  if (lang === 'vi') return VI[doc];
  return EN[doc];
}
