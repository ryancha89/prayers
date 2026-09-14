# Đăng nhập & danh tính — trạng thái hiện tại

**Xong (đã đo trên máy 14-09-2026):**

- Cổng đăng nhập đứng trước mọi thứ. Không còn "khách vãng lai": id `dev-` sinh trên máy đã bị xoá
  (`shared/device/deviceId.ts`), vì server chỉ tự cấp id đó khi `Rails.env.development?` và tự nạp
  lại 100 vé mỗi request — nó chưa bao giờ là một tài khoản.
- `POST /api/v1/auth/apple/callback` → `user_auth`, đúng hợp đồng `saju_front` đang chạy production.
- `GET /api/v1/game/token` → token 24h cho chính tài khoản đó. **Bản release không mang bí mật dùng
  chung nữa**: `Saju-Authorization` chỉ còn là đường lui trong dev.
- Host thật: `shared/config/api.ts` — dev nhận biết theo platform (iOS 127.0.0.1, Android 10.0.2.2),
  release `https://api.perpetualtalk.com`. Trước đó release **không có server nào cả**.
- 11 test trong `__tests__/auth.test.ts`.

**Chưa xong — cần tài khoản Apple/Google, không phải cần code:**

1. **Bundle id thật.** Đang là mặc định của template: `org.reactjs.native.example.prayers`.
2. **Bật "Sign in with Apple"** cho App ID đó trong Apple Developer (team `VDVA2SZD43`), rồi thêm
   file entitlements vào target — hiện dự án **chưa có** file nào.
3. `npm i @invertase/react-native-apple-authentication && (cd ios && pod install)`.
   Adapter đã viết sẵn (`providers/appleSignIn.ts`) và **tự ẩn nút** khi chưa có pod, nên trước khi
   làm ba bước trên app vẫn chạy bình thường bằng nút *Developer sign-in* (chỉ có trong bản dev).
4. **Google**: cần client id (GoogleService-Info.plist + web client id). Chưa làm nút, vì một nút
   luôn luôn lỗi dạy người dùng rằng đăng nhập hỏng.

**Việc kế tiếp về dữ liệu:** người đã có tài khoản rồi thì lịch sử hội thoại vẫn nằm ở máy
(`conversationsStore`). Chuyển nó lên tài khoản là một việc riêng, và là điều kiện để "đổi máy vẫn
còn lịch sử" thành sự thật chứ không chỉ là câu chữ trên màn đăng nhập.
