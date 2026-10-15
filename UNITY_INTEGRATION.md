> ⚠️ **Stale.** This describes the `AiNpcHouse` / `COUNSELOR_RESPONSE` era, before the consultation
> UI moved to React Native. The current split and wire contract are in **`RN_CONSULTATION_UI.md`**.
> Kept for the UaaL export steps, which are still accurate.

# Unity 상담방 연동 가이드 (prayers ↔ saju_world_unity)

RN 앱(prayers)에 Unity 상담방(`AiNpcHouse` 씬)을 Unity-as-a-Library(UaaL)로 임베딩하는 구성.
목표 플로우: **상담방 입장 → 3D 상담사(오행 현자 NPC) 인사** 까지.

## 아키텍처

```
RN (prayers)                                Unity (saju_world_unity)
─────────────────────────                   ─────────────────────────────
UnityEntryScreen                            EmbeddedBoot.unity (부트 씬)
  → CounselingRoomScreen                      └ RNBridge (GameObject)
      └ UnityHost (UnityView)                    ├ RNBridge.cs        ← 전송 계층
NativeUnityBridge  ◄──── JSON 이벤트 ────►       └ EmbeddedConsultBootstrapper.cs
(MockUnityBridge로 자동 폴백)                        → AiNpcHouse 씬 로드/인사 연출
```

이벤트 계약 (`src/features/counseling/types/index.ts`, 직렬화: JSON):

| 방향 | 이벤트 | 시점 |
|---|---|---|
| Unity→RN | `UNITY_READY` | AiNpcHouse 로드 완료 후 |
| RN→Unity | `SESSION_INIT` | UNITY_READY 수신 시 자동 (상담사/대상/locale) |
| RN→Unity | `COUNSELOR_RESPONSE` | 인사말·답변 (text+emotion+animation+camera) |
| Unity→RN | `USER_MESSAGE` / `EXIT_SESSION` | Unity 내 입력/종료 시 (현재 미사용) |

- RN 쪽 브릿지 선택: `src/features/counseling/bridge/index.ts` — 네이티브 `RNUnityView`가 링크되어 있으면 `NativeUnityBridge`, 아니면 `MockUnityBridge` (Unity 없이도 앱 동작).
- **네이티브 링크 게이트**: `react-native.config.js`가 Unity 산출물이 있을 때만 `@azesmway/react-native-unity`를 autolink합니다. 산출물 없이 링크하면 pod install(`unity/builds/ios` 복사)과 gradle(`:unityLibrary` 의존)이 즉시 깨지기 때문. **Unity 익스포트를 만든 뒤에는 반드시 `pod install`(iOS) / gradle sync(Android) + 네이티브 재빌드를 다시 해야 실제 Unity가 붙습니다.**
- 인사 지연 감추기: 상담방 진입 즉시 `counselorAI.greeting()` 요청 → 응답은 브릿지가 큐잉했다가 `UNITY_READY` 후 Unity로 전달.
- Unity 쪽 NPC 매핑: RN `characterId` → 오행 현자 (`seoyeon_01→water, mina_01→fire, yuna_01→wood, harin_01→metal, doyun_01→earth`), 미지정 시 fire. 인사말은 머리 위 말풍선(`AiNpcSpeechBubble`)으로 표시.

## 빌드 절차 (수동 단계)

### 0. 사전 준비 (1회)
Unity Hub → 6000.0.56f1 → 모듈 추가:
- **Android Build Support** (+ OpenJDK, Android SDK & NDK)
- **iOS Build Support**

현재 에디터에는 Mac 모듈만 설치되어 있어 이 단계 없이는 익스포트가 안 됩니다.

### 1. Android 익스포트
Unity 에디터에서 `Saju World → Export UaaL (Android)` 실행, 또는 CLI:

```sh
"/Applications/Unity/Hub/Editor/6000.0.56f1/Unity.app/Contents/MacOS/Unity" \
  -batchmode -quit -projectPath /Users/namaste/git/saju_fullstack/saju_world_unity \
  -executeMethod SajuWorld.EditorTools.EmbeddedExportBuilder.ExportAndroid
```

- 출력: `prayers/unity/builds/android/` (settings.gradle이 자동 인식, 없으면 mock 폴백)
- 익스포트 후 1회: `unity/builds/android/unityLibrary/src/main/AndroidManifest.xml`에서 `<intent-filter>...</intent-filter>` 블록 제거 (launcher 중복 방지)
- 이후 일반 `npm run android`

### 2. iOS 익스포트
`Saju World → Export UaaL (iOS)` (출력: `saju_world_unity/Builds/uaal-ios/`) 후 Xcode에서:
1. `Unity-iPhone.xcodeproj` 열기 → Data 폴더 Target Membership에 UnityFramework 체크
2. `Libraries/Plugins/iOS/NativeCallProxy.h` → Target Membership을 UnityFramework **Public**으로
3. UnityFramework 스킴으로 빌드 → 생성된 `UnityFramework.framework`를 `prayers/unity/builds/ios/`로 복사
4. `rm -rf ios/Pods ios/Podfile.lock && npx pod-install` 후 `npm run ios` (실기기 전용 — 시뮬레이터는 미지원)

### 3. 확인
앱 → 상담사 선택 → 대상/주제 선택 → 상담방 진입: 로딩 베일 → Unity 상담방 → NPC 머리 위 말풍선에 인사말이 뜨면 성공. Unity 미탑재 빌드에서는 기존 2D mock 무대가 그대로 나옵니다.

## 알려진 한계 / 다음 단계
- 현자 NPC 애니메이터에는 `Idle`/`Thinking` 상태만 있어 인사 전용 모션(Wave/Bow)이 없음 → `npc_sage_male/female.controller`에 상태 추가 필요 (`m_char_002`의 Wave/Nod 클립 재사용 가능). 현재는 `animation: 'thinking'`일 때만 Thinking 포즈.
- `SESSION_INIT`에 인증 토큰이 아직 없음 → 실제 백엔드 상담(사주 차트 기반 답변)을 Unity 안에서 하려면 `SajuSessionData.SetUserAuth/SetComputedSaju` 주입 확장 필요. 현재 구조는 답변 생성을 RN(`counselorAI`)이 담당하므로 인사까지는 문제 없음.
- 답변 AI는 아직 `MockCounselorAI` → Rails `/api/v2/chatbots/send_message` 연동은 다음 마일스톤.
- Unity 서버 URL(`AppConstants.ServerUrls`)이 LAN/개발용 하드코딩 상태.
