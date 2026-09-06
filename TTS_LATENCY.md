# AI 답변 → 목소리가 느린 이유와 고치는 곳 (코드로 따라가기)

"답변 텍스트는 떴는데 목소리가 몇 초 뒤에 나온다"를 개선하려면 어디를 만져야 하는지,
실제 코드 조각과 풀 패스로 따라가는 문서. [UNITY_GUIDE.md](UNITY_GUIDE.md)의 실전편이다.

경로 약어 없음 — 전부 풀 패스로 적는다.

---

## 1. 소리가 나기까지의 전체 경로 (① ~ ⑥)

```
[Unity]                                                        [Rails]
① 답변 도착        ConsultationOracle.Distribute()
② 문장 청크 분해   ConsultationFlowUI.SplitReading()
③ 합성 요청(HTTP)  ConsultationTts.SynthesizeAsync()  ──────▶  ④ tts_service.rb → Gemini TTS
⑤ 재생 대기 페이싱 ConsultationFlowController.HoldChunk()  ◀── (PCM base64 응답)
⑥ 재생             ConsultationVoice.SpeakText / SpeakChunkedText
```

**병목은 ④ 하나다.** Gemini TTS가 문장 하나를 만드는 데 3~8초 걸린다.
나머지 단계는 전부 이 3~8초를 *숨기는* 장치이고, 아래에서 하나씩 본다.

---

## ① 답변이 도착하는 순간 — 여기서 미리 합성을 시작한다

파일: `/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Scripts/Consulting/Flow/ConsultationOracle.cs`

AI 답변은 P07~P10 연출(마법진→4주→오행)이 도는 **중간에** 도착한다. 그 순간
첫 문장을 미리 TTS에 태워두면, P11에 들어갈 때는 이미 소리가 준비돼 있다:

```csharp
// Distribute() 끝부분 — 답변을 P11/P14/P17/P19로 나눠 담은 직후
// The reading usually lands while the P07-P10 staging is still playing. Synthesising
// the opening line NOW means P11 speaks the moment it appears, instead of the player
// watching a silent subtitle for the 3-8s the TTS takes.
if (TryGetLines("P11", out var p11Lines) && p11Lines != null && p11Lines.Length > 0)
{
    var voice = FindFirstObjectByType<ConsultationVoice>();
    voice?.Prefetch(
        ConsultationFlowUI.SplitReading(string.Join("\n", p11Lines))[0], "P11#0");
}
```

→ 그래서 **첫 질문의 리딩은 거의 즉시** 말한다.
→ **추가 질문(루프)이 느린 이유**: 루프에는 숨길 연출이 없다. 답 텍스트가 도착해야
합성을 시작할 수 있으니 "도착 → 3~8초 → 소리"가 그대로 체감된다.

---

## ② 첫 청크를 짧게 잘라 합성 시간 자체를 줄인다

파일: `/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Scripts/Consulting/Flow/ConsultationFlowUI.cs`

합성 시간은 글자 수에 비례한다. 그래서 첫 청크는 무조건 **한 문장**:

```csharp
// SplitReading() 안 — 문장들을 ~110자 덩어리로 묶되,
// The FIRST chunk is deliberately a single sentence: its TTS is the only one
// nobody could prefetch, and synthesis time scales with length — one short
// sentence starts speaking seconds sooner than a full 110-char chunk would.
bool closeFirst = chunks.Count == 0 && cur.Length >= 15;
if (cur.Length > 0 && (closeFirst || cur.Length + 1 + s.Length > target))
{
    chunks.Add(cur.ToString());
    cur.Length = 0;
}
```

첫 청크가 재생되는 동안 나머지는 백그라운드에서 미리 만든다 (`FillDialogue()`):

```csharp
_voice.SpeakText(first, CurrentChunkKey);
// The rest of THIS reading synthesises while chunk 0 plays…
for (int i = 1; i < _chunks.Length; i++)
    _voice.Prefetch(_chunks[i], _chunkPhase + "#" + i);
```

---

## ③ Unity → 서버 호출부

파일: `/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Scripts/Consulting/Flow/ConsultationTts.cs`

```csharp
public static string EndpointOverride;   // 임베디드에선 "/api/v1/prayers/tts"
...
string endpoint = string.IsNullOrEmpty(EndpointOverride) ? Endpoint : EndpointOverride;
using var req = new HttpRequestMessage(HttpMethod.Post, baseUrl + endpoint);
// 응답: {success, pcm_base64, sample_rate, channels, duration}
// → BuildClip()이 PCM을 AudioClip으로 바로 만든다 (WAV 헤더 없음)
```

여기는 계약(입력 text, 출력 PCM)만 지키면 서버가 무엇으로 합성하든 모른다.
**즉, 프로바이더 교체는 서버 파일 하나로 끝난다** (§7-A).

---

## ④ 서버 — 진짜 3~8초가 소모되는 곳

파일: `/Users/namaste/git/saju_fullstack/saju/app/services/prayers/tts_service.rb`

```ruby
MODEL = (ENV['PRAYERS_TTS_MODEL'].presence || 'gemini-2.5-flash-preview-tts').freeze
VOICE = (ENV['PRAYERS_TTS_VOICE'].presence || 'Leda').freeze   # 젊은 여성 보이스
STYLE = '다음 문장을 20대 초반의 밝고 상냥한 한국인 여성 사주 상담사가 ' \
        '따뜻하고 친근하게, 평소 대화보다 조금 빠른 속도로 또랑또랑하게 읽어줘: '
STYLE_VERSION = 'v2'   # 스타일 바꾸면 버전도 올려야 옛 목소리 캐시가 안 나온다

def synthesize(text, lang: 'ko')
  cache_key = "prayers_tts/#{STYLE_VERSION}/#{VOICE}/#{Digest::SHA1.hexdigest(text)}"
  cached = Rails.cache.read(cache_key)
  return cached if cached                      # 같은 문장 재요청은 0초

  # …Gemini generateContent 호출 (여기가 3~8초) + 무음/5xx 1회 재시도…

  Rails.cache.write(cache_key, result, expires_in: 12.hours)
  result
end
```

낭독 **속도/톤**을 바꾸고 싶으면 `STYLE` 문구를 고치고 `STYLE_VERSION`을 올리면 된다
(캐시 키에 버전이 들어가서 옛 음성이 재생되는 사고를 막는다).

---

## ⑤ 페이싱 — "합성 기다리는 중"과 "포기"의 경계

파일: `/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Scripts/Consulting/Flow/ConsultationFlowController.cs`

자막이 뜬 청크의 소리가 아직 안 왔으면 최대 25초까지 기다렸다가, 그래도 없으면
자막 속도로 넘어간다 (무음이 플로우를 멈추지는 못하게):

```csharp
// HoldChunk() — 25s, not 15: under prefetch contention a synthesis can run long,
// and a pacing that walks past the chunk throws the clip away when it lands —
// exactly the "first messages silent, voice starts mid-reading" report.
float t = 0f;
while (voice.IsFetching(key) && t < 25f) { t += Time.deltaTime; yield return null; }
...
if (voice.IsSpeaking)
{
    while (voice.IsSpeaking) yield return null;          // 말 끝날 때까지
    yield return new WaitForSeconds(0.3f);               // 숨 한 번
    yield break;
}
float d = 0f;                                            // 소리가 없으면 읽기 속도로
while (d < dwell) { d += Time.deltaTime; yield return null; }
```

"앞 청크는 무음, 중간부터 소리" 증상은 이 대기 캡을 초과했을 때 생긴다
→ 캡을 늘리거나(여기), 합성을 빠르게(§7)가 답.

---

## ⑥ 재생 + 대기 필러

파일: `/Users/namaste/git/saju_fullstack/saju_world_unity/Assets/Scripts/Consulting/Flow/ConsultationVoice.cs`

루프(추가 질문) 답변은 통짜가 아니라 **순차 청크 재생**(800자 캡 회피 + 시작 단축):

```csharp
public void SpeakChunkedText(string text, string keyBase)
{
    var chunks = ConsultationFlowUI.SplitReading(text);
    // Everything after the opener synthesises while the opener plays.
    for (int i = 1; i < chunks.Length; i++) Prefetch(chunks[i], keyBase + "#" + i);
    _chunkRun = StartCoroutine(ChunkRun(chunks, keyBase));
}
```

그리고 어차피 생기는 대기는 침묵 대신 **말로 채운다**
(`ConsultationFlowUI.SpeakThinkingFiller` — 컨트롤러 `HoldForReading`과
`ConsultationLoop.OnAsk` 두 곳에서 호출):

```csharp
string line = Resolve("consult_thinking_line",
                      "잠깐만, 네 사주를 좀 들여다볼게. 조금만 기다려 줘!");
_voice.SpeakText(line, "think#filler");   // 한 번 합성되면 세션+서버 캐시로 재사용
```

---

## 7. 그래서 "더" 빠르게 하려면 — 난이도 순

### A. TTS 프로바이더 교체 ★추천 (파일 1개)
고칠 곳: `/Users/namaste/git/saju_fullstack/saju/app/services/prayers/tts_service.rb` **만**.
OpenAI `tts-1`(~1초대, 현재 키 401이라 갱신 필요)이나 ElevenLabs Flash로 교체.
Unity는 PCM 계약만 같으면 전혀 몰라도 된다. 예 (OpenAI, `response_format: 'pcm'`은
24kHz 16bit mono라 계약과 정확히 일치):

```ruby
def synthesize(text, lang: 'ko')
  # …캐시 확인은 동일…
  body = OpenAI::Client.new.audio.speech(parameters: {
    model: 'gpt-4o-mini-tts', input: text, voice: 'nova',
    instructions: STYLE, response_format: 'pcm',
  }).to_s
  { pcm_base64: Base64.strict_encode64(body), sample_rate: 24_000,
    channels: 1, duration: body.bytesize / 2.0 / 24_000 }
end
```

### B. 답변 생성 직후 서버가 첫 문장 캐시 예열 (파일 2개)
고칠 곳: `/Users/namaste/git/saju_fullstack/saju/app/services/prayers/consultation_service.rb`
— `answer`가 나온 직후 스레드/잡으로 `TtsService.synthesize(첫문장)`을 태워 **캐시만 데워둔다**.
유니티가 몇 초 뒤 같은 문장을 요청하면 캐시 히트로 즉시.
⚠️ 함정: 캐시 키가 문장 문자열 그대로라, 루비 쪽 "첫 문장 자르기"가 Unity
`SplitReading`(문장부호 `.!?…。` + 뒤따르는 따옴표 포함)과 **한 글자도 다르면 안 된다**.

### C. 스트리밍 TTS (큰 공사)
서버를 chunked 응답으로, Unity `ConsultationTts`의 "전체 PCM 수신 후 AudioClip 생성"
구조를 스트리밍 AudioClip으로 재작성. A로 1초대가 되면 필요 없어진다 — 후순위.

### D. LLM 응답 스트리밍 (제일 큰 공사, 비추)
답 텍스트가 다 오기 전에 첫 문장으로 TTS 시작. 공용 `LlmFailover`가 논스트리밍이라
백엔드 공용 코드를 건드려야 한다.

---

## 8. 한 장 요약

| 증상 | 원인 위치 | 손잡이 |
|---|---|---|
| 첫 질문 리딩이 늦다 | (거의 해결) Oracle 선합성 | `ConsultationOracle.Distribute` 끝 |
| **추가 질문 답이 늦다** | 숨길 연출이 없음 + Gemini 3~8초 | §7-A 프로바이더 교체가 정답 |
| 앞 청크만 무음 | 25초 대기 캡 초과 | `HoldChunk`의 `25f` / §7-A |
| 낭독이 느리다/톤 | 서버 스타일 프롬프트 | `tts_service.rb` `STYLE`(+`STYLE_VERSION` 올리기) |
| 같은 문장인데 또 기다림 | 캐시 미스 | `tts_service.rb` `cache_key` 확인 |
| 대기가 허전하다 | 필러 미호출 경로 | `SpeakThinkingFiller` 호출처 추가 |

---

## 9. 2026-09-05 업데이트 — 지금 실제로 돌아가는 경로

위 §1~§7은 Unity가 무대를 몰던 시절 기준이다. 지금은 **RN이 무대를 몬다**
(`prayers/src/features/counseling/flow/engine.ts` → `STAGE_SPEAK{mode:'tts'}` → Unity
`Assets/Scripts/Integration/ConsultationRemoteStage.cs` → `ConsultationVoice` → `ConsultationTts`
→ Rails `/api/v1/prayers/tts`). 말풍선도 RN(`ConsultationOverlay.tsx`)이 그린다.

이날 바꾼 것 세 가지:

1. **TTS 프로바이더 OpenAI 기본** — `saju/app/services/prayers/tts_service.rb`
   `PRAYERS_TTS_PROVIDER`(기본 `openai`, `gemini`로 되돌릴 수 있음), 모델 `gpt-4o-mini-tts`,
   보이스 `coral`(톤 프리셋별 매핑 `OPENAI_VOICES`). 실패하면 같은 문장을 Gemini로 폴백.
   같은 50자 문장 실측: Gemini 3.1-flash 4.3~4.6s → OpenAI 2.8s(20자 1.9s). 캐시 키에 프로바이더가
   들어가 Gemini 캐시와 섞이지 않는다.
2. **루프 답변을 청크 단위로 "말하는 만큼만" 보여준다** — engine.ts `onLoopResult`가 답을 통째로
   말풍선에 넣지 않고 `splitReading.ts`(첫 청크=첫 문장, 이후 ~110자)로 나눠 전부 `prefetchText`로
   예열한 뒤, 청크가 발화될 때 말풍선 텍스트를 그만큼 늘린다(`speakNextChunk`/`revealChunks`).
   그래서 "글은 떴는데 목소리는 4초 뒤" 체감이 사라진다 — 글이 빨랐던 것이지 목소리가 늦은 게 아니었다.
   새 질문을 하면 남은 청크는 즉시 펼친다(`flushAnswerWalk`).
3. **트랜스크립트가 목소리를 따라 스크롤** — `ConsultationOverlay.tsx` Transcript의
   `onContentSizeChange → scrollToEnd`. 말풍선이 자랄 때마다 끝으로 붙는다.

덤: 같은 날 상담이 "30대 무진대운"이라고 틀리게 말한 원인은 TTS가 아니라 `/api/v1/saju/luck`의
대운 나이 매김이 뒤집혀 있던 것(`saju_controller.rb` `decades_first_to_last`) — 陰男 역행 대운이
90세부터 매겨졌다. Unity는 세션당 한 번 받아 캐시하니 방을 다시 들어가야 새 값이다.
