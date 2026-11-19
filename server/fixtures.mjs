// All sites, layouts, demand and vehicle records are synthetic, not surveyed locations.
export const demoZones = [
  { id: 'z1', name: '신림역 북측', area: '신림동', point: [37.4846, 126.9308], type: '건물 옆 가상 공간', layouts: [{ capacity: 3, effectiveWidthM: 3.4 }, { capacity: 8, effectiveWidthM: 2.3 }], pedestrianCount15Min: 1800, hourlyCounts: { 8: 3000, 12: 900, 18: 3400 }, windows: [{ start: '07:00', end: '18:00' }], preClose: { minutes: 60, capacity: 3 } },
  { id: 'z2', name: '신림로 건물측', area: '신림동', point: [37.4835, 126.9323], type: '제휴 가정 공간', layouts: [{ capacity: 4, effectiveWidthM: 4 }, { capacity: 10, effectiveWidthM: 3.2 }], pedestrianCount15Min: 480, hourlyCounts: { 8: 1300, 18: 1600 }, windows: [] },
  { id: 'z3', name: '봉천역 서측', area: '봉천동', point: [37.482, 126.941], type: '역 주변 가상 공간', layouts: [{ capacity: 2, effectiveWidthM: 3 }, { capacity: 6, effectiveWidthM: 2.4 }], pedestrianCount15Min: 3300, hourlyCounts: { 12: 800, 23: 400 }, windows: [] },
  { id: 'z4', name: '서울대입구 북측', area: '봉천동', point: [37.4818, 126.9521], type: '넓은 보도 가상 배치', layouts: [{ capacity: 4, effectiveWidthM: 4.8 }, { capacity: 12, effectiveWidthM: 4 }], pedestrianCount15Min: 1600, hourlyCounts: { 8: 5000, 18: 5000 }, windows: [] },
  { id: 'z5', name: '대학가 후보 공간', area: '봉천동', point: [37.4802, 126.9468], type: '배치 자료 미확인', layouts: [], pedestrianCount15Min: 300, windows: [] },
  { id: 'z6', name: '봉천시장 골목', area: '봉천동', point: [37.4838, 126.9428], type: '유효폭 부족 사례', layouts: [{ capacity: 4, effectiveWidthM: 1.8 }], pedestrianCount15Min: 500, windows: [] },
];

export const demoPolicy = { dailyLimit: 3, recentMoveMinutes: 120, reward: 1500, deadlineMinutes: 20, corridorM: 50, accuracyM: 30, positionAgeSeconds: 120, arrivalRadiusM: 20 };
