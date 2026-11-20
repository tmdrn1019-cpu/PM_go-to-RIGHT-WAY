import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, snapshot, command, zonesAt } from '../server/simulation.mjs';
import { evaluateZone, distanceM } from '../server/engine.mjs';
import { demoTowingAreas } from '../server/fixtures.mjs';

function accept(state, scooterId = 'PM-001') {
  return command(state, { type: 'accept', scooterId, destinationId: 'exit' });
}
function arrive(state, mission) {
  command(state, { type: 'position', missionId: mission.id, point: mission.target, accuracy: 5, observedAt: state.now });
}
const done = (mission, verdict = 'approved') => ({ type: 'complete', missionId: mission.id, verdict, photoPresent: true });

test('견인 구역 안 기기는 구역 경계 바로 밖까지만 옮기면 되고 보상은 한 번만 지급된다', () => {
  const state = createDemo();
  const offer = snapshot(state).offers.find((o) => o.id === 'PM-001');
  assert.equal(offer.destinations.length, 1);
  const [exit] = offer.destinations;
  const area = demoTowingAreas.find((a) => a.id === exit.towingAreaId);
  assert.ok(Math.abs(distanceM(exit.point, area.point) - (area.radiusM + state.policy.exitMarginM)) < 0.5);
  const mission = accept(state);
  command(state, { type: 'position', missionId: mission.id, point: area.point, accuracy: 5, observedAt: state.now });
  assert.throws(() => command(state, done(mission)), /견인 구역을 벗어난/);
  command(state, { type: 'position', missionId: mission.id, point: mission.target, accuracy: 25, observedAt: state.now });
  assert.throws(() => command(state, done(mission)), /견인 구역을 벗어난/);
  arrive(state, mission);
  command(state, done(mission)); command(state, done(mission));
  assert.equal(state.points, state.policy.reward);
  const moved = state.scooters.find((s) => s.id === 'PM-001');
  assert.equal(moved.zoneId, null); assert.deepEqual(moved.point, mission.target);
  assert.equal(snapshot(state).zones.find((z) => z.id === 'z1').parked, 7);
  assert.equal(snapshot(state).offers.some((o) => o.id === 'PM-001'), false);
});

test('미션 대상은 견인 구역 안의 모든 기기이며 기기마다 최단 거리가 다르다', () => {
  const view = snapshot(createDemo());
  const inside = view.scooters.filter((s) => s.towingArea);
  assert.deepEqual([...new Set(inside.map((s) => s.zoneId))].sort(), ['z1', 'z3', 'z6']);
  assert.equal(inside.length, 13);
  assert.deepEqual(view.offers.map((o) => o.id).sort(), inside.map((s) => s.id).sort());
  const exits = view.offers.map((o) => o.destinations[0]);
  assert.ok(exits.every((d) => d.id === 'exit' && d.distanceM >= 10 && d.distanceM <= 40));
  assert.ok(new Set(exits.map((d) => d.distanceM)).size > 1);
});

test('중복 수락과 견인 구역 밖 기기 수락을 거절한다', () => {
  const state = createDemo();
  accept(state);
  assert.throws(() => accept(state), /이미/);
  assert.throws(() => accept(state, 'PM-009'), /대상/); // z2 scooters are outside every towing area
});

test('장치 잠금 해제 실패 시 미션·주차 위치를 변경하지 않는다', () => {
  const state = createDemo();
  assert.throws(() => command(state, { type: 'accept', scooterId: 'PM-001', destinationId: 'exit', failUnlock: true }), /잠금 해제/);
  assert.equal(state.missions.length, 0);
  assert.equal(state.scooters[0].zoneId, 'z1');
});

test('외부 경로 이탈 경보는 중복 발송하지 않고 취소 후 위치를 받지 않으며 인계된 기기는 다시 미션이 되지 않는다', () => {
  const state = createDemo();
  const mission = accept(state);
  const action = { type: 'position', missionId: mission.id, point: [37.5, 126.95], accuracy: 5, observedAt: state.now };
  command(state, action); command(state, action);
  assert.equal(state.events.filter((e) => e.type === 'alarm').length, 1);
  command(state, { type: 'cancel', missionId: mission.id });
  assert.throws(() => command(state, action), /종료/);
  assert.equal(state.points, 0);
  assert.equal(snapshot(state).offers.some((o) => o.id === 'PM-001'), false);
  assert.equal(snapshot(state).operatorHandoffs, 1);
});

test('불확실한 위치와 오래된 위치로 이탈을 확정하거나 완료하지 않는다', () => {
  const state = createDemo(); const mission = accept(state);
  command(state, { type: 'position', missionId: mission.id, point: [37.5, 126.95], accuracy: 100, observedAt: state.now });
  assert.equal(state.events.filter((e) => e.type === 'alarm').length, 0);
  assert.throws(() => command(state, done(mission)), /위치/);
  arrive(state, mission);
  command(state, { type: 'advance', minutes: 3 });
  assert.throws(() => command(state, done(mission)), /위치/);
});

test('시간 초과는 한 번 경보를 남기고 포인트 없이 운영사에 인계한다', () => {
  const state = createDemo(); const mission = accept(state);
  command(state, { type: 'advance', minutes: 20 });
  command(state, { type: 'advance', minutes: 1 });
  assert.equal(state.missions[0].status, 'expired');
  assert.equal(state.events.filter((e) => e.type === 'alarm').length, 1);
  assert.throws(() => command(state, done(mission)), /종료/);
  assert.equal(state.scooters[0].needsOperator, true);
});

test('사진 거절·판별 불가는 완료하지 않는다', () => {
  const state = createDemo(); const mission = accept(state); arrive(state, mission);
  for (const verdict of ['rejected', 'uncertain']) {
    command(state, done(mission, verdict));
    assert.equal(state.points, 0);
  }
  assert.equal(state.missions[0].status, 'verifying');
});

test('일일 제한은 한국 날짜를 기준으로 계산하고 최근 이동은 제외한다', () => {
  const state = createDemo('2026-11-19T23:55:00+09:00');
  state.missions = [1, 2, 3].map((n) => ({ id: String(n), acceptedAt: state.now, status: 'cancelled' }));
  assert.throws(() => accept(state), /하루/);
  command(state, { type: 'advance', minutes: 10 });
  const mission = accept(state); assert.equal(mission.status, 'moving');
  command(state, { type: 'cancel', missionId: mission.id });
  state.scooters.find((s) => s.id === 'PM-002').lastMovedAt = state.now;
  assert.throws(() => accept(state, 'PM-002'), /최근/);
});

test('이미 주차된 기기는 폐쇄·수용량 축소로 사라지지 않는다', () => {
  const state = createDemo(); const count = state.scooters.length;
  command(state, { type: 'advance', minutes: 60 });
  assert.equal(state.scooters.length, count);
  assert.ok(snapshot(state).zones.find((z) => z.id === 'z1').overflow > 0);
});

test('유효하지 않은 명령·좌표·미래 위치는 거절한다', () => {
  const state = createDemo(); const mission = accept(state);
  assert.throws(() => command(state, { type: 'advance', minutes: -1 }), /시간/);
  assert.throws(() => command(state, { type: 'position', missionId: mission.id, point: [200, 300], accuracy: 5, observedAt: state.now }), /좌표/);
  assert.throws(() => command(state, { type: 'position', missionId: mission.id, point: [37.48, 126.93], accuracy: 5, observedAt: '2030-01-01T00:00:00Z' }), /시점/);
});

test('현재 시간대의 보행량이 24시간 전망의 원본값을 덮어쓰지 않는다', () => {
  const state = createDemo('2026-11-19T12:00:00+09:00');
  const zone = snapshot(state).zones.find((z) => z.id === 'z3');
  assert.equal(evaluateZone(zone, '2026-11-19T17:00:00+09:00', state.profile).capacity, 0);
});

test('오차 범위가 출발 존에 걸치면 주차 공간을 비우지 않는다', () => {
  const state = createDemo(); const mission = accept(state);
  const origin = state.zones.find((z) => z.id === 'z1');
  command(state, { type: 'position', missionId: mission.id, point: [origin.point[0] + 0.00021, origin.point[1]], accuracy: 30, observedAt: state.now });
  assert.equal(state.scooters[0].zoneId, 'z1');
});

test('시각별 존 판정은 상태를 바꾸지 않고 시간대에 따라 달라진다', () => {
  const state = createDemo();
  const before = JSON.stringify(state);
  const status = (at) => Object.fromEntries(zonesAt(state, at).map((z) => [z.id, z.status]));
  const morning = status('2026-11-19T08:30:00+09:00'); const night = status('2026-11-19T22:00:00+09:00');
  assert.notDeepEqual(morning, night);
  assert.equal(night.z1, 'closed'); // outside 07:00-18:00
  assert.equal(JSON.stringify(state), before);
  assert.ok(zonesAt(state).every((z) => z.boundary.length === 5 && z.vehicleTypes[0] === 'scooter' && z.observedAt));
});
