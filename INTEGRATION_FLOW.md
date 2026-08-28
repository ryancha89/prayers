# Prayers ↔ Unity ↔ Rails 연동 플로우 정리

RN 앱(prayers)이 Unity 상담방(saju_world_unity)을 UaaL로 임베딩하고, 백엔드는
Rails(saju)의 **prayers 전용 API 3종**만 사용한다. 이 문서는 전체 흐름을
서브플로우 단위로 쪼개고, 각 단계의 **파일 위치**와 **개선 포인트**를 함께 적는다.

빌드 절차는 [UNITY_INTEGRATION.md](UNITY_INTEGRATION.md) 참고.

```
저장소 3개
  prayers            = 이 리포 (RN 0.86 앱 셸)
  saju_world_unity   = /Users/namaste/git/saju_fullstack/saju_world_unity (Unity 6000.0.56f1)
  saju               = /Users/namaste/git/saju_fullstack/saju (Rails, dev는 localhost:4000 네이티브 실행)
```

## 0. 한 장 요약

```
[RN 앱]                          [Unity (UaaL)]                       [Rails]
홈 → 상담사 → 대상 → 주제          EmbeddedBoot.unity                   /api/v1/prayers/
  └ UnityEntryScreen               └ RNBridge (GameObject)               ├ consultations/message  (Gemini 상담)
      openCounselingRoom()         └ EmbeddedConsultBootstrapper         ├ tts                    (Leda 여성 음성)
  └ CounselingRoomScreen              ├ SESSION_INIT 수신                └ chart                  (만세력 4주)
      └ UnityHost(UnityView)          ├ ConsultationSolo.unity 로드
          ↕ JSON 이벤트 브리지         └ 20페이즈 상담 플로우
      └ RN 채팅바(한글 IME)              ├ 질문 → 오라클 → 청크+음성
                                        └ 사주 viz (4주/오행/마법진)
```

이벤트 계약 (모두 JSON 한 겹, `src/features/counseling/types/index.ts` ↔
`Assets/Scripts/Embedded/RNBridgeMessages.cs`):

| 방향 | 이벤트 | 시점 |
|---|---|---|
| Unity→RN | `UNITY_READY` | 부트 씬 준비 완료 + 상담 씬 (재)로드 완료 시 재전송 |
| RN→Unity | `SESSION_INIT` | UNITY_READY 수신 시(첫 진입) / registerView 시(재진입·리로드 복구) |
| RN→Unity | `USER_QUESTION` | RN 채팅바 전송 |
| Unity→RN | `INPUT_STATE` | 질문 받는 페이즈인지 → RN 채팅바 활성/비활성 |
| Unity→RN | `USER_MESSAGE` / `EXIT_SESSION` | Unity 내 입력/종료 (현재 미사용/뒤로가기) |
| RN→Unity | `SESSION_END` | 방 이탈·언마운트·JS 리로드 — AudioListener 즉시 음소거 |

---

## 1. 앱 부팅 & 브리지 선택

| 단계 | 파일 |
|---|---|
| 네이티브 Unity 감지 → 진짜/목 브리지 선택 | `src/features/counseling/bridge/index.ts` (`UIManager.hasViewManagerConfig('RNUnityView')`) |
| 리로드 생존 Unity 침묵 + resume 마킹 | 같은 파일의 `NativeModules.UnityLifecycle.silenceSurvivingUnity()` 호출 → `ios/prayers/UnityLifecycle.m` |
| 브리지 구현 | `src/features/counseling/bridge/NativeUnityBridge.ts` / `MockUnityBridge.ts` |
| dev Rails 호스트 | `bridge/index.ts`의 `unityApiBase` (`__DEV__ ? 'http://localhost:4000'`) |

동작: JS 컨텍스트가 새로 뜰 때(콜드 스타트·Metro 리로드 모두) `UnityLifecycle`이
살아있는 UnityFramework 인스턴스를 찾아 `SESSION_END`를 쏘고, 살아있었다면
`NativeUnityBridge.markSurvivor()`로 `everReady=true`를 복원한다(리로드 후
재진입 시 무한 로딩 방지).

**개선 포인트**
- `UnityLifecycle.m`은 수동으로 pbxproj에 등록됨(`ruby xcodeproj`) — 파일 추가 시 같은 방식 필요.
- 리로드 검증 자동화 불가(Metro /reload·Cmd+R 원격 트리거가 이 셋업에서 무효) — 수동 확인만 가능.
- prod에는 리로드가 없지만, 백그라운드→포그라운드 등 다른 생존 경로에도 같은 silencer를 붙일 수 있음.

## 2. 상담 진입 네비게이션 (RN)

| 화면 | 파일 | 역할 |
|---|---|---|
| 상담사 상세 | `src/features/counselors/…/DetailScreen` | 상담 시작하기 |
| 대상 선택 | `src/features/subjects/**` (`subjectsStore.ts`: self/민지/지원, `birthDate` 보유 여부가 차트 품질 결정) | |
| 주제 선택 | `src/features/counseling/screens/TopicSelectScreen*` | topic = main_topic |
| Unity 진입 | `src/features/counseling/screens/UnityEntryScreen.tsx` | `unityBridge.openCounselingRoom(payload)` — counselor/subject(birthDate·gender)/topic/`apiBase`/`locale:'ko'` |
| 상담방 | `src/features/counseling/screens/CounselingRoomScreen.tsx` | UnityHost 마운트, UNITY_READY까지 로딩 베일, RN 채팅바(한글 IME), `INPUT_STATE`로 입력 활성화, 이탈 시 `closeCounselingRoom()` |
| Unity 뷰 호스트 | `src/features/counseling/components/UnityHost.tsx` | `registerView`, 언마운트 시 SESSION_END + unregister |

**개선 포인트**
- ✅ `birthTime` 없으면 **시간 모름** 처리: 시주 미생성/미표시, 오행 6글자 가중치, LLM에 "모름". (남은 것: 대상 추가 시 birthTime 입력 UI)
- 채팅바 컨테이너는 `pointerEvents="box-none"` 유지할 것(하단 Unity pill 터치 통과).
- ✅ SESSION_INIT `auth` = 디바이스별 게스트 uid(`src/shared/device/deviceId.ts`, 영속) → 서버 User-Auth → 기기별 대화 이력 분리. 실제 로그인 토큰은 Google 로그인 마일스톤에서 이 필드를 대체.

## 3. 브리지 전송 계층 (네이티브)

| 구간 | 파일 |
|---|---|
| RN→Unity 전송 | `NativeUnityBridge.post()` → `UnityView.postMessage('RNBridge','OnMessage',json)` → `node_modules/@azesmway/react-native-unity/ios/RNUnityView.mm`의 `sendMessageToGOWithName` |
| Unity→RN 수신 | Unity `NativeAPI.sendMessageToMobileApp` (`Assets/Plugins/iOS/NativeCallProxy`) → `RNUnityView.sendMessageToMobileApp` → `onUnityMessage` → `nativeUnityBridge.receiveFromUnity()` |
| Unity측 수신 허브 | `Assets/Scripts/Embedded/RNBridge.cs` — `RNBridge`라는 이름의 GameObject 필수. `SESSION_END`는 구독자가 없어도 transport 레벨에서 `AudioListener.pause` |
| 큐잉/복구 | `NativeUnityBridge.ts` — UNITY_READY 전 이벤트는 outbox 큐잉; iOS UaaL은 프로세스 생존 중 절대 언로드 안 되므로 재진입은 `everReady` resume 경로(registerView에서 SESSION_INIT 재전송) |

**개선 포인트**
- UaaL 재마운트 시 `RNUnityView.initUnityModule`이 이미 실행 중인 인스턴스에 `runEmbedded`를 다시 호출함(라이브러리 동작) — 현재는 문제없지만 업스트림 업데이트 시 주의.
- Android는 아직 미빌드(빌드 모듈 미설치).

## 4. Unity 부트 → 세션 초기화

파일: `Assets/Scripts/Embedded/EmbeddedConsultBootstrapper.cs` (EmbeddedBoot.unity 상주)

`OnSessionInit` 순서 그대로:
1. `AudioListener` 언뮤트 (재진입 대비)
2. **locale 적용** → `LocalizationManager.SetLanguage` (ko/vi/en — 고정 대사·녹음·TTS lang 모두 결정)
3. nickname / `SetBackendBaseUrl(apiBase)`
4. `ApplyBirthProfile` — 로컬 근사 차트(`SajuCalendar.BuildChart`, placeholder) 즉시 생성
5. `FetchServerChart` — **`POST /api/v1/prayers/chart`로 진짜 4주 수신 → `SajuSessionData.SetComputedSaju`가 로컬 근사를 덮어씀** (오라클과 viz가 같은 사주를 보는 근거)
6. `ConsultationHandoff.Set("wood")` (여성 상담사 f_char_002) + `SetTopic`
7. 엔드포인트 오버라이드: `AiNpcChatService.EndpointOverride = /api/v1/prayers/consultations/message`, `ConsultationTts.EndpointOverride = /api/v1/prayers/tts`
8. `ConsultationVizStage.PortraitMode = true` (눕힌 차트 금지 등 폰 전용 레이아웃)
9. `LoadConsultation()` → ConsultationSolo.unity 로드 → `OnConsultationLoaded`:
   - `ConsultationUIToolkitBridge` 런타임 스폰
   - 카메라 리터닝: `rig.SetFraming(CloseUp 2.9, Result 3.2)`
   - `flow.AddSkipPhase("P18")` (점수표 제거)
   - `UNITY_READY` 재전송 → RN 베일 해제

**개선 포인트**
- ✅ `FetchServerChart` 1회 재시도.
- ✅ 시간 미상: 요청엔 정오를 실어 년월일 안정 확보, 응답의 `ganji_time`은 버리고 빈값 저장 → 전 소비처가 "시간 모름"으로 동작.
- 폰 전용 튜닝 값들(카메라 2.9/0.30, P18 스킵, PortraitMode)이 부트스트래퍼에 하드코딩 — 늘어나면 `EmbeddedConfig` ScriptableObject로 분리 권장.

## 5. 20페이즈 상담 플로우 (Unity)

| 역할 | 파일 |
|---|---|
| 페이즈 상태기계 | `Assets/Scripts/Consulting/Flow/ConsultationFlowController.cs` — `EnterIndex/Advance/GoTo`, 리딩 대기 `HoldForReading`, 자동 페이싱 `AutoAdvanceNatural`, **청크 페이싱 `HoldChunk`**, `_skipPhases`(P03·P04·P12·P16 + 임베디드 P18) |
| 페이즈 데이터 | `Assets/Data/ConsultationFlow.asset` (+ `LocalizationData.asset` 문자열) |
| 레거시 UI (실제 로직 소유) | `Assets/Scripts/Consulting/Flow/ConsultationFlowUI.cs` — `FillDialogue`(리딩 청크 분해 `SplitReading`/`AdvanceChunk`), `OnTap`(청크→페이지→Advance 순), `ShowChatLoop`(추가질문 루프: pill=Choice0 + 답변 음성), 트랜스크립트 `ConsultationChatLog.cs` |
| UI Toolkit 스킨 | `Assets/Scripts/UIKit/ConsultationUIToolkitBridge.cs`(legacy 미러링+자동 진행; **choices는 미러링 안 함** — UITK 칩이 임베디드에서 포인터 이벤트를 못 받아 legacy UGUI가 담당), `ConsultationView.cs`, `Assets/UI/Resources/ConsultationView.uxml/.uss`(말풍선은 하단 anchor `bottom:400px`), `DesignSystem.cs` |
| 연출 라우팅 | `Assets/Scripts/Consulting/Flow/ConsultationPerformer.cs` — cue 이름 → viz 스테이지/애니/사운드 (`PlayVfx`는 try/catch — 연출 실패가 플로우를 못 죽임) |
| 카메라 | `Assets/Scripts/Consulting/Flow/ConsultationCameraRig.cs` — 샷별 `Framing(framedHeight/subjectAbove)`, 런타임 `SetFraming` |

청크 전달 규칙 (`SplitReading`): 첫 청크 = **첫 문장 하나**(TTS 첫 시작 지연 최소화),
이후 문장 패킹 ~110자. 페이싱: 음성 fetch(≤15s) → 재생 종료 대기 → 무음이면
글자수 dwell. 탭 = 즉시 다음 청크(컨트롤러는 인덱스 재확인으로 이중 스킵 방지).

**개선 포인트**
- UITK 칩 이벤트 미동작의 진짜 원인(PanelEventHandler/EventSystem 연결) 규명 시 choices를 UITK로 복귀 가능 — 그때까지 legacy 유지.
- 청크 길이·dwell·tail(0.3s) 등 페이싱 상수는 `ConsultationFlowController` 직렬화 필드 — 튜닝은 씬/프리팹 수정 없이 코드 기본값 변경 후 재익스포트.
- 루프 답변은 통짜 음성(800자 캡) — 루프도 청크화하면 더 자연스러움.

## 6. 질문 → AI 답변 경로 (끝에서 끝)

```
RN 채팅바 (CounselingRoomScreen onSend)
 → USER_QUESTION → RNBridge.UserQuestion 이벤트
 → ConsultationUIToolkitBridge.OnSubmit → legacy QuestionField+ConsultButton.Invoke
 → ConsultationFlowController.SubmitQuestion (P05→P06)
 → ConsultationOracle.Ask (Assets/Scripts/Consulting/Flow/ConsultationOracle.cs)
 → AiNpcChatService (Assets/Scripts/Consulting/AiNpc/AiNpcChatService.cs)
     헤더: Saju-Authorization(빌드 시크릿 AiNpcBuildSecrets) + User-Auth(게스트는 없음)
 → POST /api/v1/prayers/consultations/message
     Rails: app/controllers/api/v1/prayers/consultations_controller.rb (게스트 허용)
            app/services/prayers/consultation_service.rb
              topic 모드(on_topic/transient/suggest_switch/switched)
              Chatbots::V2::MessagesGeneratorV2 → LlmFailover(Gemini 우선)
              strip_markdown (###·**·불릿 제거 — 3D 말풍선/TTS용)
            모델: prayers_consultations + chat_messages
 ← answer + followup(→ 다음 pill) + topic{mode, suggest_switch}
 → P11/P14/P17/P19에 분배 → 청크 표시+음성
 → P20 이후 ShowChatLoop: followup pill(Choice0) 탭 or 자유 입력 → 위 경로 반복
```

**개선 포인트**
- `suggest_switch`(주제 전환 제안)가 서버에서 오지만 클라이언트 업셀 칩 미구현.
- 게스트 uid = `prayers_guest` 공유 — 로그인 전이라도 디바이스별 uid를 User-Auth로 보내면 대화 기록 분리 가능.
- 오라클 왕복 5~30s 동안 P07~P10 연출이 로딩 역할 — 실패 시 `ShowDisconnect` 재시도 UI 존재.

## 7. 음성(TTS) 파이프라인

| 종류 | 경로 |
|---|---|
| 고정 대사(인사·안내) | `ConsultationVoice.Speak(locKeys)` → `Assets/Resources/Audio/Consultation/ko/*.wav` 45개 — **Leda 여성 목소리로 재생성됨**. 재생성 도구: `saju_world_unity/tools/regen_ko_voice.py` (LocalizationData ko 파싱 → prayers/tts → WAV 덮어쓰기; vi/en은 미교체) |
| AI 리딩/루프 답변 | `ConsultationVoice.SpeakText/Prefetch` → `ConsultationTts.SynthesizeAsync` (`Assets/Scripts/Consulting/Flow/ConsultationTts.cs`, EndpointOverride+Saju-Authorization+게스트 허용) → `POST /api/v1/prayers/tts` |
| 서버 | `saju/app/controllers/api/v1/prayers/tts_controller.rb` + `app/services/prayers/tts_service.rb` — Gemini `gemini-2.5-flash-preview-tts`, voice **Leda**(ENV `PRAYERS_TTS_VOICE`), 스타일 프롬프트(20대 초반 밝은 여성), 24kHz 16bit mono PCM base64, **Rails.cache 12h** |
| 립싱크 | `Assets/Scripts/Character/CounselorLipSync.cs` — `ConsultationVoice.Source` 진폭 |

지연 특성: 합성 3~8초/청크. 완화책 = 첫 청크 최소화 + 재생 중 다음 청크 prefetch +
서버 캐시. 간헐 503(no audio) 시 해당 청크는 자막만으로 진행.

**개선 포인트**
- ✅ 서버 1회 재시도(200-무음·5xx 모두; 4xx는 즉시 실패).
- 진짜 해결은 스트리밍 TTS(모델 지원 시) 또는 답변 생성 직후 서버가 첫 문장 TTS를 미리 만들어 응답에 동봉하는 방식.
- vi/en 고정 대사는 아직 남자 목소리 (`tools/regen_ko_voice.py`를 언어 확장하면 됨).

## 8. 사주 차트 & 시각화

| 역할 | 파일 |
|---|---|
| 차트 보관(단일 소스) | `Assets/Scripts/Saju/SajuSessionData.cs` — `SetComputedSaju`(서버 간지, 우선) > `SetBirthProfile→GenerateChart`(로컬 근사 폴백) |
| 로컬 근사(placeholder!) | `Assets/Scripts/Saju/SajuCalendar.cs` `BuildChart` — 절기 무시·일주 부정확. **읽기 전용 폴백으로만 취급할 것** |
| 서버 진실 | `saju/app/controllers/api/v1/prayers/charts_controller.rb` — SuperCalendar(만세력 테이블 1900–2099) + 시간 보정/23시 익일 규칙 → `{ganji_year/month/day/time, ilgan}` |
| 글리프/오행 유틸 | `Assets/Scripts/Consulting/Flow/Viz/SajuGlyphs.cs` — reveal 순서(년월일시), 색, 오행 가중치 |
| 4주 카드 | `Viz/FourPillarsStage.cs` — PortraitMode면 눕히지 않고(LayFlatOnTable 스킵) 스케일 0.72로 4주 모두 화면 안 |
| 오행 링/마법진/타임라인 | `Viz/FiveElementsRing.cs`, `MagicCircleStage.cs`, `TimelineRibbon.cs` 등 — cue 이름으로 `ConsultationPerformer`가 구동 |
| 공통 베이스 | `Viz/ConsultationVizStage.cs` — `PortraitMode` static, `Glow`(셰이더 폴백 체인 — UaaL 스트리핑 대비) |

셰이더 주의: 임베디드 익스포트는 씬이 참조 안 하는 셰이더를 스트리핑함.
`ProjectSettings/GraphicsSettings.asset`의 AlwaysIncludedShaders에 URP Unlit 등록됨 —
viz에서 새 셰이더를 `Shader.Find`로 쓰면 여기에도 추가할 것.

**개선 포인트**
- viz가 캐릭터 몸과 겹침 — 스테이지 앵커를 카메라 하단 1/3로 내리거나 캐릭터 옆 배치 검토.
- ✅ 오행 링 PortraitMode 스케일 0.8.
- ✅ 시간 미상 시 시주 카드 미표시(3주 재정렬) + 오행 가중치 6글자(`SajuGlyphs.HourKnown`).

## 9. 종료·재진입·리로드 생존

| 시나리오 | 처리 | 파일 |
|---|---|---|
| 뒤로가기/네비 이탈 | `closeCounselingRoom()` → SESSION_END(즉시 음소거) + 언마운트 클린업 | `CounselingRoomScreen.tsx`, `UnityHost.tsx`, `NativeUnityBridge.ts` |
| 방 밖 어디서든 | 네비 상태 변화마다 `enforceUnitySilence()` | `src/App.tsx` |
| 재진입 | iOS UaaL은 언로드 불가 → `everReady` resume: registerView에서 SESSION_INIT → Unity가 씬 재로드 + UNITY_READY 재전송 | `NativeUnityBridge.ts`, `EmbeddedConsultBootstrapper.cs` |
| JS 리로드 | React 클린업이 안 돌므로 네이티브 silencer가 SESSION_END + `markSurvivor()` | `ios/prayers/UnityLifecycle.m`, `bridge/index.ts` |

## 10. 빌드 파이프라인 (변경 반영 절차)

| 바꾼 것 | 해야 하는 것 |
|---|---|
| RN(JS)만 | Metro 리로드로 끝 |
| RN 네이티브(iOS 파일 추가 등) | pbxproj 등록(ruby xcodeproj) + `run-ios` 재빌드 |
| Unity C#/에셋/USS | `saju_world_unity/tools/export_ios_uaal.sh`(시뮬레이터 SDK) → `prayers/unity/builds/ios` + node_modules 복사 → `cd prayers/ios && rm -rf Pods/react-native-unity && pod install` → `npx react-native run-ios --udid 1FCEEC48-… --no-packager` |
| Rails | dev 자동 리로드 (routes/서비스 즉시 반영) |
| ko 음성 클립 | `python3 tools/regen_ko_voice.py` (Rails 기동 필요) 후 Unity 재익스포트 |

E2E 수동 검증 루트(시뮬 iPhone 17 Pro iOS 26.1, UDID `1FCEEC48-8918-458A-8433-8D62933D177A`):
홈 → 서연 → 상담 시작 → 민지(생일 있음) → 커리어 → 입장 → 질문 → 청크+음성 →
루프 pill 탭. 로그는 `xcrun simctl launch --console-pty`로 Unity Debug.Log 캡처,
Rails는 `saju/log/development.log`.
