# 산사 불상 재제작

2026-10-30. 기존 메타볼 불상의 불분명한 얼굴·손·법의를 교체했다.

## 결과물

- `../../assets/mountain-temple/mountain_temple_buddha.blend`: 텍스처를 패킹한 전체 사찰 장면. `Buddha_Study` 장면에서 불상만 중립 조명으로 볼 수 있다.
- `../../assets/mountain-temple/mountain_temple_buddha.fbx`: 전체 사찰 메시와 게임 마커의 교환 파일.
- `previews/buddha_front.png`, `buddha_three_quarter.png`, `buddha_side.png`, `buddha_back.png`, `buddha_face.png`: 독립 조명에서의 형태 확인.
- `previews/hall_texture_detail.png`, `hall_interior.png`: 실제 불단 배치 확인.
- `output/validation.json`: 입력 파일 해시, 결과 수치, 좌석 보존 및 검증 범위.

## 실측 데이터와 출처 표시

본 작업은 **국립중앙박물관**이 공공누리 제1유형(출처표시)으로 개방한 **철제여래좌상, 본관5191, bon005191**의 3D 데이터를 이용했다. 조형의 기본 형상은 직접 처음부터 조각한 것이 아닌 박물관의 실측 메시다. 이후 손·백호·받침, 표면과 배치를 별도로 수정했다.

- [소장품 설명: 철제여래좌상 및 여진비](https://www.museum.go.kr/MUSEUM/contents/M0502000000.do?relicId=510&schM=view&searchId=search)
- [공식 3D 데이터 목록과 이용 안내](https://www.museum.go.kr/MUSEUM/contents/M0505000000.do)
- [공식 공개 다운로드](https://www.museum.go.kr/afile/fileDownloadById/34908)
- [공공누리 제1유형](https://www.kogl.or.kr/info/licenseType1.do)

원본 ZIP은 `references/nmk_iron_buddha_3d.zip`, OBJ/MTL은 `source/`에 보존했다. 공개 이미지 `references/nmk_iron_buddha.jpg`도 국립중앙박물관 자료다. `references/seokguram_visitkorea.jpg`는 한국관광공사 VisitKorea에 수록된 국가유산청 출처 사진으로, 얼굴 비례 확인에만 사용했고 재질에 넣지 않았다. [사진이 수록된 공식 소개](https://english.visitkorea.or.kr/svc/contents/contentsView.do?vcontsId=94436)

## 확인한 형식과 해석

박물관은 원 유물을 나발, 넓은 육계, 삼도, 오른쪽 어깨를 드러내는 법의, 유실된 양손으로 설명한다. 새 작업은 이 실측 형상을 바탕으로 금장 재질을 입히고 유실된 손을 별도로 조형했다.

오른손을 무릎 아래로 내리는 항마촉지인과 왼손을 무릎 위에 올리는 좌불상 형식은 [합천 청량사 석조여래좌상 해설](https://dh.aks.ac.kr/~heritage/wiki/index.php/합천_청량사_석조여래좌상)을 참고했다. 손의 구체적인 크기와 연결 형상, 금장, 백호 상감과 연화좌는 장면에 맞춘 해석적 재구성이며, 원 유물의 고증 복원품이라고 주장하지 않는다.

## 작업과 검증

스캔의 중복 정점을 접합하고 몸통 표면을 약하게 다듬었으며 작은 열린 경계 일부를 막았다. 머리·얼굴의 형상을 보존하고, 별도로 만든 손을 실제 손목 단부에 연결했다. 두 줄의 얇은 연꽃잎과 회전 단면 받침을 만들었다. 불신 높이는 2.12m이며, 기존 닫집이 머리를 가리는 문제를 해결하도록 닫집을 0.50m 높였다. 원본 사찰과 직전 텍스처 작업본은 보존했다.

재현 명령:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  -b assets/mountain-temple/mountain_temple_textured.blend \
  --python-exit-code 1 --python 3d-modeling/buddha/scripts/rebuild_buddha.py
```

Blender 5.1.2, Cycles 정지 렌더 기준. 모바일 런타임 성능, 게임 내 PBR 표현 또는 역사적 실물 복제 정확도는 검증하지 않았다.

주변 사찰의 탱화·광배·방석 텍스처는 앞선 작업에서 내장 `image_gen.imagegen` 도구로 생성했다. [텍스처 작업 기록](../../assets/mountain-temple/TEXTURING.md)과 [전체 생성 프롬프트](../../assets/mountain-temple/texture_prompts.json)를 함께 보존했다.
