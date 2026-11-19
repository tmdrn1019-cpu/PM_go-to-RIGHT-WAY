import test from 'node:test';
import assert from 'node:assert/strict';
import { filterZones, visibleMapCenterY } from '../src/zone-search.mjs';
const zones = [
  { id: 'a', name: '신림역 북측', address: '관악구 신림동', status: 'open', point: [37.48, 126.93], vehicleTypes: ['scooter'] },
  { id: 'b', name: '봉천역', address: '관악구 봉천동', status: 'closed', point: [37.49, 126.94], vehicleTypes: ['ebike'] },
  { id: 'c', name: '대학가', address: '관악구 봉천동', status: 'reduced', point: [37.5, 126.95], vehicleTypes: ['scooter', 'ebike'] },
];
test('주소·이름 검색과 상태·기기 종류 필터를 함께 적용한다', () => {
  assert.deepEqual(filterZones(zones, { query: ' 봉천동 ', vehicleType: 'ebike', statuses: ['reduced'] }).map((z) => z.id), ['c']);
  assert.equal(filterZones(zones, { query: '없는 이름' }).length, 0);
});
test('지도 범위로 제한하고 현재 위치에서 가까운 순으로 정렬한다', () => {
  assert.deepEqual(filterZones(zones, { bounds: [37.479, 126.929, 37.495, 126.945], origin: [37.49, 126.94] }).map((z) => z.id), ['b', 'a']);
  assert.equal(zones[0].id, 'a');
});
test('모든 레이어를 끄면 목록도 비고 기본 필터는 모두 보여 준다', () => {
  assert.equal(filterZones(zones, { statuses: [] }).length, 0);
  assert.equal(filterZones(zones).length, 3);
});
test('모바일 선택 지점은 펼친 패널 위에 남는 지도 중앙에 둔다', () => {
  assert.ok(Math.abs(visibleMapCenterY(800, 0.55) - 180) < 1e-9);
  assert.equal(visibleMapCenterY(800, 0), 400);
});
