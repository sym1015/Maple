# Maple — 메이플스토리 캐릭터 디자이너

메이플스토리 캐릭터 코디(아이템 착용, 헤어/얼굴/피부, 동작·표정, 펫, 여러 캐릭터 배치 등)를 웹에서 시뮬레이션하는 앱입니다.

## 출처 / 라이선스

이 프로젝트는 오픈소스 [crrio/maplestory.design](https://github.com/crrio/maplestory.design)
(MIT License, © 2017 Crrio) 코드를 기반으로 합니다. 원본 라이선스는 [`LICENSE`](LICENSE),
원본 README는 [`UPSTREAM_README.md`](UPSTREAM_README.md)에 그대로 보존되어 있습니다.

캐릭터/아이템 이미지는 [maplestory.io](https://maplestory.io) API에서 실시간으로 받아옵니다.
이 API가 동작하지 않으면 렌더링도 되지 않습니다.

## 실행 방법

Node.js 18 이상이 필요합니다.

```bash
npm install      # .npmrc 의 legacy-peer-deps 설정으로 구버전 의존성 충돌을 무시
npm start        # http://localhost:3000 개발 서버
npm run build    # build/ 폴더에 정적 파일 생성 (아무 정적 호스팅에 배포 가능)
```

Docker:

```bash
docker build -t maple .
docker run -p 8080:80 maple
```

## 웹사이트로 배포 (GitHub Pages)

`main` 브랜치에 코드가 들어가면 `.github/workflows/deploy.yml`이 자동으로 빌드해서
https://sym1015.github.io/Maple/ 에 올립니다. 처음 한 번만 아래 설정이 필요합니다.

1. 무료 계정이라면 **Settings → General → Danger Zone → Change visibility**에서 저장소를 Public으로 바꿉니다.
2. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 바꿉니다.
3. 이미 main에 코드가 있다면 **Actions** 탭 → *Deploy to GitHub Pages* → **Run workflow**를 누릅니다.

## 원본에서 바꾼 점

- `.npmrc` 추가 (`legacy-peer-deps=true`): 최신 npm에서 React 15 관련 peer 의존성 충돌로 설치가 실패하는 문제 해결
- `start`/`build` 스크립트에 `--openssl-legacy-provider` 추가: Node 17+ 에서 react-scripts 3 빌드가 실패하는 문제 해결
- Dockerfile 베이스 이미지 `node:8` → `node:18`

## 코드 구조

| 경로 | 역할 |
| --- | --- |
| `src/components/App` | 전체 상태 관리(캐릭터 목록, 선택, 저장) |
| `src/components/ItemListing` | 아이템 검색/카테고리 목록 |
| `src/components/EquippedItems` | 착용 중인 아이템 표시·해제 |
| `src/components/CharacterList` | 캐릭터/펫 목록 및 설정(동작, 표정, 스킨 등) |
| `src/components/RenderCanvas` | 캔버스에 캐릭터·펫 배치(드래그) |
| `src/const/localize.js` | 다국어 문자열 |
