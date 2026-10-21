# Prayers 로그인

## iOS 연결

- Bundle ID: `com.fortunetorch.prayers`, 개발 팀: `LMV326UNSN`.
- Apple: `@invertase/react-native-apple-authentication` 네이티브 모듈과 `RNAppleAuthentication` Pod를 사용한다. Debug/Release 모두 `ios/prayers/prayers.entitlements`의 Sign in with Apple 권한을 포함한다.
- Google: `googleSignIn.ts`에 등록된 iOS/Web OAuth 클라이언트와 Info.plist의 역방향 URL scheme을 사용한다. 현재 공유 Google Cloud 프로젝트의 동의 화면 앱 이름은 `사주월드`로 표시된다. 브랜딩을 변경할 때에는 이 프로젝트를 사용하는 다른 앱에 미치는 영향도 확인해야 한다.
- 카카오: iOS는 `WebAuth.m`의 ASWebAuthenticationSession → 서버 `/auth/kakao/web_callback` → `prayersauth://kakao` → `/auth/kakao/ticket` 흐름을 사용한다. Android는 카카오 SDK를 사용한다.
- 이메일 로그인은 서버에 설정된 스토어 심사용 계정 전용이다. 일반 이메일 회원가입 기능은 없다.
- 개발자 로그인은 `__DEV__` 빌드에서만 노출된다.

## 인증과 세션

Apple/Google/카카오 응답을 `/api/v1/prayers/auth/{provider}/callback`으로 전달한다. 서버가 제공자의 토큰 서명·발급자·만료·audience를 검증하고 Prayers 전용 `prayers_users` 계정과 `pr_` 자격 증명을 반환한다. 앱은 `/api/v1/prayers/game/token`에서 `pgt_` 게임 토큰을 받아 저장한다. 서버 거절 응답은 로그인으로 처리하지 않는다.

Apple의 이름·이메일은 최초 승인 때만 반환될 수 있으므로 재로그인에서 없어도 허용한다. identityToken 누락은 오류로 표시하며, 사용자 취소와 구분한다. 중복 탭은 하나의 요청만 실행한다. 로그아웃 또는 계정 변경 전에 시작된 토큰 요청의 응답은 현재 계정에 저장하지 않는다.

## 설치와 검증

```sh
npm install
cd ios && pod install
```

```sh
./node_modules/.bin/jest --runInBand __tests__/auth.test.ts __tests__/signInProviders.test.ts __tests__/loginReviewer.test.tsx __tests__/accountDeletion.test.ts
./node_modules/.bin/tsc --noEmit
```

실기기/TestFlight 서명에는 Apple Developer의 동일한 App ID에 Sign in with Apple capability가 활성화된 프로비저닝 프로파일이 필요하다. 2026-10-19에 기존 배포 계정의 App Store Connect API로 조회하여 해당 App ID의 `APPLE_ID_AUTH` 활성화를 확인했다. 시뮬레이터에서도 `CODE_SIGNING_ALLOWED=NO`를 사용하면 Apple 권한이 빠질 수 있으므로 로컬 서명을 포함한 빌드로 확인한다. 공식 설정: https://github.com/invertase/react-native-apple-authentication/blob/main/docs/INITIAL_SETUP.md

서버 Apple audience 기본값은 `com.fortunetorch.prayers`이다. Apple 연결 해제를 포함한 계정 삭제에는 서버의 Apple 키 설정도 필요하며, `DeleteAccountScreen`에서 새 authorizationCode를 얻어 삭제 요청에 전달한다. 키와 사용자 토큰은 앱 소스나 로그에 넣지 않는다.

2026-10-19 검증: 인증·계정 삭제 Jest 테스트 38개 통과, TypeScript 오류 없음, 변경 파일 ESLint 오류 없음(기존 `no-void` 경고 8개). 로컬 서명을 포함한 Debug iOS 빌드 성공. 초기 상태 iOS 26.1 시뮬레이터에서 Apple 계정 로그인 안내, Google·카카오 계정 입력 페이지와 취소 후 복귀를 확인했다. 이후 사용자가 테스트 시뮬레이터에서 실제 Apple 계정 승인을 완료하여 아래 실계정 검증까지 통과했다. 기존 iPhone 17 Pro 시뮬레이터 앱에도 빌드를 반영했다.

### 실계정 검증 — 2026-10-19 17:22 이후

환경: iOS 26.1 `Prayers Login QA`, Debug 앱, 개발 서버 `http://127.0.0.1:4000`.

- 사용자의 실제 Apple 승인 후 `/api/v1/prayers/auth/apple/callback` 응답 200. 해당 요청 로그에 개발용 미검증 토큰 허용 경고가 없음을 확인.
- 앱 저장 상태의 provider가 `apple`이며 `pr_` 계정 자격 증명과 만료 전 `pgt_` 토큰을 보유함을 확인. 비밀값과 개인정보는 기록하지 않음.
- 앱이 발급받은 토큰으로 보호된 `/api/v1/prayers/coins` 조회 성공(200, success=true).
- 인증 없는 요청과 잘못된 토큰 요청은 각각 401로 거절.
- 실제 계정으로 게임 토큰 갱신 성공, 갱신된 토큰으로 보호된 API 조회 성공.
- 앱 프로세스를 종료하고 다시 실행한 뒤 같은 계정과 유효한 토큰을 복원. 로그인 화면으로 돌아가지 않고 최초 프로필 입력 화면을 유지.
- 로그아웃의 로컬 데이터 정리와 계정 유지 여부는 자동 테스트로 검증. 사용자가 승인한 실제 계정은 로그인 상태로 유지.

이 결과는 시뮬레이터·개발 서버 기준이다. TestFlight/실기기와 운영 서버에서의 전체 로그인 흐름은 별도 검증 대상이다.
