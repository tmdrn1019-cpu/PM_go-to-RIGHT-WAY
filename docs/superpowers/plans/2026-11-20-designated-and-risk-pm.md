# 지정 주차구역·견인 위험 합성 PM 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/service` 지도에 서울시 지정 PM 주차구역 전체와 견인 위험 합성 PM을 표시한다.
**Architecture:** 존 빌드가 지정 구역과 서울 견인 상위 주소를 `public-zones.json` v5에 함께 쓴다. 서버 순수 함수가 견인 주소 주변에 합성 PM을 결정적으로 배치하고 30m 위험 판정을 붙인다. 화면은 두 층과 위험 목록을 그린다.
**Tech Stack:** Node 24, Express 5, React 19, Leaflet, Astryx, node:test
**Spec:** `docs/superpowers/specs/2026-11-20-designated-and-risk-pm-design.md`

## Global Constraints
- 합성 PM은 화면·API에서 `synthetic: true`와 "합성 시연 자료 · 실제 기기 아님"을 표시한다.
- 위험 반경 30m는 가정이며 법적 반납금지 경계가 아니라고 적는다.
- 지정 구역에는 운영 상태를 붙이지 않는다. 동적 존으로 쓰인 지정 구역은 중복 표시하지 않는다.
- 위험은 색 외에 테두리 굵기·크기·텍스트로도 구분한다.

## Review Focus
- 옛 v4 파일 → `status: 'error'`(존도 숨김). 다시 빌드하라는 기존 동작을 유지한다.
- 좌표가 깨진 지정 구역·견인 주소 → 파일 거부.
- 같은 입력 → 같은 배치(재시작해도 지도가 바뀌지 않음).
- 기기가 정확히 30m → 위험, 30m 초과 → 정상.
- fleet·towing 보기에서는 합성 PM을 숨겨 실제 TAGO 기기와 섞이지 않게 한다.

---

### Task 1: 자료·합성 함수 (`server/public-zones.mjs`, `server/build-public-zones.mjs`)
- [ ] 테스트(`tests/public-zones.test.mjs`): `syntheticFleet` 결정성, 30m 경계, 지정 구역 기기 존재; `readPublicZones` v5 필수 필드, v4 거부.
- [ ] `SYNTHETIC_RULES = { hotspots: 50, perCount: 40, maxPerHotspot: 6, spreadM: 80, riskRadiusM: 30, designatedEvery: 3 }`
- [ ] `syntheticFleet({ hotspots, designated, rules }) -> [{ id, point, risk: { address, distanceM } | null, nearDesignated }]` — 주소 해시 시드 mulberry32.
- [ ] `readPublicZones`가 `version: 5`, `designated`, `towingHotspots`를 검사·반환한다.
- [ ] 빌드가 두 배열을 쓴다.

### Task 2: API (`server/service-app.mjs`)
- [ ] 테스트: `/api/zones`의 `designated`에서 동적 존으로 쓰인 구역 제외, `/api/zones/synthetic-pm`의 `synthetic: true`·`riskRadiusM: 30`.
- [ ] 구현.

### Task 3: 화면 (`src/MapWorkspace.jsx`, `src/ZoneMap.jsx`)
- [ ] 지정 구역 사각 표식 층, 합성 PM 층(위험 강조), "견인 위험 PM" 메뉴·목록, 범례.
- [ ] `npm run build:zones`, `npm test`, `npm run build`, `npx astryx doctor --built dist`, 브라우저 확인.
- [ ] 문서: `docs/public-zones.md`, `CLAUDE.md`.
