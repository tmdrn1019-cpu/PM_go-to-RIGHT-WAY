# 시간제 동적 PM 주차존

상품 소개, 큰 지도 서비스, 시민용 모바일 웹을 하나의 React/Express 앱으로 제공합니다. 보행량과 주차 후 유효폭에 따른 주차존 판정 엔진을 사용합니다.

## 화면

| 주소 | 구성 |
| --- | --- |
| `/` | 상품 소개, 운영 방식 설명 그림, 페이지 중간의 서비스 시작 버튼 |
| `/service` | 화면을 채우는 지도, 검색·필터·상태 레이어, 주차존 상세와 운영 정보 |
| `/mobile` | 시민용 지도, 하단 탐색 패널, 내 위치와 이동 미션 안내 |

좁은 화면에서는 `/service`도 모바일 배치로 전환됩니다. 등록된 실제 운영 자료가 없으면 연결 준비 상태를 표시하며, 합성 주차존으로 채우지 않습니다. 실제 계정·기기 연결이 없는 현재 버전에서는 미션 수락·잠금 해제·사진 전송·포인트 지급을 활성화하지 않습니다.

## 실행

Node.js 24 이상과 npm이 필요합니다. 프로젝트 폴더에서 실행하세요.

지도에는 **견인 분석**, **PM 위치** 탭도 있습니다. 견인 분석은 서울시 실제 이력을 주소별로 집계한 참고 자료입니다. `npm run sync:towing`으로 2025년 신고 이력을 날짜별로 수집하고 관악구의 조치 완료 이력을 `data/towing-areas.json`에 원자적으로 저장합니다. 파일은 Git에서 제외됩니다. SGIS 주소 변환 후 정확히 일치한 주소는 견인 건수에 따른 원형 표식으로 표시합니다. 실제 견인 위치나 법적 금지 경계는 아닙니다.

PM 위치 조회는 `.env.local`의 `TAGO_SERVICE_KEY`를 서버에서 사용합니다. 기본 대상은 서울이며, TAGO가 제공하지 않으면 **관악구 위치정보 미지원**을 표시합니다. 지원 지역 버튼을 선택하면 그 지역의 실제 기기를 지도와 목록에서 볼 수 있습니다. 원자료에 기기 관측 시각이 없어 화면의 수집 시각을 실제 관측 시각으로 취급하지 않습니다. 1회 최대 1,000대와 부분 조회 여부를 표시하고 1분 캐시·동시 요청 병합·오류 재시도 제한을 적용합니다. 기기 조회가 기기 이동 허가나 잠금 해제를 뜻하지는 않습니다.

```powershell
npm ci
npm run dev
```

개발 주소는 [http://127.0.0.1:5173](http://127.0.0.1:5173)입니다. API가 같은 개발 서버에 연결됩니다.

빌드 결과를 실행하려면:

```powershell
npm run build
npm start
```

빌드 주소는 [http://127.0.0.1:3001](http://127.0.0.1:3001)입니다. `PORT` 환경변수로 포트를 변경할 수 있습니다. 종료는 실행 터미널의 `Ctrl+C`입니다.

서버는 로컬 주소에 바인딩합니다. 실제 휴대폰에서는 PC의 localhost 주소에 접속할 수 없으므로, 실제 기기 검증에는 HTTPS 배포 주소 또는 승인된 HTTPS 개발 접근 환경이 필요합니다. 외부 배포는 아래 "외부 배포"를 따릅니다.

## 외부 배포

### Vercel

현재 배포: [상품 소개](https://pm-go-to-right-way.vercel.app) · [지도 서비스](https://pm-go-to-right-way.vercel.app/service) · [모바일 시연](https://pm-go-to-right-way.vercel.app/mobile).

`vercel.json`은 Vite 화면을 정적 제공하고 `api/index.mjs`에서 기존 Express 조회·시연 API를 실행합니다. 보안 헤더와 `/service`, `/mobile` 직접 접속도 설정합니다.

```powershell
npx vercel login
npx vercel --prod
```

프로젝트 연결 후 Vercel의 **Settings → Environment Variables**에서 `DEMO_PUBLIC_HOST`를 실제 서비스 호스트(예: `pm-zones.vercel.app`, `https://` 없이)로 지정하고 다시 배포하면 모바일 시연 API가 그 호스트에서 열립니다. 필요하면 `SEOUL_OPEN_DATA_KEY`, `TAGO_SERVICE_KEY`도 서버 환경변수로 등록합니다. `.env.local`은 업로드하지 않습니다.

`.vercelignore`는 원자료와 기존 시연 DB를 제외하고, `data/`에서 `public-zones.json`, `towing-areas.json`, `towing-geocodes.json`, `sdot-sensors.json`만 업로드합니다. 이 네 파일은 함수에만 포함하며 정적 URL로 제공하지 않습니다. 파일은 Git에서 제외되므로 가공 데이터가 있는 로컬 폴더에서 CLI로 배포하세요. 자료 없는 배포가 운영을 덮지 않도록 `vercel.json`의 `git.deploymentEnabled.main: false`로 `main` 자동 배포를 껐습니다(PR 미리보기 배포는 유지). `main`에 머지한 뒤에는 이 폴더에서 `npx vercel --prod`로 운영에 반영합니다. Git 자동 배포를 다시 쓰려면 별도 비공개 데이터 공급 절차가 필요합니다.

**Vercel 모바일 시연의 한계:** 시연 SQLite는 `/tmp/pm-demo.sqlite`에 저장합니다. 서버 인스턴스 교체·재배포 시 초기화되며, 인스턴스가 여러 개면 시연 상태가 서로 다를 수 있습니다. 같은 인스턴스를 쓰는 방문자는 합성 시연 상태를 공유합니다. 연속 시연과 영구 상태 보존이 필요하면 공유 저장소를 연결해야 합니다. 실제 기기·계정·포인트는 연결하지 않습니다.

### Render

`render.yaml`은 GitHub 저장소를 [Render](https://render.com) Node 웹 서비스로 배포하는 설정입니다. `data/`는 git에 올리지 않으므로 서버 실행에 필요한 가공 파일을 Render **Secret Files**로 따로 올립니다.

1. Render에서 GitHub 저장소를 연결하고 **New → Blueprint**로 `render.yaml`을 선택합니다(배포할 브랜치를 고릅니다).
2. 서비스의 **Environment → Secret Files**에 로컬 `data/`의 `public-zones.json`, `towing-areas.json`, `towing-geocodes.json`, `sdot-sensors.json`을 같은 이름으로 올립니다. 빌드가 `/etc/secrets/*.json`을 `data/`로 복사합니다.
3. 첫 배포 주소(예: `pm-zones.onrender.com`)를 `DEMO_PUBLIC_HOST`에 넣고 다시 배포하면 `/mobile` 시연 API가 그 주소에서만 열립니다. 비워 두면 시연 API는 로컬 전용(403)입니다.
4. 필요하면 `SEOUL_OPEN_DATA_KEY`, `TAGO_SERVICE_KEY` 등을 환경변수로 넣습니다. 키를 저장소에 넣지 않습니다.

`HOST=0.0.0.0`은 배포 환경에서만 씁니다. 무료 플랜 디스크는 재시작 때 초기화되므로 시연 상태(`data/demo.sqlite`)도 처음으로 돌아갑니다. 시연 API는 인증 없이 누구나 쓸 수 있는 합성 자료 시연이며 실제 기기·계정과 연결되지 않습니다.

## 운영 데이터 연결

서울시 공식 주차구역·S-DoT 조회 연결도 제공합니다. [설정 안내](docs/seoul-data.md)에 따라 `.env.local`의 `SEOUL_OPEN_DATA_KEY`를 설정한 뒤 서버를 재시작하고 지도 화면의 **공공데이터** 탭을 여세요. 키가 없으면 연결 준비 상태이며 실제 자료를 합성하지 않습니다. 이 두 공식 응답에는 좌표·주차 경계가 없어 공공 목록 조회만으로 지도 마커나 반납 가능 상태를 만들지 않습니다.

동적 주차존을 판정할 현장 측정·운영사 자료는 아직 제공되지 않았습니다. 기본 실행은 원자료를 임의로 생성하지 않습니다. 수집기가 만드는 데이터 파일을 연결할 수 있는 읽기 전용 경계를 구현했습니다.

```powershell
$env:SERVICE_DATA_FILE = 'C:/pm-private/service-feed.json'
npm start
```

이 변수는 개발 실행에도 동일하게 사용할 수 있습니다. 새 변수는 서버 시작 전에 설정하세요. 일반 `.env` 파일은 자동으로 읽지 않습니다.

데이터 계약은 [docs/service-data.md](docs/service-data.md)를 따릅니다. 원자료는 `public/`, `dist/` 등 정적 제공 위치에 저장하지 마세요. 개발 서버는 `data/`, `.superpowers/`, `private/`와 지정한 원자료 파일의 직접 접근을 차단하고 public 디렉터리 자동 제공도 끕니다.

- `GET /api/service/state`는 현재 서버 시각으로 운영 데이터를 검증·판정합니다. 공개 필드만 반환하며 원자료의 임의 필드는 전달하지 않습니다.
- 화면은 보이는 동안 15초마다 다시 조회합니다. 원자료의 갱신 시각은 화면 조회 시각과 별도로 표시합니다.
- 관측·재고·예정 운영 변경의 가장 빠른 만료 시점이 지나면 이전 주차 가능 표시를 보류합니다. 요청은 10초로 제한하며 탭 복귀 시 다시 확인합니다.
- 공간 승인, 적용 가능한 LOS 프로필, 최신 보행 관측과 재고가 확인되지 않으면 주차 가능으로 표시하지 않습니다.
- 킥보드·전기자전거를 함께 허용하는 존은 공통 수용량이 두 종류 모두에 보수적으로 유효하다는 확인이 필요합니다. 기기 점유 공간을 같다고 가정하지 않습니다.

## 지도와 위치

견인 분석 주소의 SGIS 좌표 변환은 [설정·수집 안내](docs/sgis-geocoding.md)를 따릅니다. `.env.local`에 `SGIS_SERVICE_ID`, `SGIS_SECURITY_KEY`를 추가하고 `npm run geocode:towing`을 실행하면 견인 분석 탭에서 확인된 주소를 지도에 표시합니다.

지도는 Leaflet/OpenStreetMap을 사용합니다. `네이버 지도처럼`이라는 요구는 큰 지도와 탐색 패널 형태로 반영했으며 NAVER Maps API는 아직 연결하지 않았습니다.

내 위치는 버튼을 누르고 안내에 동의한 뒤에만 요청합니다. 정확한 GPS 좌표는 현재 앱 서버로 보내지 않습니다. 다만 그 위치로 지도를 이동하면 지도 제공자에게 주변 지역을 식별할 수 있는 타일 요청이 전달됩니다. 권한을 거절해도 검색·지도 이동은 계속 이용할 수 있습니다.

OSM 타일은 [공식 이용 정책](https://operations.osmfoundation.org/policies/tiles/)에 맞는 URL과 참조자 헤더를 사용합니다. 공개 상용 운영의 지도 공급자·사용 조건·트래픽 대응은 별도로 확정해야 합니다. 기본 테마의 Figtree는 Google Fonts에서 요청하며, 외부 연결 실패 시 시스템 폰트로 표시됩니다.

## 검증과 코드

```powershell
npm test
npm run build
npx astryx doctor --built dist
```

| 코드 | 역할 |
| --- | --- |
| `server/engine.mjs` | LOS, 유효폭, 운영시간, 예고 배치와 다음 예정 변경 |
| `server/service-feed.mjs` | 운영 입력 검증, 최신성 확인, 공개 결과 구성 |
| `server/service-app.mjs` | 현재 실행되는 읽기 전용 서비스 API |
| `src/LandingPage.jsx` | 상품 소개와 서비스 진입 |
| `src/MapWorkspace.jsx`, `src/ZoneMap.jsx` | 데스크톱·모바일 지도 탐색 |
| `src/useServiceData.js`, `src/service-client.mjs` | 조회·타임아웃·만료·복귀 처리 |
| `server/seoul-data.mjs`, `src/PublicDataPanel.jsx` | 서울시 공식 API 수집·캐시와 공공데이터 조회 |

시연은 두 화면으로 나뉩니다. **`/mobile`** 은 시민 앱 시연입니다. 내 위치(브라우저에서만 사용) 또는 시연 위치(신림역·봉천동 주변) 반경 500m의 합성 킥보드를 보여 주고, 실제 2025 견인 다발 지점(시연 가정 반경 30m) 안 기기마다 그 주소의 실제 견인 사유(횡단보도 3m, 정류소 5m, 차도, 보호구역 등)를 붙여 "미션 가능"을 표시합니다. 킥보드 선택 → 모의 잠금 해제 → 사유에 맞게 끌고 이동(횡단보도·정류소 등은 규정 거리+10m인 13~15m, 보호구역은 운영사 수거 대상이지만 원하면 가장 가까운 지정 PM 주차구역까지 430~490m, 이동 화면은 실제 건물이 보이는 3D 지도) → 휴대폰 카메라로 주차 사진 촬영(사진은 브라우저 미리보기에만 쓰고 서버로 보내지 않음) → 모의 정주차 판정 → 시연 포인트 순서로 진행하며, 구역 밖 목적지는 정원·보행량을 확인하지 않습니다. 잠금 실패·경로 이탈·시계 진행·초기화는 "시연 도구"에 있습니다. **`/service`** 는 웹 지도로, 2025 서울 견인 다발 지점 옆 서울시 지정 PM 주차구역 20곳을 인근 지하철역이 붐비는 시간대에 축소·폐쇄하는 판정을 빠른 시계(기본 1초=10분)로 보여 줍니다(`GET /api/zones?at=`, 만드는 법은 [docs/public-zones.md](docs/public-zones.md)). 시연 API(`/api/demo/state`, `/api/demo/command`)는 로컬 호스트와 같은 출처 요청만 받고, 상태는 `data/demo.sqlite`(또는 `DEMO_DATA_FILE`)에 저장되며 "시연 초기화"로만 처음 상태로 되돌립니다. 실제 기기·계정·포인트와는 연결되지 않습니다.

서울시 공공 API는 인증키 설정 후 서버에서 수집합니다. 실제 운영용 15분 보행량·현장 경계·유효폭·재고 결합, 운영사 연동, 시민 계정·이동 자격, 사진 검수, 실제 보상은 후속 범위입니다. 현재 화면과 읽기 전용 조회 경계를 실제 기기 이동 서비스 전체의 완료로 취급하지 마세요.
