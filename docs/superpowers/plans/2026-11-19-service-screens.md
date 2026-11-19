# Service Screens Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 승인된 상품 소개·큰 지도·시민 모바일 웹을 실제 데이터 연결을 위한 화면으로 구현한다.
**Architecture:** 기존 React/Express와 LOS 엔진을 재사용한다. 공개 조회 API는 시연 저장소를 읽지 않고 명시적으로 연결한 운영 데이터만 검증·판정한다. 미연결 상태는 빈 지도와 서비스 준비 안내로 표시한다.
**Tech Stack:** 기존 React 19 / Vite 8 / Astryx 0.7.16 / Express 5 / Leaflet / node:test. 새 의존성 없음.
**Spec:** `docs/superpowers/specs/2026-11-19-service-product-design.md` (사용자 승인)

## Global Constraints
- `/` 상품 소개, `/service` 지도 작업 화면, `/mobile` 시민 모바일 웹. 한국어 UI.
- 합성 주차존·시험 제어·가짜 잠금 해제/보상을 서비스 경로에서 제거한다.
- 기존 `data/demo.sqlite`는 수정하거나 삭제하지 않는다.
- 실제 운영사·인증·사진 검증 자료가 없는 상태에서는 미션을 실제로 시작하거나 완료하지 않는다.
- 이번 요청은 세 화면부터 구현하는 범위다. 실제 계정·기기 연동과 외부 배포는 후속 연결 범위로 남긴다.

## Review Focus
- 실제 데이터가 없을 때 합성 데이터를 자동 대입하지 않는가.
- 관측/재고 정보가 만료됐을 때 반납 가능한 상태로 표시하지 않는가.
- 공개 API가 시연 명령이나 원자료의 비밀 필드를 노출하지 않는가.
- 모바일에서 지도와 목록을 키보드·터치로 탐색하고 가로 넘침 없이 이용할 수 있는가.
- 필터·지도 범위·존 선택·위치 권한 거절·연결 복구가 일관되게 동작하는가.

## Task 1: 운영 데이터 조회와 화면용 선택 로직
Files: `server/service-feed.mjs`, `server/service-app.mjs`, `tests/service.test.mjs`, `src/zone-search.mjs`, `tests/zone-search.test.mjs`, `server/index.mjs`, `vite.config.js`.
Interfaces: `evaluateServiceFeed(feed, at)`, `readServiceFeed(file, at)`, `createServiceApp({feedPath, now})`, `filterZones(zones, filters)`.
- [x] 새 계약의 실패 테스트를 먼저 작성하고 실행한다.
- [x] 검증된 운영 데이터 파일의 관측·재고·정책으로 현재 상태를 계산한다. 누락·오류·만료 시 개방하지 않는다.
- [x] 실제 시간의 읽기 전용 API를 개발/빌드 서버에 연결하고 시연 API는 마운트하지 않는다.
- [x] 검색·유형·상태·지도 범위·거리순 테스트와 전체 `npm test`를 통과시킨다.

## Task 2: 소개·지도·모바일 화면
Files: `src/App.jsx`, `src/LandingPage.jsx`, `src/MapWorkspace.jsx`, `src/ZoneMap.jsx`, `src/useServiceData.js`, `src/main.jsx`, `index.html`.
- [x] 소개 페이지는 Astryx centered-hero 템플릿, 지도 프레임은 shell-side-nav를 참고해 기존 페이지를 개편한다.
- [x] 중간 서비스 진입 버튼, 큰 지도와 패널 탭, 필터·존 목록·상세·레이어, 모바일 하단 탐색 패널을 구현한다.
- [x] 실제 시각 조회를 자동 갱신하고 위치 권한은 시민의 내 위치 버튼에서만 요청한다.
- [x] `npm test`, `npm run build`, `npx astryx doctor --built dist`를 실행한다.

## Task 3: 검토와 전달
- [x] 별도 코드 검토 후 중요한 결함은 재현 테스트를 추가해 수정한다.
- [x] 브라우저에서 페이지 전환·지도·필터·모바일·빈 상태를 확인한다. 실제 위치 권한을 대신 허용하지 않는다.
- [x] README, AGENTS와 실제 데이터 파일 계약 예제를 갱신한다. 예제 데이터는 테스트에만 사용하고 운영 기본값으로 읽지 않는다.

## Progress
- 사용자 설계 승인 및 이 세션의 직접 구현 요청을 확인했다. 재승인 없이 이 계획을 실행한다.
- 현재 폴더는 Git 저장소가 아니므로 이 폴더를 사용한다. 별도 worktree·Git 초기화·커밋·push는 범위에 포함하지 않는다.
- Task 1 complete: 시연과 분리된 운영 조회, 입력·만료·검색 테스트 RED→GREEN, 전체 55개 통과.
- Task 2 complete: 템플릿 기반 소개, 3개 경로, 큰 지도/모바일 패널·필터·상세·위치 안내, 빌드 성공.
- Final review: 별도 검토자의 중요 결함을 재현해 수정했다. 요청 10초 제한과 서버 기준 판정 TTL, 개발 서버 원자료 차단, 선택 배치 LOS 분리, 다음 예정 변경, 0 면적 거절, 혼합 기기 공통 정원 확인, 위치 타일 공유 안내, 모바일 가림 방지를 반영했다. 시간표 중첩도 병합해 조기 축소를 막았다. 전체 65개 통과.
- Browser: 소개 중간 링크로 서비스 진입, 기기 필터·검색·상세 선택, 선택 마커가 모바일 패널 위에 남는 것, 실제 데이터 미연결 상태를 확인했다. 별도 검증 서버의 합성 자료에서 만료 시 개방 0으로 전환, 연결 단절·복구를 확인했다.
- Browser dimensions: 390×844에서 문서 가로 넘침 없음(390/390). 1280×900에서 지도 896×860, 사이드 패널 폭 384: 지도가 화면 너비의 70%를 차지한다.
- OSM 배경의 일부 타일에 차단 이미지가 나타났다. 공식 정책을 확인해 참조자 차단 헤더와 과거 서브도메인 URL을 수정했다. strict-origin-when-cross-origin 및 공식 타일 URL로 변경한 뒤 실제 지도가 정상 표시됨을 확인했다.
- 알려진 한계: Vite의 초기 JS 약 601kB 청크 경고, Astryx 외부 폰트 및 Windows CLI 경로 진단 경고는 남는다. UI 검사는 실패 0. 실제 휴대폰 GPS·운영사 장치·인증·사진 검증·외부 배포는 확인하지 않았다.
- Final checks: 전체 65개 테스트 통과. HTTP로 세 페이지 200, 기본 존 0개/미연결, 시연 명령 404를 확인했다. Windows 대소문자 변형에서도 원자료 직접 접근이 403이다. 소개 그림의 혼잡 상태 전환과 중간 진입 링크, 브라우저 뒤로가기를 확인했다. 서비스 주소의 브라우저 오류는 없었다.
- 전달: 3001의 실제 화면을 열어 두고 3002의 검증 전용 서버는 종료했다. 새 의존성·외부 배포·업로드는 없다.
