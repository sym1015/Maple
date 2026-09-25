# Maple Character Designer

웹에서 메이플스토리 스타일 2D 캐릭터를 꾸며 보는 개인용 코디 도구입니다.
아이템 데이터는 `maplestory.io` API에서 **내 컴퓨터로 직접 수집**해서 사용합니다.

> 진행 상황: Step 1~11 완료 (에셋 수집기, 아이템 목록, 캐릭터 상태, 저장/불러오기,
> 캐릭터 미리보기, PNG 저장). 전체 검색, 성능 최적화, 테스트 정리는 다음 단계입니다.

## 요구 사항

- Node.js **22 이상** (Vite 8 기준 20.19 이상도 가능)
- 인터넷 연결 (에셋 수집 시에만)

## 빠른 시작

```bash
npm install
cp .env.example .env          # Windows: copy .env.example .env
npm run assets:test           # API 연결 확인
npm run assets:collect        # 아이템 데이터·아이콘 수집 (처음엔 오래 걸립니다)
npm run dev                   # http://localhost:5173
```

처음에는 일부만 받아 보는 것을 추천합니다.

```bash
npm run assets:collect -- --category=hat --limit=50
```

## 명령어

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 후 `dist/`에 빌드. 수집한 `data/`, `assets/`도 함께 복사됩니다 |
| `npm run preview` | 빌드 결과 미리보기 |
| `npm run typecheck` | 앱 타입 검사 |
| `npm run assets:test` | API 엔드포인트 점검 (URL, HTTP 상태, 응답 필드, 샘플 출력) |
| `npm run assets:inspect` | 부품 이미지·레이어 순서(zmap)·캐릭터 렌더 주소의 실제 구조 출력 |
| `npm run assets:collect` | 아이템 메타데이터·아이콘 수집 |
| `npm run assets:typecheck` | 수집기 타입 검사 |

`assets:collect` 옵션:

| 옵션 | 예시 | 설명 |
| --- | --- | --- |
| `--category=` | `--category=hat` | 해당 카테고리만 |
| `--id=` | `--id=1302000` 또는 `--id=1,2,3` | 특정 아이템만 |
| `--limit=` | `--limit=10` | 앞에서부터 N개만 |
| `--dry-run` | | 다운로드·파일 쓰기 없이 대상만 출력 |

## 환경변수 (`.env`)

| 이름 | 기본값 | 설명 |
| --- | --- | --- |
| `MAPLE_API_BASE` | `https://maplestory.io/api` | API 주소 |
| `MAPLE_REGION` | `gms` | 지역 (`kms` 등) |
| `MAPLE_VERSION` | `latest` | 게임 버전. `latest`면 `/wz` 목록에서 실제 최신 숫자 버전을 찾아 씁니다 (API가 `latest` 별칭에 404를 주기 때문) |
| `ASSET_CONCURRENCY` | `3` | 동시 요청 수 |
| `ASSET_DELAY_MS` | `150` | 요청 사이 대기 (여기에 0~100ms 무작위 추가) |
| `ASSET_RETRIES` | `3` | 재시도 횟수 (네트워크 오류, 429, 5xx만. 지수 백오프) |
| `ASSET_TIMEOUT_MS` | `30000` | 요청 제한 시간 |

`.env`는 git에 올라가지 않습니다.

## 수집 결과 저장 위치

```text
assets/items/{category}/{itemId}.png   아이콘 (이미 있으면 다시 받지 않음)
assets/renders/{지역-버전}/…png         캐릭터 렌더 캐시
data/items/{category}.json             카테고리별 아이템 (화면에서 필요할 때만 불러옴)
data/items.json                        전체 아이템
data/categories.json                   카테고리별 개수
data/manifest.json                     버전, 생성 시각, 성공/실패 통계
data/download-failures.json            실패 목록 (URL, HTTP 상태, 시도 횟수)
data/raw/item-category.json            API 카테고리 원본 (매핑 점검용)
```

아이템 JSON 구조 (`src/types/item.ts`):

```json
{
  "1302000": {
    "id": 1302000,
    "name": "Sword",
    "category": "weapon",
    "subCategory": "One-Handed Sword",
    "icon": "assets/items/weapon/1302000.png"
  }
}
```

API 카테고리를 화면 카테고리로 바꾸는 규칙은 `scripts/asset-collector/category-map.ts`에 있습니다.
목록에 없는 값은 `etc`로 분류하고 수집 로그에 `(미매핑)`으로 표시합니다.

## 캐릭터 상태

```ts
interface CharacterState {
  equipment: {
    body?: number; face?: number; hair?: number;
    hat?: number; faceAccessory?: number; eyeAccessory?: number; earrings?: number;
    top?: number; bottom?: number; overall?: number;
    shoes?: number; gloves?: number; cape?: number;
    weapon?: number; shield?: number;
    ring?: number; medal?: number; pendant?: number;
  };
}
```

- 아이템을 누르면 장착, 같은 아이템을 다시 누르면 해제됩니다. 착용 목록의 **해제** 버튼으로도 뺄 수 있습니다.
- 한벌옷을 입으면 상의·하의가 빠지고, 상의나 하의를 입으면 한벌옷이 빠집니다.
- 현재 상태는 브라우저 `localStorage`의 `maple-character-state`에 자동 저장됩니다.
- **저장/불러오기**는 별도 보관 칸(`maple-character-saved`)을 씁니다.
- **JSON 내보내기/가져오기** 파일 형식:

```json
{ "version": 1, "equipment": { "hair": 30000, "face": 20000, "weapon": 1302000 } }
```

## 캐릭터 미리보기와 PNG 저장

캐릭터 그림은 API 서버가 게임의 레이어 순서(zmap)대로 합성한 이미지를 씁니다.

```text
브라우저 → /render/character/{스킨}/{아이템,…}/{동작}/{프레임}.png   (내 PC의 개발 서버)
         → ${MAPLE_API_BASE}/{지역}/{버전}/Character/{스킨}/{아이템,…}/{동작}/{프레임}
```

- **왜 중계하나요?** API 응답에 CORS 허용 헤더가 없어서 브라우저가 직접 받아 PNG로 저장할 수 없습니다.
  개발 서버(`npm run dev`, `npm run preview`)가 대신 받아서 같은 주소로 전달합니다.
- 한 번 받은 조합은 `assets/renders/`에 저장해 두고 다시 요청하지 않습니다 (git 제외).
- 지역·버전은 수집 때 만든 `data/manifest.json`을 따르므로, 수집한 아이템과 항상 같은 버전으로 그려집니다.
- 숫자로 된 아이템 ID와 영문 동작 이름만 받습니다. 다른 주소로 요청을 보내는 데 쓸 수 없습니다.
- 동시에 API로 보내는 요청은 2개까지이고, 같은 요청이 겹치면 한 번만 보냅니다.
- 클릭을 빠르게 이어서 해도, 마지막 상태로 0.3초 뒤에 한 번만 그립니다.
- **PNG 저장**은 이 이미지를 배율 1x/2x/4x로 키워 저장합니다.
- **GitHub Pages 같은 정적 사이트에서는 중계 서버가 없어 캐릭터 그림이 나오지 않습니다.** 내 PC에서 `npm run dev`로 사용하세요.

**직접 레이어를 겹치지 않는 이유:** 아이템(헤어·얼굴·옷·무기)은 `/item/{id}`에 부품 이미지와 기준점이
있지만, 몸통·머리(스킨)는 `/item/2000`, `/item/12000`이 빈 응답을 줘서 기준점(`navel`, `neck`, `brow`)을
얻을 수 없습니다(`npm run assets:inspect`로 확인). 좌표를 추측하지 않으려고 서버 합성을 씁니다.
`src/lib/renderer.ts`는 레이어 목록을 받아 그리는 구조라, 스킨 데이터를 구하면 직접 합성으로 바꿀 수 있습니다.

피부(`body`)는 목록에 머리 ID(예: 12000)로 나오며, 렌더 주소에는 `머리 ID − 10000`(예: 2000)을 스킨 ID로 씁니다.

## 폴더 구조

```text
src/
  components/  CharacterDesigner, CharacterPreview, CategoryList, ItemGrid, SearchBar
  hooks/       useCharacter.ts
  lib/         mapleApi.ts (로컬 데이터 로더), storage.ts, categories.ts,
               characterRender.ts (렌더 주소), renderer.ts (캔버스 합성·PNG)
  types/       item.ts, character.ts
scripts/asset-collector/
  config.ts, http.ts (타임아웃·재시도), pool.ts (동시성 제한), api.ts,
  category-map.ts, collect.ts, test-api.ts, inspect-sprites.ts
scripts/render-proxy.ts   개발 서버용 캐릭터 렌더 중계 + 캐시
```

## 권리 및 주의 사항

- 수집한 이미지와 아이템 정보는 **넥슨(NEXON)의 저작물**입니다.
- 그래서 `assets/items/`와 `data/` 수집 결과는 `.gitignore`로 **저장소에 올리지 않습니다.** 개인적으로 내 컴퓨터에서만 사용하세요.
- 수집 결과를 포함해 배포하거나 공개하려면 권리 관계를 먼저 확인해야 합니다.
- `main` 브랜치는 GitHub Pages로 자동 배포되지만, 수집 데이터가 없으므로 공개 사이트에는 "아이템 데이터가 없습니다" 안내만 나옵니다.
- API 서버에 부담을 주지 않도록 동시 요청 수와 대기 시간을 지켜 주세요.
