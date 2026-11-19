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

// maxMoveM: demo assumption for a short walk-and-push move; the real limit is an undecided policy.
export const demoPolicy = { maxMoveM: 300, exitMarginM: 10, dailyLimit: 3, recentMoveMinutes: 120, reward: 1500, deadlineMinutes: 20, corridorM: 50, accuracyM: 30, positionAgeSeconds: 120, arrivalRadiusM: 20 };

// Demo towing areas: real 2025 hotspot points with an assumed 30m radius. Not legal no-parking boundaries.
export const demoTowingAreas = [
  { id: 'A', name: '신림동 1467-13 견인 구역', point: [37.48395, 126.9266], radiusM: 30 },
  { id: 'B', name: '봉천동 1693-13 견인 구역', point: [37.47888, 126.94079], radiusM: 30 },
  { id: 'C', name: '봉천동 1693-14 견인 구역', point: [37.47907, 126.9485], radiusM: 30 },
  { id: 'D', name: '봉천동 100-27 견인 구역', point: [37.48236, 126.95945], radiusM: 30 },
];
