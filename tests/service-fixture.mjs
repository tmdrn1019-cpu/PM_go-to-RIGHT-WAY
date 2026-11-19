export function serviceFixture(at = '2026-11-19T09:00:00+09:00') {
  return {
    version: 1, sourceName: '자동 검증용 합성 자료', publishedAt: at,
    profile: { name: '검증용 기준', source: 'https://example.org/test-policy', unit: '명/분/m', bounds: [20, 32, 46, 70, 106], approvedForService: true },
    zones: [{ id: 'a', name: '테스트 주차존', address: '검증용 주소', point: [37.48, 126.93], vehicleTypes: ['scooter'], parkingAuthorized: true,
      boundary: [[37.48, 126.93], [37.4801, 126.93], [37.4801, 126.9301], [37.48, 126.93]],
      layouts: [{ capacity: 5, effectiveWidthM: 3 }], windows: [],
      observation: { pedestrianCount15Min: 450, observedAt: at, validUntil: new Date(Date.parse(at) + 15 * 60_000).toISOString(), source: '테스트 센서' },
      inventory: { parked: 2, reserved: 1, observedAt: at, validUntil: new Date(Date.parse(at) + 15 * 60_000).toISOString() },
    }],
  };
}
