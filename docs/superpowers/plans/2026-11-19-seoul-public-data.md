# Seoul Public Data Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 인증키 발급 전에도 서울시 공식 API 연결 코드와 설정을 갖추고, 키 설정 후 실제 주차구역·S-DoT 관측을 조회한다.
**Architecture:** 기존 운영 판정 API와 별도의 읽기 전용 공공데이터 조회를 제공한다. 서버에서만 공식 API를 호출하고 메모리 캐시·동시 요청 병합·시간 제한을 적용한다. 지도 탐색 패널에서 출처, 수집 시각, 실제 관측 시각과 조회 범위를 제공한다.
**Tech Stack:** 기존 Node 24, Express, React, Astryx와 node:test. 새 의존성 없음.
**Spec:** `docs/superpowers/specs/2026-11-19-service-product-design.md`. 사용자가 후속 단계로 실제 데이터 연결을 선택하고, 인증키가 없으므로 API 연결 구현·설정 안내부터 요청했다.

## Global Constraints
- 공식 `parkingKickboard`, `sDoTPeople`만 사용한다. 키가 없으면 외부 호출과 sample 자동 대입을 하지 않는다.
- 두 API 모두 좌표가 없다. 주소나 행정구역으로 임의 마커·주차 경계를 만들지 않는다.
- S-DoT는 10분 관측이다. 15분 실측으로 환산하거나 운영 승인·재고·LOS 입력으로 자동 사용하지 않는다.
- 키는 서버의 `SEOUL_OPEN_DATA_KEY`와 `.env.local`에만 둔다. 응답·로그·클라이언트 번들·커밋에 넣지 않는다.
- 공식 API는 HTTP 8088을 안내하며 HTTPS 8088은 TLS 연결 오류였다. 제공자 경로의 평문 전송 한계를 설정 문서에 기록한다.
- 주차구역은 24시간, 보행 관측은 10분마다 캐시 만료 후 재수집한다. 실패는 1분 후 재시도한다. 브라우저 조회가 원본 API 호출량을 늘리지 않게 한다.
- 보행 자료는 1회 최대 1,000행의 조회 범위를 표시하고, 그 범위에서 센서별 최신 관측만 고른다. 전체 센서를 모두 조회했다고 주장하지 않는다.
- 기존 운영 조회·미션 비활성·시연 데이터 분리·개인정보 차단을 유지한다.

## Review Focus
- 키·원본 오류 메시지·API URL이 공개 응답 또는 번들로 새지 않는가.
- 요청 폭주·중복 새로고침이 외부 API 호출 폭주를 만들지 않는가.
- 빈 문자열, 잘못된 시각·인원수, 중복 주차 ID와 초과 응답 크기를 거절하는가.
- 수집 성공 시각과 과거 관측 시각을 혼동하지 않는가.
- 한 API 장애가 다른 자료 또는 기존 운영 판정 API를 막지 않는가.

## Task 1: 공식 API 수집과 서버 설정
Files: `server/seoul-data.mjs`, `server/service-app.mjs`, `.gitignore`, `.env.example`, `package.json`, `tests/seoul-data.test.mjs`.
Interfaces: `normalizeParking(rows)`, `normalizePedestrians(rows)`, `createSeoulData({apiKey, fetchImpl, now})` -> async state reader; `GET /api/public-data`.
- [x] 실패 테스트 작성: 미설정 무호출, 정상 정규화와 원본 필드 차단, 한국 시각, 센서별 최신값, 캐시/동시 요청 병합, 독립 장애, 응답 크기와 오류 차단.
- [x] `node --test tests/seoul-data.test.mjs`의 RED 확인.
- [x] 공식 필드만 정규화, 5초 제한/2MiB 상한, 원본 결과 코드 검사, 캐시와 읽기 API 구현. Node의 env-file 로더로 `.env.local`을 개발/빌드 실행에서 읽는다.
- [x] 같은 테스트 GREEN 확인. 실제 인증키 없이 공식 sample 응답으로 필드·연결만 점검하되 앱 기본값에는 넣지 않는다.

## Task 2: 조회 패널·안내·검증
Files: `src/service-client.mjs`, `src/PublicDataPanel.jsx`, `src/MapWorkspace.jsx`, `tests/service-client.test.mjs`, `README.md`, `AGENTS.md`, `docs/seoul-data.md`.
- [x] 공개 응답 검증의 실패 테스트 작성과 RED 확인.
- [x] 기존 10초 조회 취소를 재사용하고 공공데이터 패널 추가: 출처, 자료별 상태·수집 시각, 10분 관측 시각, 검색, 부분 조회 범위, 새로고침.
- [x] 키 발급/서버 설정/공식 HTTP 전송/좌표·경계·재고·관측 지연 한계 문서화.
- [x] `npm test`, `npm run build`, `npx astryx doctor --built dist`, 브라우저 미연결/검색·종류 전환·모바일 배치 확인.
- [x] 코드 검토와 중요한 결함의 RED→GREEN 수정. 별도 검토자 실행은 크레딧 한도로 실패하여 자체 검토로 진행했음을 기록.

## Progress
- 기존 설계의 공공데이터 연결 범위를 구현한다. 사용자의 API 연결·설정 안내 요청에 따라 추가 승인 없이 진행한다. 외부 키 발급·유료 서비스 신청·PR 병합·새 변경 push는 수행하지 않는다.
- 공식 문서 확인: [주차구역](https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-21710&srvType=A), [실시간 S-DoT](https://data.seoul.go.kr/dataList/openApiView.do?infId=OA-22832&srvType=A), [Open API 이용 안내](https://data.seoul.go.kr/together/guide/useGuide.do).
- 수집기와 공개 클라이언트는 없는 모듈/내보내기로 RED 확인 후 구현했다. 키 미설정 무호출, 자료별 캐시·동시 요청 병합·독립 장애·한국 시각·센서별 최신값·부분 조회·수집 실패 시 이전 자료 미재사용을 검증했다.
- 공식 sample 요청은 두 서비스 모두 HTTP 200/INFO-000, 5행 정규화 성공. 총 행 수는 주차구역 329, S-DoT 165550. S-DoT sample 관측 시각은 2026-11-17T07:38:00Z였으며 현재 관측이라고 표시하지 않는다. 앱에 저장/자동 대입하지 않았다.
- Final review: self-review (fresh reviewer 실행은 workspace credits 오류로 종료). 큰 Content-Length 응답의 즉시 취소 누락과 자치구 이름의 객체 상속 속성 충돌을 재현하는 테스트 2개 RED→GREEN으로 수정했다. 헤더 이후 멈춘 본문도 5초 제한을 적용함을 검증했다.
- Playwright/설치된 Edge로 미설정·목록·관악구 검색·10분 단위·지연 관측·일부 조회·연결 끊김/복구·모바일 탭 전환 확인. 합성 응답은 격리된 브라우저 요청 가로채기에서만 사용. 390px 화면의 clientWidth/scrollWidth가 모두 390이며 JavaScript pageerror 0개. 실제 미설정 데스크톱/모바일 스크린샷도 확인했다.
- 보안 검사에서 없는 `.env.local` 경로는 SPA fallback 200이었다. 실제 합성 `.env.*` 파일을 생성하는 검사로 바로잡아 소문자·대문자 URL 모두 403을 확인했다. 본인 환경 파일은 만들거나 수정하지 않았다.
- 새 앱 의존성 없음. Playwright는 임시 npm 도구 캐시에서 UI 검증에만 사용하며 저장소 의존성/잠금파일에 추가하지 않는다.
- Final checks: 전체 테스트 79/79 통과, 빌드 성공, Astryx doctor pass 19/warn 3/fail 0. 기존 601kB 청크·외부 글꼴/Windows CLI 경로 경고는 그대로다. `npm start`와 `npm run dev` 실행 및 두 서버의 새 조회 API 200/미설정/운영 존 0을 확인했다. 개발 검증 서버는 종료하고 3001 빌드 서버는 유지한다. 화면 검증 자료는 `.superpowers/qa/`의 무시되는 로컬 파일이다.
- 본인 인증키 전체 조회와 실제 현장 좌표·경계·재고 결합은 미검증. 외부 API의 HTTP 전송 한계, 부분 조회, 프로세스별 캐시는 설정 문서에 명시했다. 새 변경은 로컬 기능 브랜치에만 보존하며 PR #1 병합이나 새 변경 push는 하지 않는다.
