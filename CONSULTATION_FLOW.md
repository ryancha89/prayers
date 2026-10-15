# 상담 세션 상세 플로우 — 시작부터 종료까지

한 번의 상담이 흘러가는 전 과정을 시간 순서로 쪼갠 문서. 각 구간마다
**무슨 일이 일어나는지 / 어느 파일이 담당하는지 / 무엇을 개선할 수 있는지**를 적는다.
시스템 전반(브리지·빌드·API 개요)은 [INTEGRATION_FLOW.md](INTEGRATION_FLOW.md) 참고.

경로 약어: `RN=prayers/src`, `U=saju_world_unity/Assets/Scripts`, `API=saju/app`

페이즈 데이터 원본: `saju_world_unity/Assets/Data/ConsultationFlow.asset`
(ui: 0=None 1=Dialogue 2=Choices 3=QuestionBox 4=Report /
camera: 0=Establishing 1=Dialogue 2=Analysis 3=CloseUp 4=Result 5=Closing)

---

## 구간 0. 진입 — 방 문을 열기까지

| # | 일어나는 일 | 담당 |
|---|---|---|
| 0-1 | `UnityEntryScreen`이 `openCounselingRoom(payload)` 호출 — counselor·subject(생일/성별/**birthTime**)·topic·apiBase·locale | `RN/features/counseling/screens/UnityEntryScreen.tsx` |
| 0-2 | `CounselingRoomScreen` 마운트 → `UnityHost`가 UnityView ref 등록 | `…/screens/CounselingRoomScreen.tsx`, `…/components/UnityHost.tsx` |
| 0-3 | (첫 진입) Unity 부트 → EmbeddedBoot 씬 → `UNITY_READY` / (재진입·리로드) registerView가 즉시 `SESSION_INIT` | `U/Embedded/RNBridge.cs`, `RN/…/bridge/NativeUnityBridge.ts` |
| 0-4 | `SESSION_INIT` 처리: locale→언어, apiBase, 로컬 근사 차트, **서버 차트 페치**, persona 'wood', 엔드포인트 오버라이드(chat/tts), PortraitMode, 카메라 리터닝, P18 스킵 등록 | `U/Embedded/EmbeddedConsultBootstrapper.cs` |
| 0-5 | ConsultationSolo 씬 로드 → `SoloConsultationEntry`가 자동 착석·플로우 시작 → `UNITY_READY` 재전송 → RN 로딩 베일 해제 | `U/Consulting/Flow/SoloConsultationEntry.cs` |

개선:
- [ ] 로딩 베일이 단색 스피너뿐 — 부팅 5~8초 동안 상담사 소개/오늘의 운 티저 등 표시 가치.
- [x] `FetchServerChart` 1회 재시도 + 실패 로그.
- [x] birthTime 없음 = 시간 모름 → 시주 미생성(`ganji_time` 빈값 저장) → viz 3주·가중치 6글자·LLM "모름".

## 구간 1. 인사 (P01–P02)

| 페이즈 | ui/cam | 내용 | 음성 |
|---|---|---|---|
| P01 (auto 4s) | None/Establishing | 입장 연출: DoorLightTransition, AmbientParticles | 없음 |
| P02 | Dialogue/Dialogue | "어서 오세요. 오늘은 무엇이 궁금하신가요?" | 녹음 클립 `consult_p02_l0.wav` (Leda 여성) |

파일: 페이싱 `U/Consulting/Flow/ConsultationFlowController.cs` (`AutoAdvanceNatural`),
대사 채움 `ConsultationFlowUI.FillDialogue`, 녹음 재생 `ConsultationVoice.Speak`,
말풍선 미러 `U/UIKit/ConsultationUIToolkitBridge.cs` → `ConsultationView`(하단 anchor).

개선:
- [ ] 인사 중 Wave/Nod 모션 없음(애니메이터에 상태 부재) — `Welcome` Bool은 m003 rig에만 있음, f_char rig 확인 필요.
- [ ] P02가 auto=0이라 글자수 dwell — 클립 길이와 이중 대기라 살짝 김.

## 구간 2. 질문 받기 (P03–P05)

| 페이즈 | 상태 | 내용 |
|---|---|---|
| P03·P04 | **스킵**(talk-first, `_skipPhases`) | 원래 카테고리/범위 선택 — RN에서 topic을 이미 골랐으므로 생략 |
| P05 | QuestionBox/Dialogue | "무엇이 궁금하신가요?" + `INPUT_STATE(true)` → RN 채팅바 활성 |

입력 경로: RN 채팅바(`CounselingRoomScreen` onSend, 한글 IME) → `USER_QUESTION`
→ `RNBridge.UserQuestion` → `ConsultationUIToolkitBridge.OnSubmit`(legacy 필드+버튼 Invoke)
→ `ConsultationFlowController.SubmitQuestion`.

개선:
- [ ] 질문 예시 placeholder가 고정 문구 — topic별 추천 질문 프리셋 표시 여지.
- [ ] P05 대기 중 캐릭터 idle뿐 — listening 제스처 없음.

## 구간 3. 오라클 호출 + 로딩 연출 (P06–P10)

P06에서 질문 접수 → `ConsultationOracle.Ask` 발사(`U/Consulting/Flow/ConsultationOracle.cs`).
AI 왕복(5~30s) 동안 P07–P10 연출이 **로딩 화면 역할**을 한다. P11 진입 시
답이 아직이면 `HoldForReading`이 "차트를 읽는 중…" + Thinking 포즈로 대기.

| 페이즈 | 연출(cue) | 구현 |
|---|---|---|
| P06 | SpaceTransition | `ConsultationPerformer.PlayVfx` 라우팅 |
| P07 (auto 3.5s) | MagicCircleForm·LightGather + 주문 모션(SpellCasting) | `U/…/Viz/MagicCircleStage.cs` |
| P08 | 4주 카드 순차 등장(PillarYear→…→Hour), 천간/지지, 연결선 | `Viz/FourPillarsStage.cs` — **PortraitMode: 눕히지 않고 스케일 0.72** |
| P09 | 오행 링 + 강약 하이라이트 | `Viz/FiveElementsRing.cs` (가중치 `SajuGlyphs.ElementWeights` = 8글자 출현 빈도) |
| P10 | 올해 기운 접근·연결 | `Viz/YearlyEnergyStage.cs` |

백엔드 요청: `AiNpcChatService.SendAsync` → `POST API /api/v1/prayers/consultations/message`
(`consultations_controller.rb` → `consultation_service.rb`: topic 모드 판정,
MessagesGeneratorV2, Gemini/LlmFailover, strip_markdown, followup 생성).
차트 정보는 `SajuChatContext.FromSession().BuildBaseInfo`로 동봉(간지·오행·강약 등).

실패 분기: 연결 실패 → `ShowDisconnect`(재시도/나가기), 차트 없음(자신=생일 미입력)
→ no-chart 안내문.

개선:
- [x] 오행 링 PortraitMode 스케일 0.8 (위치 추가 보정은 여지).
- [ ] viz가 캐릭터 몸과 겹침 — 스테이지 앵커를 화면 하단 1/3(테이블 높이)로 내리는 실험.
- [x] 시간 모름이면 P08 시주 카드 미표시(년월일 3주 재정렬).
- [ ] 오라클 왕복이 30s 넘으면 P07~P10이 끝나고도 HoldForReading이 길어짐 — 진행률/한마디 추가 여지.

## 구간 4. 리딩 4부작 (P11 → P13 → P14 → P15 → P17 → P19)

오라클 답변 하나가 P11/P14/P17/P19 네 파트로 분배된다(`Speech.TryGetLines(phaseId)`).
각 파트는 **청크 재생**으로 전달:

```
FillDialogue (ConsultationFlowUI.cs)
  SplitReading: 첫 청크 = 첫 문장(TTS 첫 지연 최소화), 이후 ~110자 패킹
  청크0 표시+SpeakText → 나머지 청크 Prefetch → 다음 파트 첫 청크도 Prefetch
AutoAdvanceNatural → HoldChunk (ConsultationFlowController.cs)
  fetch 대기(≤15s) → 재생 끝까지 → 0.3s 숨 → AdvanceChunk
  탭 = OnTap → AdvanceChunk 즉시 (컨트롤러는 인덱스 재확인으로 이중 스킵 방지)
음성: ConsultationVoice.SpeakText → ConsultationTts → POST /api/v1/prayers/tts
  (Gemini Leda 여성, 24k PCM, Rails.cache 12h) → CounselorLipSync 입모양
```

사이 페이즈: P12(스킵), P13 지지 해설(ReopenSaju·가지 하이라이트, 분기 variant 대사),
P15 타임라인 리본(TimelineAppear…), P16(스킵), P18(임베디드 스킵 — 점수표).

개선:
- [x] TTS 간헐 무음/5xx → 서버 1회 재시도(`tts_service.rb`).
- [ ] 청크 사이 0.3s 고정 — 문장 끝맺음(?!.)에 따라 가변이면 더 자연스러움.
- [ ] P13 variant가 스킵된 P12 선택지에 의존 — talk-first에서는 기본 variant만 나옴(분기 사장됨).
- [ ] 립싱크 진폭 기반 — 모음 매핑 아님(저비용 개선 여지 낮음, 현상 유지 권장).

## 구간 5. 마무리 → 추가 질문 루프 (P20 → ShowChatLoop)

P20 "오늘 상담은 여기까지입니다" + 선택지 → 이후 **자유 채팅 루프**:

```
ShowChatLoop (ConsultationFlowUI.cs)
  트랜스크립트(ConsultationChatLog, UGUI 유지) + 답변 카드 숨김
  followup pill = legacy Choice0 (UITK 칩은 임베디드에서 이벤트 불가 → UGUI 담당)
  corner leave 버튼 / RN 채팅바 자유 입력
  답변 도착 → 카드+트랜스크립트 + SpeakText("loop#hash") 음성
루프 질문 → 같은 오라클 경로 재사용 (topic 모드: 벗어난 질문은 답하고 되돌림,
  2연속 이탈 시 suggest_switch)
```

개선:
- [ ] 루프 답변은 통짜 음성(800자 캡) — 리딩처럼 청크화하면 톤 일관.
- [ ] `suggest_switch=true`가 와도 클라이언트 업셀 칩 미구현.
- [ ] pill이 한 개뿐 — followup 외 topic 전환 pill 등 복수 pill 여지.
- [x] 게스트 uid 디바이스별 분리 — SESSION_INIT `auth`(RN 영속 랜덤 id) → User-Auth.

## 구간 6. 종료 (어느 시점이든)

| 트리거 | 흐름 |
|---|---|
| 뒤로가기(RN 상단) | `onExit` → `closeCounselingRoom()` → `SESSION_END`(AudioListener 즉시 음소거) → Conversations 탭 |
| Unity 내 leave | `EXIT_SESSION` → RN `onExit` 동일 경로 |
| 화면 언마운트/에러 | `UnityHost` 클린업 + `CounselingRoomScreen` unmount effect — 같은 SESSION_END |
| 방 밖 어디서든 | `App.tsx` `enforceUnitySilence()` (네비 상태 변화마다) |
| JS 리로드 | `ios/prayers/UnityLifecycle.m`이 생존 Unity에 SESSION_END + `markSurvivor()` |

재진입: iOS UaaL은 프로세스 생존 중 언로드 불가 → `everReady` resume 경로
(registerView에서 SESSION_INIT → Unity가 상담 씬 새로 로드 → 상태 초기화).

개선:
- [x] 상담사 발화 RN 기록 동기화(`COUNSELOR_MESSAGE`) — Conversations 탭에 양쪽 다 남음.
- [x] Unity 내 leave/Finish가 EXIT_SESSION을 안 쏴서 데드엔드(종료 연출 후 방치) → `Finish()`에 임베디드 가드로 전송.
- [x] 차트리스(생일 없음) 시 문서 예제 사주가 진짜처럼 표시 → 임베디드에선 4주/오행 링 미표시.
- [x] no-chart/disconnect 안내의 재시도·나가기 버튼이 말풍선/RN바에 깔림 → 바닥 스택 리프트 560px.
- [ ] 이탈 후 재진입 시 대화 컨텍스트는 서버(uniq_id)에 남지만 세션 이어보기 UX 없음.

---

## 개선 백로그 (우선순위 제안)

**정확성**
1. [x] birthTime 없음 → 시주 미표시(3주 재정렬) + 오행 가중치 6글자 + LLM zodiac_time 빈값("모름")
   — `SajuGlyphs.HourKnown()/ElementWeights(c,includeHour)`, `FourPillarsStage.Build`, `FetchServerChart`(ganji_time 드롭)
2. [x] TTS 재시도(`tts_service.rb` no-audio/5xx 1회) / FetchServerChart 1회 재시도
3. [x] 디바이스별 게스트 uid — `RN/shared/device/deviceId.ts`(persist) → SESSION_INIT `auth` → `SetUserAuth` → User-Auth 헤더

**자연스러움**
4. [x] 오행 링 PortraitMode 스케일 0.8 (`FiveElementsRing.Build`) — 위치 보정은 추후
5. [ ] 루프 답변 청크화
6. [ ] viz-캐릭터 겹침 배치(테이블 높이 하향)

**제품 기능**
7. [ ] suggest_switch 업셀 칩
8. [x] RN Conversations 기록 동기화 — Unity `COUNSELOR_MESSAGE` 이벤트(ChatLog.AddCounselor 훅, ask-back 안내문은 mirror 제외) → RN appendMessage
9. [x] 로딩 베일 팁 로테이션 (`unity.tip1~3`) / [ ] 오라클 장기 대기 멘트
10. [ ] P12/P16 분기 부활 여부 결정(현재 talk-first로 사장)
11. [x] (추가) 세션 내 재질문 시 P07-P10 연출 반복 제거(리플레이 라운드 스킵) · 트랜스크립트-pill 겹침 해소 · `consult_loop_open/intro/leave/enough` ko 로컬라이즈
