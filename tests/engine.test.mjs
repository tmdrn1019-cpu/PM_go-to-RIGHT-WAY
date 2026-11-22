import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateZone, LOS_REFERENCE, koreaDay, distanceM, distanceToRouteM } from '../server/engine.mjs';

const at = '2026-11-19T14:00:00+09:00';
const zone = { id: 'test', layouts: [{ capacity: 3, effectiveWidthM: 3.5 }, { capacity: 10, effectiveWidthM: 2.5 }], pedestrianCount15Min: 750, windows: [] };

test('15분 보행량과 주차 후 유효폭으로 보행류율을 계산한다', () => {
  const result = evaluateZone(zone, at, LOS_REFERENCE);
  assert.equal(result.flow, 20);
  assert.equal(result.capacity, 10);
  assert.equal(result.los, 'A');
  assert.equal(result.status, 'open');
});

for (const [flow, los] of [[0, 'A'], [20, 'A'], [20.01, 'B'], [32, 'B'], [32.01, 'C'], [46, 'C'], [46.01, 'D'], [70, 'D'], [70.01, 'E'], [106, 'E'], [106.01, 'F']]) {
  test(`보행류율 ${flow}의 LOS 경계는 ${los}`, () => {
    assert.equal(evaluateZone({ ...zone, pedestrianCount15Min: flow * 15 * 2.5 }, at, LOS_REFERENCE).los, los);
  });
}

test('D등급에서는 더 적은 기기를 놓는 배치로 축소한다', () => {
  const result = evaluateZone({ ...zone, pedestrianCount15Min: 2250 }, at, LOS_REFERENCE);
  assert.equal(result.capacity, 3);
  assert.equal(result.status, 'reduced');
  assert.equal(result.selectedFlow, 2250 / 15 / 3.5);
});

test('E등급은 반납 정원을 0으로 닫는다', () => {
  const result = evaluateZone({ ...zone, pedestrianCount15Min: 3000 }, at, LOS_REFERENCE);
  assert.equal(result.status, 'closed');
  assert.equal(result.capacity, 0);
});

test('주차 후 유효폭 2m는 허용하고 그 미만은 닫는다', () => {
  assert.equal(evaluateZone({ ...zone, layouts: [{ capacity: 2, effectiveWidthM: 2 }] }, at, LOS_REFERENCE).capacity, 2);
  assert.equal(evaluateZone({ ...zone, layouts: [{ capacity: 2, effectiveWidthM: 1.99 }] }, at, LOS_REFERENCE).capacity, 0);
});

for (const value of [undefined, null, -1, NaN, Infinity, '750']) {
  test(`유효하지 않은 보행량 ${String(value)}은 판정 불가`, () => {
    assert.equal(evaluateZone({ ...zone, pedestrianCount15Min: value }, at, LOS_REFERENCE).status, 'unknown');
  });
}

test('0 폭, 누락 기준표, 잘못된 날짜로 자동 개방하지 않는다', () => {
  assert.equal(evaluateZone({ ...zone, layouts: [{ capacity: 2, effectiveWidthM: 0 }] }, at, LOS_REFERENCE).status, 'unknown');
  assert.equal(evaluateZone(zone, at, null).status, 'unknown');
  assert.equal(evaluateZone(zone, 'invalid', LOS_REFERENCE).status, 'unknown');
});

test('자정을 넘는 운영시간은 전날의 요일을 따른다', () => {
  const night = { ...zone, windows: [{ days: [4], start: '22:00', end: '02:00' }] };
  assert.equal(evaluateZone(night, '2026-11-20T01:30:00+09:00', LOS_REFERENCE).status, 'open');
  assert.equal(evaluateZone(night, '2026-11-20T02:00:00+09:00', LOS_REFERENCE).status, 'closed');
  assert.equal(evaluateZone(night, '2026-11-21T01:30:00+09:00', LOS_REFERENCE).status, 'closed');
});

test('다음 날 폐쇄 예고도 존별 잔류 정원으로 축소한다', () => {
  const night = { ...zone, windows: [{ start: '22:00', end: '01:00' }], preClose: { minutes: 60, capacity: 3 } };
  const result = evaluateZone(night, '2026-11-20T00:30:00+09:00', LOS_REFERENCE);
  assert.equal(result.capacity, 3);
  assert.equal(result.status, 'reduced');
  assert.equal(result.nextClose, '2026-11-19T16:00:00.000Z');
});

test('한국 날짜와 경로 거리는 서버 시간대와 무관하다', () => {
  assert.equal(koreaDay('2026-11-19T15:05:00Z'), '2026-11-20');
  assert.equal(distanceM([37.48, 126.93], [37.48, 126.93]), 0);
  assert.ok(distanceM([37.48, 126.93], [37.481, 126.93]) > 110);
  assert.ok(distanceToRouteM([37.48, 126.931], [[37.48, 126.93], [37.48, 126.932]]) < 1);
});

test('기준표 누락과 시간당 기준의 단위 불일치는 판정 불가다', () => {
  assert.equal(evaluateZone(zone, at).status, 'unknown');
  assert.equal(evaluateZone(zone, at, { ...LOS_REFERENCE, unit: '명/시간/m' }).status, 'unknown');
});

test('폐쇄 예고 배치로 바꾼 뒤에도 LOS E인 경우 신규 반납을 닫는다', () => {
  const unsafe = { ...zone, pedestrianCount15Min: 2400, layouts: [{ capacity: 3, effectiveWidthM: 2 }, { capacity: 8, effectiveWidthM: 4 }], windows: [{ start: '07:00', end: '18:00' }], preClose: { minutes: 60, capacity: 3 } };
  const result = evaluateZone(unsafe, '2026-11-19T17:30:00+09:00', LOS_REFERENCE);
  assert.equal(result.status, 'closed');
  assert.equal(result.capacity, 0);
});

test('겹치거나 이어지는 운영 구간에서는 중간 종료 시각에 조기 축소하지 않는다', () => {
  const overlapping = { ...zone, windows: [{ start: '07:00', end: '10:00' }, { start: '09:00', end: '12:00' }], preClose: { minutes: 60, capacity: 3 } };
  const result = evaluateZone(overlapping, '2026-11-19T09:30:00+09:00', LOS_REFERENCE);
  assert.equal(result.capacity, 10); assert.equal(result.nextClose, '2026-11-19T03:00:00.000Z');
});

test('혼잡 규칙은 서울 역·시간 기준선과 비교하고, 숫자를 이유에 담고, 자료가 부족하면 판정하지 않는다', async () => {
  const { evaluateRelative } = await import('../server/engine.mjs');
  const hourlyCounts = Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, (h + 1) * 10])); // 23h busiest: 240
  const thresholds = { closeShare: 0.05, reduceShare: 0.15, close: 200, reduce: 150 };
  const zone = { hourlyCounts, thresholds, layouts: [{ capacity: 10 }, { capacity: 5 }] };
  const at = (h) => `2026-11-20T${String(h).padStart(2, '0')}:30:00+09:00`;
  const closed = evaluateRelative(zone, at(23));
  assert.equal(closed.status, 'closed'); assert.equal(closed.crowdRank, 1);
  assert.match(closed.reason, /240명.*1번째.*상위 5% 기준 200명 이상/);
  assert.equal(evaluateRelative(zone, at(19)).status, 'closed'); // 200 = close cut-off
  const reduced = evaluateRelative(zone, at(18));
  assert.equal(reduced.status, 'reduced'); assert.equal(reduced.capacity, 5); assert.match(reduced.reason, /190명.*상위 15% 기준 150명 이상.*5대/);
  assert.equal(evaluateRelative(zone, at(14)).status, 'reduced'); // 150 = reduce cut-off
  const open = evaluateRelative(zone, at(13));
  assert.equal(open.status, 'open'); assert.equal(open.capacity, 10); assert.match(open.reason, /140명.*150명보다 적어/);
  // A quiet place stays open even at its own busiest hour.
  assert.equal(evaluateRelative({ ...zone, thresholds: { ...thresholds, close: 1000, reduce: 500 } }, at(23)).status, 'open');
  assert.equal(evaluateRelative({ ...zone, layouts: [{ capacity: 10 }] }, at(18)).status, 'open');
  assert.equal(evaluateRelative({ ...zone, hourlyCounts: { 8: 100 } }, at(8)).status, 'unknown');
  const { 9: _gap, ...missing } = hourlyCounts;
  assert.equal(evaluateRelative({ ...zone, hourlyCounts: missing }, at(9)).status, 'unknown');
  assert.equal(evaluateRelative({ ...zone, thresholds: undefined }, at(23)).status, 'unknown');
  assert.equal(evaluateRelative({ ...zone, thresholds: { ...thresholds, close: 100 } }, at(23)).status, 'unknown'); // close below reduce
});

test('페널티 구역은 그 역 평균+1표준편차 이상이면 유지, 평균 이상이면 일부 개방, 평균 또는 서울 중앙값 미만이면 개방', async () => {
  const { evaluatePenalty, penaltyCutoffs } = await import('../server/engine.mjs');
  // 역삼역 2026.10 일평균: service hours 05~24시 give mean 4,525 and mean+σ 7,765 (deck v8 slide 9).
  const hourly = [198, 2, 0, 0, 1, 341, 1737, 5372, 11732, 10208, 4604, 3200, 3196, 3593, 3536, 3849, 4759, 8846, 10237, 5704, 3338, 2955, 2206, 896];
  assert.deepEqual(penaltyCutoffs(hourly), { mean: 4525, keep: 7765 });
  const thresholds = { median: 833 };
  const at = (h) => `2026-11-20T${String(h).padStart(2, '0')}:10:00+09:00`;
  const day = Array.from({ length: 24 }, (_, h) => evaluatePenalty({ hourly, thresholds }, at(h)).status);
  assert.deepEqual(day.map((s, h) => s === 'closed' && h).filter(Number.isInteger), [8, 9, 17, 18]);
  assert.deepEqual(day.map((s, h) => s === 'reduced' && h).filter(Number.isInteger), [7, 10, 16, 19]);
  assert.equal(day.filter((s) => s === 'open').length, 16);
  // The Seoul median is a floor for a partial opening.
  assert.equal(evaluatePenalty({ hourly, thresholds: { median: 5400 } }, at(7)).status, 'open');
  // 23:30 KST is still the same Seoul day's hour 23, not UTC's 14.
  assert.equal(evaluatePenalty({ hourly, thresholds }, '2026-11-20T14:30:00Z').crowdCount, 896);
  assert.equal(evaluatePenalty({ hourly: [], thresholds }, at(8)).status, 'unknown');
  assert.equal(evaluatePenalty({ hourly: Array(24).fill(5), thresholds }, at(8)).status, 'unknown'); // σ 0
  assert.equal(evaluatePenalty({ hourly, thresholds: {} }, at(8)).status, 'unknown');
  assert.equal(evaluatePenalty({ hourly, thresholds }, 'nope').status, 'unknown');
});
