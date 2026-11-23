// All sites, layouts, demand and vehicle records are synthetic, not surveyed locations.
// Points sit beside real 2025 강남구 towing hotspots (역삼동 804·800-3·806·800-51, near 역삼역) for the demo map only.
export const demoZones = [
  { id: 'z1', name: '역삼동 804 견인 다발 옆', area: '역삼동', point: [37.501306, 127.038287], type: '건물 옆 가상 공간', layouts: [{ capacity: 3, effectiveWidthM: 3.4 }, { capacity: 8, effectiveWidthM: 2.3 }], pedestrianCount15Min: 1800, hourlyCounts: { 8: 3000, 12: 900, 18: 3400 }, windows: [{ start: '07:00', end: '18:00' }], preClose: { minutes: 60, capacity: 3 } },
  { id: 'z2', name: '역삼동 804 남동측 건물 옆', area: '역삼동', point: [37.500906, 127.040187], type: '제휴 가정 공간', layouts: [{ capacity: 4, effectiveWidthM: 4 }, { capacity: 10, effectiveWidthM: 3.2 }], pedestrianCount15Min: 480, hourlyCounts: { 8: 1300, 18: 1600 }, windows: [] },
  { id: 'z3', name: '역삼동 800-3 견인 다발 옆', area: '역삼동', point: [37.504436, 127.035268], type: '역 주변 가상 공간', layouts: [{ capacity: 2, effectiveWidthM: 3 }, { capacity: 6, effectiveWidthM: 2.4 }], pedestrianCount15Min: 3300, hourlyCounts: { 12: 800, 23: 400 }, windows: [] },
  { id: 'z4', name: '역삼동 800-3 북측 넓은 보도', area: '역삼동', point: [37.505536, 127.036468], type: '넓은 보도 가상 배치', layouts: [{ capacity: 4, effectiveWidthM: 4.8 }, { capacity: 12, effectiveWidthM: 4 }], pedestrianCount15Min: 1600, hourlyCounts: { 8: 5000, 18: 5000 }, windows: [] },
  { id: 'z5', name: '역삼동 806 옆 후보 공간', area: '역삼동', point: [37.497673, 127.042994], type: '배치 자료 미확인', layouts: [], pedestrianCount15Min: 300, windows: [] },
  { id: 'z6', name: '역삼동 800-51 옆 골목', area: '역삼동', point: [37.500741, 127.031201], type: '유효폭 부족 사례', layouts: [{ capacity: 4, effectiveWidthM: 1.8 }], pedestrianCount15Min: 500, windows: [] },
];

// exitMarginM: demo assumption for how far past the required distance the scooter is left. walkMPerMin: assumed walking pace while dragging.
export const demoPolicy = { exitMarginM: 10, dailyLimit: 3, recentMoveMinutes: 120, reward: 1500, deadlineMinutes: 20, corridorM: 50, accuracyM: 30, positionAgeSeconds: 120, arrivalRadiusM: 20, walkMPerMin: 50 };

// Demo towing areas: real 2025 hotspot points with an assumed 30m radius. Not legal no-parking boundaries.
// types: real 2025 towing counts by reason at that address (data/towing-source-12968.jsonl rows with an action date, 서울시 OA-23057).
export const demoTowingAreas = [
  { id: 'A', name: '역삼동 804 견인 구역', point: [37.501256, 127.038287], radiusM: 30, types: { '보도와 차도가 구분된 도로의 차도': 477, '횡단보도 주변(3m)': 1 } },
  { id: 'B', name: '역삼동 800-3 견인 구역', point: [37.504416, 127.035258], radiusM: 30, types: { '보도와 차도가 구분된 도로의 차도': 59, '횡단보도 주변(3m)': 1 } },
  { id: 'C', name: '역삼동 806 견인 구역', point: [37.497643, 127.042994], radiusM: 30, types: { '보도와 차도가 구분된 도로의 차도': 106, '버스정류소 및 택시승강장 주변(5m 이내)': 1 } },
  { id: 'D', name: '역삼동 800-51 견인 구역', point: [37.500701, 127.031251], radiusM: 30, types: { '보도와 차도가 구분된 도로의 차도': 39 } },
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
  { id: 'pk-231', name: '역삼역 8번 출구', point: [37.50131283132399, 127.03718652160248] },
  { id: 'pk-252', name: '역삼역 2번 출구', point: [37.500026685739115, 127.03651533461792] },
  { id: 'pk-253', name: '역삼 지하보도 4번 출구', point: [37.50212716454747, 127.04245096234929] },
  { id: 'pk-258', name: '강남역 12번 출구 뒤편', point: [37.498603781694186, 127.02830119252448] },
];

// Other real 2025 강남구 towing hotspots within 1.5km of the demo standpoints (data/public-zones.json `towingHotspots`).
// Map display only, drawn like the demo areas with the same assumed radius; scooters and missions never use them.
export const demoTowingSpots = [
  { address: '강남구 논현동 279-110', count: 302, point: [37.512011, 127.035729] },
  { address: '강남구 역삼동 805', count: 227, point: [37.492921, 127.042218] },
  { address: '강남구 도곡동 556', count: 91, point: [37.493411, 127.044433] },
  { address: '강남구 대치동 1011-25', count: 70, point: [37.501595, 127.054056] },
  { address: '강남구 역삼동 858-18', count: 56, point: [37.491843, 127.03162] },
  { address: '강남구 역삼동 635-1', count: 47, point: [37.50058, 127.02986] },
  { address: '강남구 역삼동 801-7', count: 45, point: [37.505707, 127.04131] },
  { address: '강남구 역삼동 800', count: 40, point: [37.506461, 127.031337] },
  { address: '강남구 논현동 279-165', count: 39, point: [37.507464, 127.034104] },
];
