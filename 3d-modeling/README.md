# 3D 모델링 작업실

캐릭터·소품 모델링과 재사용 가능한 제작 노하우를 이 폴더에 축적한다.

- `knowledge/`: 공식 자료에서 확인한 방법, Blender 실험 결과, 실패 원인과 해결책.
- `common/`: 재사용하는 Blender 메시 제작 함수.
- `luna/references/`: 사용자 원본 디자인.
- `luna/source/`: 수정 전 모델과 텍스처.
- `luna/scripts/`: 재현 가능한 제작·검증 스크립트.
- `luna/output/`: 개선 모델과 검증 보고서.
- `luna/previews/`: 정면·측면·후면·얼굴 렌더.
- `luna/WORKLOG.md`: 변경 이유, 확인 결과, 남은 과제.

공식 설명과 직접 검증한 결과를 구분한다. 수정할 때마다 작업 기록에 원인 → 조치 → 렌더/검증 → 남은 문제를 추가한다. 런타임 에셋에 반영하기 전까지 작업 결과는 이곳에서 관리한다.

시작점: [Tripo에서 참고한 제작 흐름](knowledge/tripo-workflow.md), [Blender 실험 노하우](knowledge/blender-character-notes.md), [루나 작업 기록](luna/WORKLOG.md).

## 루나 결과물

- 편집용 원본: `luna/output/luna_refined.blend`
- 게임용 Blender: `luna/output/mobile/luna_mobile.blend`
- Unity용 모델: `luna/output/mobile/Luna_Avatar.fbx`, 원거리 대안 `Luna_LOD1.fbx`
- 함께 가져갈 이미지: `luna/output/mobile/textures/`
- 실제 FBX 재수입·애니메이션 검사: `luna/output/mobile/verification.json`
- 폴리곤·렌더러·텍스처 수치: `luna/output/mobile/metrics.json`
- 최신 게임용 렌더: `luna/previews/mobile/`

저장된 파일을 명시적으로 다시 열어 후면을 확인하려면:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --python 3d-modeling/luna/scripts/show_luna.py
```

재생성 순서: `refine_luna.py` → `optimize_luna.py` → `verify_mobile.py`. 백그라운드 실행에는 `-b --python-exit-code 1 --python <스크립트>`를 사용한다. 검사 스크립트는 연결된 Unity 프로젝트의 f_char_003 애니메이션 폴더를 읽는다. Unity 씬과 iPhone 시뮬레이터 앱 반영 기록은 `luna/output/integration/`에 있다. LOD1 자동 전환과 실기기 FPS 측정은 별도 단계다.
