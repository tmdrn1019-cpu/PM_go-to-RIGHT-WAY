// All sites, layouts, demand and vehicle records are synthetic, not surveyed locations.
// Points sit beside real 2025 towing hotspots (신림동 1467-13, 봉천동 1693-13·1693-14, 봉천동 100-27) for the demo map only.
export const demoZones = [
  { id: 'z1', name: '신림동 1467 견인 다발 옆', area: '신림동', point: [37.4840, 126.9266], type: '건물 옆 가상 공간', layouts: [{ capacity: 3, effectiveWidthM: 3.4 }, { capacity: 8, effectiveWidthM: 2.3 }], pedestrianCount15Min: 1800, hourlyCounts: { 8: 3000, 12: 900, 18: 3400 }, windows: [{ start: '07:00', end: '18:00' }], preClose: { minutes: 60, capacity: 3 } },
  { id: 'z2', name: '신림동 1467 남동측 건물 옆', area: '신림동', point: [37.4836, 126.9285], type: '제휴 가정 공간', layouts: [{ capacity: 4, effectiveWidthM: 4 }, { capacity: 10, effectiveWidthM: 3.2 }], pedestrianCount15Min: 480, hourlyCounts: { 8: 1300, 18: 1600 }, windows: [] },
  { id: 'z3', name: '봉천동 1693 견인 다발 옆', area: '봉천동', point: [37.4789, 126.9408], type: '역 주변 가상 공간', layouts: [{ capacity: 2, effectiveWidthM: 3 }, { capacity: 6, effectiveWidthM: 2.4 }], pedestrianCount15Min: 3300, hourlyCounts: { 12: 800, 23: 400 }, windows: [] },
  { id: 'z4', name: '봉천동 1693 북측 넓은 보도', area: '봉천동', point: [37.4800, 126.9420], type: '넓은 보도 가상 배치', layouts: [{ capacity: 4, effectiveWidthM: 4.8 }, { capacity: 12, effectiveWidthM: 4 }], pedestrianCount15Min: 1600, hourlyCounts: { 8: 5000, 18: 5000 }, windows: [] },
  { id: 'z5', name: '봉천동 1693-14 옆 후보 공간', area: '봉천동', point: [37.4791, 126.9485], type: '배치 자료 미확인', layouts: [], pedestrianCount15Min: 300, windows: [] },
  { id: 'z6', name: '봉천동 100-27 옆 골목', area: '봉천동', point: [37.4824, 126.9594], type: '유효폭 부족 사례', layouts: [{ capacity: 4, effectiveWidthM: 1.8 }], pedestrianCount15Min: 500, windows: [] },
];

// exitMarginM: demo assumption for how far past the required distance the scooter is left. walkMPerMin: assumed walking pace while dragging.
export const demoPolicy = { exitMarginM: 10, dailyLimit: 3, recentMoveMinutes: 120, reward: 1500, deadlineMinutes: 20, corridorM: 50, accuracyM: 30, positionAgeSeconds: 120, arrivalRadiusM: 20, walkMPerMin: 50 };

// Demo towing areas: real 2025 hotspot points with an assumed 30m radius. Not legal no-parking boundaries.
// types: real 2025 towing counts by reason at that address (data/towing-areas.json, 서울시 OA-23057).
export const demoTowingAreas = [
  { id: 'A', name: '신림동 1467-13 견인 구역', point: [37.48395, 126.9266], radiusM: 30, types: { '교통섬 내부': 36, '횡단보도 주변(3m)': 15, '상기 사항 외 보도': 2, '점자블록 또는 교통약자 엘리베이터': 1 } },
  { id: 'B', name: '봉천동 1693-13 견인 구역', point: [37.47888, 126.94079], radiusM: 30, types: { '보호구역(어린이·노인·장애인)': 36, '횡단보도 주변(3m)': 13, '보도와 차도가 구분된 도로의 차도': 7, '점자블록 또는 교통약자 엘리베이터': 2, '버스정류소 및 택시승강장 주변(5m 이내)': 2 } },
  { id: 'C', name: '봉천동 1693-14 견인 구역', point: [37.47907, 126.9485], radiusM: 30, types: { '보호구역(어린이·노인·장애인)': 25, '횡단보도 주변(3m)': 23, '점자블록 또는 교통약자 엘리베이터': 5, '보도와 차도가 구분된 도로의 차도': 1 } },
  { id: 'D', name: '봉천동 100-27 견인 구역', point: [37.48236, 126.95945], radiusM: 30, types: { '보호구역(어린이·노인·장애인)': 65, '보도와 차도가 구분된 도로의 차도': 3 } },
];

// What moving a scooter means for each real towing reason. clear: walk it more than clearM away from where it stood.
// The 3m/5m distances are the reason's own wording; assumed: true marks demo guesses (no road/sidewalk geometry).
// protected: no boundary data, so the citizen option is the nearest designated PM parking; grace: not an immediate-tow reason.
export const towingRules = {
  '횡단보도 주변(3m)': { kind: 'clear', clearM: 3, guide: '횡단보도에서 3m 넘게 떨어진 보도로 옮겨 주세요.' },
  '버스정류소 및 택시승강장 주변(5m 이내)': { kind: 'clear', clearM: 5, guide: '정류소·승강장에서 5m 넘게 떨어진 곳으로 옮겨 주세요.' },
  '지하철역 전면(5m이내)': { kind: 'clear', clearM: 5, guide: '지하철역 출입구 앞에서 5m 넘게 떨어진 곳으로 옮겨 주세요.' },
  '보도와 차도가 구분된 도로의 차도': { kind: 'clear', clearM: 5, assumed: true, guide: '차도에서 보도 안쪽으로 옮겨 주세요.' },
  '자전거 도로': { kind: 'clear', clearM: 5, assumed: true, guide: '자전거도로에서 보도 안쪽으로 옮겨 주세요.' },
  '교통섬 내부': { kind: 'clear', clearM: 5, assumed: true, guide: '교통섬 밖 보도로 옮겨 주세요. 횡단보도 신호를 지켜 건너 주세요.' },
  '점자블록 또는 교통약자 엘리베이터': { kind: 'clear', clearM: 3, assumed: true, guide: '점자블록·엘리베이터 앞을 비우고 옆 보도로 옮겨 주세요.' },
  '보호구역(어린이·노인·장애인)': { kind: 'protected', guide: '보호구역 안이라 가까운 지정 PM 주차구역으로 옮겨 주세요.' },
  '상기 사항 외 보도': { kind: 'grace' },
  '그 외 지역': { kind: 'grace' },
};

// Real 서울시 지정 PM 주차구역 nearest to the demo hotspots (copied from data/public-zones.json `designated`). No capacity data.
export const demoDesignated = [
  { id: 'pk-171', name: '서울대입구역 4번 출구 인근', point: [37.48113529746553, 126.95132864045641] },
  { id: 'pk-172', name: '서울대입구역 5번 출구 인근', point: [37.48178146393465, 126.95083877566566] },
  { id: 'pk-173', name: '낙성대입구 교차로 인근', point: [37.47810543215296, 126.96010042371994] },
  { id: 'pk-175', name: '봉천역 3번 출구 인근', point: [37.482748996992946, 126.93985201546155] },
];

// Other real 2025 Seoul towing hotspots within 1.5km of the demo standpoints (data/public-zones.json `towingHotspots`).
// Map display only, drawn like the demo areas with the same assumed radius; scooters and missions never use them.
export const demoTowingSpots = [
  { address: '동작구 신대방동 395-61', count: 72, point: [37.491743, 126.923946] },
  { address: '관악구 봉천동 1732-6', count: 50, point: [37.477787, 126.940165] },
  { address: '관악구 봉천동 1712-10', count: 49, point: [37.491657, 126.951057] },
  { address: '관악구 신림동 1467-10', count: 49, point: [37.484659, 126.929645] },
  { address: '관악구 봉천동 979-8', count: 48, point: [37.483046, 126.940143] },
  { address: '관악구 신림동 1642-16', count: 46, point: [37.478945, 126.929848] },
  { address: '동작구 신대방동 722', count: 44, point: [37.49313, 126.919774] },
  { address: '관악구 봉천동 979-7', count: 43, point: [37.482339, 126.942705] },
  { address: '관악구 신림동 502', count: 37, point: [37.486486, 126.913581] },
];
