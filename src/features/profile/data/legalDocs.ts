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
const UPDATED = '2026-09-14';

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
          'You sign in with a third-party provider. We keep the account identifier that provider returns, so your readings and question tickets stay with you across devices.',
          'You may delete your account from inside the app at any time, under My → Account. Deletion is immediate and permanent.',
        ],
      },
      {
        heading: '3. Question tickets',
        body: [
          'A consultation consumes question tickets. Tickets are a licence to use a feature of the app, not a currency, and they have no cash value and cannot be exchanged or refunded outside the store rules that apply to your purchase.',
          'Unused tickets are lost when an account is deleted.',
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
          'Your questions and the counselor’s answers, so a consultation can continue where it left off.',
          'Your language, sound preference, and which counselors you marked as favourites.',
        ],
      },
      {
        heading: '2. What we do not collect',
        body: [
          'No location, no contacts, no photos, no microphone or camera access.',
          'No advertising identifier, and no advertising or analytics SDK is embedded in this app.',
        ],
      },
      {
        heading: '3. Who else sees it',
        body: [
          'Your question, together with the pillars calculated from the birth details, is sent to a third-party AI provider to generate the answer. Do not put anything in a question that you would not want processed that way.',
          'The counselor’s spoken voice is produced by a third-party text-to-speech service from the same text.',
          'We do not sell personal information, and we do not share it for advertising.',
        ],
      },
      {
        heading: '4. Where it is kept',
        body: [
          'On our servers, against your account, and on this device so the app works between launches.',
          'Deleting your account removes the server-side account and the readings attached to it, and clears the saved people, history and favourites from this device.',
        ],
      },
      {
        heading: '5. Your choices',
        body: [
          'You can edit or remove a saved person at any time, change the app language, and delete your account under My → Account.',
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
          '외부 제공자를 통해 로그인합니다. 제공자가 돌려주는 계정 식별자를 보관하여, 기기를 바꿔도 상담 기록과 질문권이 따라가도록 합니다.',
          '마이 → 계정에서 언제든 앱 안에서 계정을 삭제할 수 있습니다. 삭제는 즉시, 되돌릴 수 없습니다.',
        ],
      },
      {
        heading: '3. 질문권',
        body: [
          '상담은 질문권을 사용합니다. 질문권은 앱 기능의 이용 권한이며 화폐가 아닙니다. 현금 가치가 없고, 구매에 적용되는 스토어 규정 외에는 교환·환불되지 않습니다.',
          '계정을 삭제하면 남은 질문권도 함께 사라집니다.',
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
          '질문과 상담사의 답변. 상담을 이어가기 위해 보관합니다.',
          '언어 설정, 소리 설정, 즐겨찾는 상담사.',
        ],
      },
      {
        heading: '2. 수집하지 않는 정보',
        body: [
          '위치·연락처·사진을 수집하지 않으며, 마이크와 카메라에 접근하지 않습니다.',
          '광고 식별자를 수집하지 않으며, 광고·분석 SDK를 탑재하지 않습니다.',
        ],
      },
      {
        heading: '3. 제3자 처리',
        body: [
          '질문과, 생년월일로 계산한 사주 간지는 답변 생성을 위해 외부 AI 제공자에게 전송됩니다. 그렇게 처리되기를 원하지 않는 내용은 질문에 담지 마세요.',
          '상담사의 음성은 같은 텍스트를 외부 음성합성 서비스로 생성한 것입니다.',
          '개인정보를 판매하지 않으며, 광고 목적으로 제공하지 않습니다.',
        ],
      },
      {
        heading: '4. 보관 위치',
        body: [
          '계정에 연결하여 서버에 보관하며, 앱이 실행 사이에 동작하도록 이 기기에도 저장합니다.',
          '계정을 삭제하면 서버의 계정과 그에 연결된 상담 기록이 삭제되고, 이 기기에 저장된 사람·기록·즐겨찾기도 지워집니다.',
        ],
      },
      {
        heading: '5. 이용자의 선택',
        body: [
          '저장된 사람은 언제든 수정·삭제할 수 있고, 언어를 바꿀 수 있으며, 마이 → 계정에서 계정을 삭제할 수 있습니다.',
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
          'Prayers đưa ra các bài luận dựa trên tứ trụ (saju), trình bày dưới dạng một cuộc trò chuyện với nhân vật tư vấn.',
          'Bài luận dành cho việc chiêm nghiệm và giải trí. Đó không phải lời khuyên về sức khoẻ, tài chính, việc làm, quan hệ hay pháp lý, và không thay thế được ý kiến của người có chuyên môn.',
        ],
      },
      {
        heading: '2. Tài khoản',
        body: [
          'Bạn đăng nhập qua một nhà cung cấp bên thứ ba. Chúng tôi giữ mã định danh tài khoản mà bên đó trả về, để lịch sử tư vấn và lượt hỏi đi theo bạn khi đổi thiết bị.',
          'Bạn có thể xoá tài khoản ngay trong ứng dụng bất cứ lúc nào, tại Của tôi → Tài khoản. Xoá là lập tức và không khôi phục được.',
        ],
      },
      {
        heading: '3. Lượt hỏi',
        body: [
          'Mỗi phiên tư vấn tiêu tốn lượt hỏi. Lượt hỏi là quyền dùng một tính năng, không phải tiền tệ, không có giá trị quy đổi và không hoàn lại ngoài quy định của cửa hàng ứng dụng.',
          'Lượt hỏi chưa dùng sẽ mất khi tài khoản bị xoá.',
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
          'Thông tin ngày sinh bạn nhập — tên, ngày sinh, giờ sinh nếu biết, giới tính — cho chính bạn và cho những người bạn thêm vào. Đây là căn cứ để lập lá số; không có thì không có bài luận.',
          'Câu hỏi của bạn và câu trả lời của thầy, để phiên tư vấn nối tiếp được.',
          'Ngôn ngữ, thiết lập âm thanh, và những thầy bạn đánh dấu yêu thích.',
        ],
      },
      {
        heading: '2. Chúng tôi không thu thập gì',
        body: [
          'Không vị trí, không danh bạ, không ảnh, không truy cập micro hay camera.',
          'Không mã quảng cáo, và ứng dụng không nhúng SDK quảng cáo hay phân tích nào.',
        ],
      },
      {
        heading: '3. Ai khác nhìn thấy',
        body: [
          'Câu hỏi của bạn, cùng các trụ tính từ ngày sinh, được gửi tới một nhà cung cấp AI bên thứ ba để tạo câu trả lời. Đừng đưa vào câu hỏi những gì bạn không muốn được xử lý như vậy.',
          'Giọng nói của thầy do một dịch vụ tổng hợp giọng nói bên thứ ba tạo ra từ chính đoạn văn bản đó.',
          'Chúng tôi không bán thông tin cá nhân và không chia sẻ cho mục đích quảng cáo.',
        ],
      },
      {
        heading: '4. Lưu ở đâu',
        body: [
          'Trên máy chủ của chúng tôi, gắn với tài khoản của bạn, và trên chính thiết bị này để ứng dụng hoạt động giữa các lần mở.',
          'Xoá tài khoản sẽ xoá tài khoản phía máy chủ cùng các bài luận gắn với nó, và xoá những người đã lưu, lịch sử và mục yêu thích khỏi thiết bị này.',
        ],
      },
      {
        heading: '5. Lựa chọn của bạn',
        body: [
          'Bạn có thể sửa hoặc xoá người đã lưu bất cứ lúc nào, đổi ngôn ngữ, và xoá tài khoản tại Của tôi → Tài khoản.',
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
