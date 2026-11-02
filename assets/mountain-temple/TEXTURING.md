# Mountain Temple texture pass — 2026-10-30

사용자 제공 `04_ui_mockup.png`의 호박색 목재, 어두운 단청, 금장, 자주색 비단 방석을 기준으로 작업했다.

후속 불상 교체까지 반영한 최신 장면은 `mountain_temple_buddha.blend` 및 `mountain_temple_buddha.fbx`다. 국립중앙박물관 실측 데이터 사용과 별도 제작 부위는 [불상 작업 기록](../../3d-modeling/buddha/README.md)에 설명했다.

## 결과물

- `mountain_temple_textured.blend`: 텍스처를 내부에 패킹한 Blender 5.1.2 장면.
- `mountain_temple_textured.fbx`: 메시와 게임 마커, 임베드된 텍스처를 포함한 교환 파일.
- `textures-v2/`: 색상, roughness, OpenGL tangent-space normal, height PNG. 목재 2K, 일반 표면 1K.
- `previews-textured/`: 내부 전체, 내부 사선 재질 확인, 외부 렌더.
- `texture_validation.json`: 실제 장면과 렌더 결과 확인 기록.
- `texture_prompts.json`: 내장 imagegen으로 생성한 탱화·비단 원단·투명 광배의 전체 프롬프트.

원본 `.blend`, 원본 텍스처와 기존 FBX는 수정하지 않았다. 열려 있던 Blender의 미저장 상태도 `mountain_temple_working_snapshot.blend`로 복사해 보존했다. 기존 메시의 형태와 좌석 110개, 게임 마커는 유지했다. 기존에 UV가 없던 재질 적용 대상에만 평면 투영 UV를 추가했다.

## 재질

마루는 판재별 색 편차, 이음매, 결, 얕은 요철과 광택 변화를 추가했다. 기둥과 문틀은 갈색 목재에 붉은 옻칠이 남은 색으로 조정했다. 단청은 기존의 직접 그린 패턴 소스를 재사용하고 뇌록·군청·석간주·황토색의 밝기를 낮췄다. 금속에는 금박 이음선과 미세한 표면 변화를, 석재와 기와에는 거칠기와 요철을 추가했다. 방석에는 연화 당초 비단 무늬, 불단에는 새 후불탱화와 금장 광배를 적용했다.

탱화와 원단, 광배는 `image_gen.imagegen` 내장 도구로 생성했다. 생성한 세 이미지는 원본 출력 그대로 프로젝트에 복사했다. 나머지는 기존 패턴 소스와 새 NumPy/Pillow 생성 코드로 만든 재질 맵이다. 광배는 조각 형상을 표현한 투명 카드 텍스처이며 실제 조각 메시가 아니다.

조명과 AgX 색 관리, Cycles 렌더는 Blender 미리보기를 위한 설정이다. UI와 인물은 참고 이미지의 배경 설명 요소로 보고 추가하지 않았다.

## 재현

```sh
python tools/gen_mountain_temple_pbr.py
/Applications/Blender.app/Contents/MacOS/Blender \
  -b assets/mountain-temple/mountain_temple_working_snapshot.blend \
  --python tools/blender/texture_mountain_temple.py
```

첫 명령은 NumPy와 Pillow가 필요하다. 생성형 이미지 세 개는 `textures-v2/`에 유지하며, 재현 스크립트가 덮어쓰지 않는다. 빠른 내부 확인은 두 번째 명령 끝에 `-- preview`를 붙인다. 항상 작업 복사본 또는 원본을 입력으로 사용한다.

Blender 5의 컴포지터는 `scene.compositing_node_group`과 Group Output을 사용한다. [공식 마이그레이션 문서](https://developer.blender.org/docs/release_notes/5.0/migration/compositor_migration/)를 따라 구성했다.

## 런타임 범위

FBX는 Blender의 셰이더와 조명을 완전히 옮기지 않는다. Unity 등에서는 `TEMPLE_*` 이름에 맞춰 색상·roughness·normal 맵을 연결하고 roughness를 smoothness로 변환한다. 색상은 sRGB, roughness/height는 linear, normal은 Normal Map으로 가져온다. 광배·창호·나뭇잎에는 alpha cutout 또는 적절한 투명 셰이더가 필요하다. 코트·시어·컴포지터는 엔진에서 별도 설정한다. 모바일 성능 및 실제 앱 내 표현은 이번 작업의 검증 범위에 포함하지 않았다.
