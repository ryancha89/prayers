# 치즈 (수호신 치즈냥이) — 작업 기록

## 2026-11-01 · 1장 세트와 치즈 첫 제작

요청: 스토리 자료(1장 제작 패키지)를 읽고 방을 3D 모델링·텍스처링, 대화형 스토리로 앱에 넣기.

### 원본

`references/` — 사용자 제공 1장 제작 패키지(2026-10-31) 그대로: 공간 배치(01), 첫 만남(02), 거절 분기(03),
출근 배웅(04), 공통 동작(05) 그림, 삼면도·표정, 동작 제작표(KO md), 고정 대사·장소 CSV.
기준 우선순위(패키지 READ_ME): 몸 비율 = 삼면도, 얼굴·무늬 = 표정 그림, 시선·동작 = 동작 제작표. 카메라 = 사용자.

### 한 일 (모두 코드로 재현 가능)

- `scripts/cheese_cat.py` — 치즈. 메타볼 몸통(앉기 `sit` / 식빵 자세 `loaf`) → 메시 → 정점 색(주황 · 진한 줄무늬 ·
  크림색 턱받이/주둥이/발). 눈·눈꺼풀·코·ω 입·수염·귀·꼬리는 별도 오브젝트라 표정(`idle/blink/talk/smug`)만
  바꿔 다시 만든다.
- `scripts/build_cheese_home.py` — 거실(7×4.6m, 천장 2.5m)·현관문(복도 쪽으로 열림)·공용 복도·초인종·창(밖은 numpy로
  그린 햇빛 든 나무)·창가 원목 벤치+초록 방석·3인 소파·커피 테이블·화분(초록이)·스탠드·액자. 절차 텍스처: 원목
  마루(브릭 노드 판재+웨이브 결), 복도 타일, 패브릭(노이즈 범프), 벽 플라스터. Cycles(Metal), AgX Medium High Contrast.
  플레이어 시점 5컷(세로 1170×2080): `door`, `room`, `sofa`, `doorstep`, `nap` + 얼굴 크롭(눈 깜빡임·말하기·능청).
- `scripts/export_story_assets.py` — 렌더 → 앱 에셋(`src/features/story/assets/cheese/*.jpg`) + `plates.ts` 생성.
  얼굴 크롭 위치를 플레이트와 픽셀 비교로 ±3px 검증해 맞춘다.
- `scripts/preview_cat.py` — 정면·측면·후면·¾·얼굴 턴어라운드 (`previews/cat/`).

재생성:

```sh
B=/Applications/Blender.app/Contents/MacOS/Blender
$B -b --python-exit-code 1 --python 3d-modeling/cheese/scripts/preview_cat.py -- 3d-modeling/cheese/previews/cat sit idle
$B -b --python-exit-code 1 --python 3d-modeling/cheese/scripts/build_cheese_home.py -- 3d-modeling/cheese/output/plates   # ~15분, fast 인자 = 저해상도
python3 -I 3d-modeling/cheese/scripts/export_story_assets.py 3d-modeling/cheese/output/plates .
```

편집용 원본: `output/plates/cheese_home.blend` (소파 컷 카메라·치즈 포함).

### 렌더로 확인한 것

- 메타볼 크기: 원소의 `radius`는 보이는 반지름이 아니다. stiffness 2·threshold 0.6에서 단독 공의 표면은 반지름의
  0.574배(실측). 첫 렌더에서 몸이 조각조각 떨어진 원인. threshold 0.3 → 0.685배로 나눠서 넣는다.
  타원체 `size_x/y/z`는 반지름의 배율(절대 길이 아님), 캡슐 `size_x`는 절대 반길이.
- 정점 색 계단: 메타볼 해상도 0.007에서 턱받이·줄무늬 경계가 1170px 플레이트에서 계단처럼 보였다 → 0.0042.
- 눈: 먼 컷(소파)에서 반쯤 감은 눈꺼풀이 '감은 눈'으로 읽혀 눈과 눈동자를 키우고 눈꺼풀을 올렸다. 표정 그림의
  무거운 윗눈꺼풀 인상은 유지.
- Freestyle 외곽선(알파 .55)은 폰 크기에서 거의 보이지 않으면서 렌더를 CPU 병목으로 만들어(빠른 5컷 6분) 껐다.
- 문: 경첩이 오른쪽(x=3.35)이고 문짝이 -X로 뻗으므로 복도 쪽(-Y)으로 열리려면 +Z 회전. 처음엔 반대로 돌려 거실 쪽으로
  열린 문이 화면을 막았다. 안에서 밖을 볼 때 경첩은 화면 왼쪽에 온다(배치도와 일치).

### 아직 아닌 것

- 리그·애니메이션 없음. 앱의 움직임은 플레이트 위 얼굴 크롭 교체(깜빡임/입/능청)와 느린 줌(켄 번스)뿐이다.
  동작표의 C01~C12를 실시간으로 하려면 리그 + Unity 이식이 필요하다.
- 털 표현은 정점 색 + 약한 SSS. 털 카드/헤어 파티클은 없다.
- 후면 무늬는 참고서에서도 '검토용 초안' — 이번 렌더 컷에 뒷모습은 나오지 않는다.
- 2~7장 장소(창가 방석 장면, 비 오는 현관, 꿈속 골목, 보호소)는 미제작.
