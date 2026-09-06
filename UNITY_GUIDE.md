# 유니티 초짜를 위한 우리 프로젝트 코드 파악 가이드

대상: Unity를 처음 보는 사람. 목표: **에디터를 몰라도** 우리 상담방 코드를 읽고, 고치고, 확인할 수 있게 되기.
프로젝트 위치: `/Users/namaste/git/saju_fullstack/saju_world_unity` (이하 `U/` = `Assets/Scripts/`)

전체 시스템 흐름은 [INTEGRATION_FLOW.md](INTEGRATION_FLOW.md), 상담 한 판의 타임라인은 [CONSULTATION_FLOW.md](CONSULTATION_FLOW.md) 참고. 이 문서는 "유니티라는 물건을 어떻게 읽는가"에 집중한다.

---

## 1. 딱 5개만 알면 되는 유니티 개념

우리 코드에 실제로 나오는 것만 추렸다.

### ① 씬(Scene) = 무대 세트
`.unity` 파일 하나가 무대 하나다. 우리는 **딱 2개**만 쓴다:
- `Assets/Scenes/EmbeddedBoot.unity` — 앱이 Unity를 켰을 때 처음 로드되는 텅 빈 부트 무대. `RNBridge`, `EmbeddedConsultBootstrapper`가 여기 산다.
- `Assets/Scenes/ConsultationSolo.unity` — 실제 상담방(상담사, 카메라, UI 캔버스).

### ② GameObject = 무대 위의 물건, Component = 물건에 붙은 기능
무대 위 모든 것(상담사, 카메라, 말풍선)은 GameObject다. GameObject 자체는 빈 껍데기고, **Component(C# 클래스)** 를 붙여야 뭔가 한다. 우리가 짜는 코드 = 거의 전부 Component다.

```csharp
public sealed class RNBridge : MonoBehaviour   // ← MonoBehaviour 상속 = Component
```

RN에서 `postMessage('RNBridge', 'OnMessage', json)`을 보내면 유니티는 **"RNBridge라는 이름의 GameObject"를 찾아 그 위의 컴포넌트의 `OnMessage` 함수를 호출**한다. 문자열로 찾기 때문에 GameObject 이름이 계약의 일부다.

### ③ 생명주기 함수 = 유니티가 알아서 불러주는 함수
Component에 이런 이름의 함수를 만들어두면 유니티가 정해진 타이밍에 호출한다:

| 함수 | 언제 | 우리 코드 예 |
|---|---|---|
| `Awake()` | 생성 직후 | `RNBridge.Awake` — 싱글턴 등록 |
| `Start()` | 첫 프레임 전 | `EmbeddedConsultBootstrapper.Start` — 브리지 이벤트 구독 |
| `Update()` / `LateUpdate()` | **매 프레임**(초당 60번) | `ConsultationUIToolkitBridge.LateUpdate` — 레거시 UI 상태를 매 프레임 미러링 |
| `OnDestroy()` / `OnDisable()` | 파괴/비활성 시 | 이벤트 구독 해제 |

"이 코드는 언제 실행되지?"가 궁금하면 먼저 이 함수들을 찾아라.

### ④ `[SerializeField]` = 에디터에서 조절하는 손잡이
```csharp
[Tooltip("Tốc độ đọc, ký tự mỗi giây.")]
[SerializeField] private float _charsPerSecond = 13f;
```
`private`인데 앞에 `[SerializeField]`가 붙으면 **씬 파일에 값이 저장**되고 에디터에서 조절할 수 있다. ⚠️ **중요한 함정**: 씬에 저장된 값이 **코드의 기본값을 덮어쓴다**. 코드에서 `= 13f`를 `= 20f`로 바꿔도, 씬이 13을 저장해 뒀으면 13이 쓰인다. 씬에 저장돼 있는지는 에디터 없이도 확인 가능:

```bash
grep -n "_charsPerSecond" Assets/Scenes/ConsultationSolo.unity
```
(나오면 씬 값이 이긴다. 실제 사례: `ConsultationLoop._introLocKey`가 씬에서 `consult_loop_open`으로 오버라이드되어 있어서 코드 기본값 `consult_loop_intro`만 보다가 헛짚었다.)

Tooltip이 영어/베트남어/한국어가 섞여 있는데, 이건 문서 그 자체다 — 필드가 왜 있는지 설명이니 꼭 읽자.

### ⑤ 코루틴(Coroutine) = "기다렸다가 계속"하는 함수
유니티는 싱글스레드라 `sleep`을 하면 화면이 멈춘다. 대신:

```csharp
IEnumerator AutoAdvanceNatural(ConsultationPhase p)
{
    yield return null;                      // 한 프레임 쉬고
    while (voice.IsSpeaking) yield return null;   // 말 끝날 때까지 매 프레임 체크
    yield return new WaitForSeconds(0.7f);  // 0.7초 쉬고
    Advance();                              // 다음 페이즈로
}
// 시작은: _auto = StartCoroutine(AutoAdvanceNatural(p));
// 중단은: StopCoroutine(_auto);
```
우리 페이싱(청크 사이 기다리기, 음성 끝나면 넘어가기)은 전부 이 패턴이다. `IEnumerator` + `yield return`이 보이면 "시간을 두고 진행되는 절차"라고 읽으면 된다.

**보너스 개념 2개** (자주 마주침):
- `Resources.Load<T>("경로")` — `Assets/Resources/` 밑의 파일을 코드에서 경로 문자열로 로드. 음성 클립(`Audio/Consultation/ko/...`), 로컬라이즈 테이블, UI 문서(UXML)가 이 방식.
- `static` 클래스/필드 — 씬이 바뀌어도 살아남는 전역. 우리의 크로스-씬 통로: `ConsultationHandoff`(페르소나/토픽), `ConsultationVizStage.PortraitMode`(임베디드 모드 플래그), `AiNpcChatService.EndpointOverride`(API 경로 교체).

---

## 2. 우리 프로젝트 지도 (어디에 뭐가 있나)

```
Assets/
├─ Scenes/
│  ├─ EmbeddedBoot.unity          부트 무대 (RN 진입점)
│  └─ ConsultationSolo.unity      상담방 무대
├─ Scripts/
│  ├─ Embedded/                   ★ RN ↔ Unity 경계. 여기서 읽기 시작
│  │  ├─ RNBridge.cs                이벤트 수신/발신 허브 (JSON ↔ C#)
│  │  ├─ RNBridgeMessages.cs        이벤트 DTO (RN types/index.ts와 짝)
│  │  └─ EmbeddedConsultBootstrapper.cs  SESSION_INIT 처리·씬 로드·폰 전용 설정 전부
│  ├─ Consulting/
│  │  ├─ Flow/                    ★ 상담 본체 (제일 큰 동네)
│  │  │  ├─ ConsultationFlowController.cs  P01~P20 상태기계 (두뇌)
│  │  │  ├─ ConsultationFlowUI.cs          말풍선/선택지/청크 표시 (입)
│  │  │  ├─ ConsultationLoop.cs            추가질문 루프 + pill
│  │  │  ├─ ConsultationOracle.cs          AI에게 질문/답변 분배
│  │  │  ├─ ConsultationVoice.cs           음성 재생 (녹음 클립 + TTS)
│  │  │  ├─ ConsultationTts.cs             서버 TTS 호출
│  │  │  ├─ ConsultationPerformer.cs       연출 cue 라우터 (감독)
│  │  │  ├─ ConsultationCameraRig.cs       카메라 샷
│  │  │  ├─ ConsultationChatLog.cs         채팅 트랜스크립트
│  │  │  └─ Viz/                           3D 시각화 (4주 카드, 오행 링…)
│  │  └─ AiNpc/                   백엔드 통신 (AiNpcChatService, SajuChatContext)
│  ├─ Saju/                       사주 데이터 (SajuSessionData = 세션의 단일 진실)
│  ├─ UIKit/                      UI Toolkit 스킨 (말풍선 디자인)
│  └─ Core/                       공용 (LocalizationManager=Loc, HttpFactory)
├─ Data/ConsultationFlow.asset    ★ 페이즈 20개의 대본 (코드가 아니라 데이터!)
├─ Resources/
│  ├─ LocalizationData.asset      ★ 모든 문구 vi/en/ko (키 없으면 vi 폴백 노출!)
│  ├─ Audio/Consultation/ko/      고정 대사 45개 wav (tools/regen_ko_voice.py로 재생성)
│  └─ ConsultationView.uxml/.uss  말풍선 레이아웃 (CSS 비슷한 것)
└─ ../tools/export_ios_uaal.sh    ★ 수정 반영 스크립트
```

**핵심 감각**: 대사·페이즈 순서·연출 이름은 코드가 아니라 **데이터**(`ConsultationFlow.asset`, `LocalizationData.asset`)에 있다. 코드는 그 데이터를 "재생"하는 기계다.

---

## 3. 코드 읽는 추천 순서 (반나절 코스)

순서대로 읽으면 큰 그림이 잡히게 배열했다. 파일 상단 주석이 잘 돼 있으니 주석부터.

1. **`Embedded/RNBridge.cs`** (140줄) — 이벤트가 어떻게 들어오고 나가는지. `OnMessage`의 switch문이 사실상 목차다.
2. **`Embedded/EmbeddedConsultBootstrapper.cs`** — `OnSessionInit` 한 함수에 "앱이 유니티에게 시키는 일" 전부가 순서대로 있다 (언어→차트→엔드포인트→폰 설정→씬 로드).
3. **`Flow/ConsultationFlowController.cs`** — `EnterIndex()`부터. "페이즈에 들어가면 카메라 이동+애니+연출+UI를 한 번에 발사하고, 자동 진행 코루틴을 건다"가 전부다. `Advance()`, `HoldForReading()`, `HoldChunk()` 순으로.
4. **`Flow/ConsultationFlowUI.cs`** — `FillDialogue()`(대사 채우기·청크 분해), `OnTap()`(탭 우선순위: 청크→페이지→진행), `ShowChatLoop()`(추가질문 화면).
5. **`Flow/ConsultationLoop.cs`** — `ServeQueuedBeat()`(pill 탭이 뭘 서빙하는지), `OnAsk()`(자유 질문 서버행).
6. **`Flow/ConsultationVoice.cs` + `ConsultationTts.cs`** — 목소리의 2계층: 녹음 클립(Resources) vs 실시간 TTS.
7. 필요할 때: `Viz/FourPillarsStage.cs`(4주 카드가 어떻게 조립되는지 — 코드로 3D를 만드는 좋은 예), `ConsultationPerformer.cs`(cue 문자열 → 연출 라우팅).

---

## 4. 실전: "이거 어디서 하는 거야?" 추적법

에디터 없이 grep만으로 대부분 찾는다. 프로젝트 루트에서:

**화면에 보이는 문구로 찾기** — 문구는 거의 다 로컬라이즈 테이블에 있다:
```bash
grep -n "무엇이 궁금하신가요" Assets/Resources/LocalizationData.asset
# → 키(consult_p05_l0)를 얻고, 그 키로 코드 검색
grep -rn "consult_p05_l0" Assets/Scripts Assets/Data
```

**연출로 찾기** — 연출은 cue 문자열로 연결된다 (`ConsultationFlow.asset`의 vfx 목록 ↔ 각 Viz 스테이지의 `Handles`):
```bash
grep -rn "MagicCircleForm" Assets/Scripts Assets/Data
```

**로그로 찾기** — 우리 로그 태그: `[Consultation]`(플로우), `[Embedded]`(브리지/부트), `[ConsultationTts]`(음성), `[SajuSessionData]`(차트). 실행 로그에서 본 문구를 코드에서 역검색하면 바로 현장이 나온다.

**함수 호출처 찾기**:
```bash
grep -rn "SpeakChunkedText" Assets/Scripts   # 누가 부르나
```

---

## 5. 수정 → 확인 루프 (에디터 없이)

```bash
# 1) 코드/에셋 수정 후, 유니티 익스포트 + 앱 반영 (약 5~8분)
cd /Users/namaste/git/saju_fullstack/saju_world_unity && ./tools/export_ios_uaal.sh
cd /Users/namaste/git/prayers/ios && rm -rf Pods/react-native-unity && pod install
cd .. && npx react-native run-ios --udid 1FCEEC48-8918-458A-8433-8D62933D177A --no-packager

# 2) Unity 로그 보기 (Debug.Log가 여기로 나온다)
xcrun simctl terminate 1FCEEC48-... org.reactjs.native.example.prayers
xcrun simctl launch --console-pty 1FCEEC48-... org.reactjs.native.example.prayers
```

- 디버깅은 `Debug.Log("[내태그] ...")` 를 심고 위 콘솔에서 grep. 컴파일 에러는 익스포트 로그(`Builds/uaal-ios-export.log`)에 나온다.
- RN 코드만 고쳤으면 익스포트 불필요 — Metro 리로드로 끝.
- ko 음성 대사를 바꿨으면: 로컬라이즈 수정 → `python3 tools/regen_ko_voice.py`(Rails 필요) → 익스포트.

---

## 6. 우리 프로젝트만의 규칙 (모르면 헛수고하는 것들)

1. **PortraitMode 분기** — 폰(임베디드) 전용 동작은 전부 `ConsultationVizStage.PortraitMode` static 플래그로 가드한다. 게임 본편을 건드리지 않고 폰 동작을 바꾸는 공식 스위치. 새 폰 전용 수정도 이 가드를 쓰자.
2. **스킵/설정 등록 타이밍** — `ConsultationFlowController`는 **상담이 시작될 때** 만들어진다. 씬 로드 직후(`OnConsultationLoaded`)에 `FindFirstObjectByType`으로 찾으면 null이다. 플로우 관련 설정은 컨트롤러의 `Begin()` 안에서 스스로 하게 만든다 (P18 스킵이 그 예).
3. **로컬라이즈 키가 없으면 베트남어가 샌다** — `Loc.Get(key)`가 키를 못 찾으면 코드의 vi 폴백이 화면에 그대로 나온다. 새 문구는 반드시 `LocalizationData.asset`에 vi/en/ko 세 줄 추가.
4. **셰이더 스트리핑** — 임베디드 익스포트는 씬이 참조 안 하는 셰이더를 빼버린다. `Shader.Find()`로 쓰는 셰이더는 `ProjectSettings/GraphicsSettings.asset`의 AlwaysIncludedShaders에 넣어야 한다 (안 넣으면 폰에서만 null → 우리가 겪은 '답변 안 나옴' 대참사의 원인).
5. **런타임 조립(스트랭글러)** — UI Toolkit 스킨(`ConsultationUIToolkitBridge`)은 씬을 안 고치고 부트스트래퍼가 **런타임에 붙인다**. 레거시 UGUI는 로직만 살아있고(알파 0) 픽셀은 UITK가 그린다. 단, **선택지/pill은 예외로 레거시가 직접 그린다**(UITK가 임베디드에서 터치를 못 받아서).
6. **좌표 이동은 월드 기준으로** — 스테이지 로컬 축은 씬 앵커 회전에 따라 제멋대로다. "카메라 쪽으로" 옮길 땐 `Camera.main` 위치로 방향을 계산하자 (4주 카드 배치에서 로컬 Z 추측으로 두 번 실패한 전적).
7. **API는 prayers 전용만** — 유니티가 서버를 부를 땐 `EndpointOverride`(`/api/v1/prayers/...`)를 쓴다. 공용(v2, game/*) 엔드포인트를 새로 부르지 말 것.

---

## 7. 미니 용어 사전

| 용어 | 뜻 |
|---|---|
| Prefab | GameObject 조립품 저장본 (붕어빵 틀) |
| Transform | 모든 GameObject가 가진 위치/회전/크기 |
| RectTransform | UI용 Transform (anchoredPosition = UI 좌표) |
| Canvas / UGUI | 구형 UI 시스템 (우리 트랜스크립트·pill) |
| UI Toolkit / UXML / USS | 신형 UI 시스템, HTML/CSS 비슷 (우리 말풍선) |
| TextMeshPro (TMP) | 고급 텍스트 렌더러 (한자 글리프도 이것) |
| AudioSource / AudioClip | 스피커 / 음원 |
| ScriptableObject (.asset) | 씬 밖에 저장하는 데이터 파일 (`ConsultationFlow.asset`) |
| batchmode | 에디터 창 없이 CLI로 유니티 실행 (익스포트가 이 방식) |

---

## 8. 첫 연습문제 (30분)

감 잡기용. 답은 전부 이 문서의 추적법으로 나온다.

1. P02 인사말 "어서 오세요…"를 다른 문장으로 바꿔서 앱에서 확인해 보기. (힌트: §4 문구 추적 → LocalizationData → 음성도 바꾸려면 §5 regen)
2. 청크 사이 숨 고르는 시간 0.3초를 0.5초로 바꿔 보기. (힌트: `HoldChunk`)
3. P07 마법진 연출이 어떤 파일에서 그려지는지 찾아가 보기. (힌트: cue `MagicCircleForm`)
