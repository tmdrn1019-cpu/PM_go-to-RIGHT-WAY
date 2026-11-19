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
