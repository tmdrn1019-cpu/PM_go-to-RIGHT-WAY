import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemo, snapshot, command } from '../server/simulation.mjs';
import { evaluateZone, distanceM } from '../server/engine.mjs';
import { demoTowingAreas } from '../server/fixtures.mjs';

function accept(state, scooterId = 'PM-001') {
  return command(state, { type: 'accept', scooterId, destinationId: 'z2' });
}
function arrive(state, mission) {
  const destination = state.zones.find((z) => z.id === mission.destinationId);
  command(state, { type: 'position', missionId: mission.id, point: destination.point, accuracy: 5, observedAt: state.now });
}

test('과잉 주차 기기가 열린 존으로 이동하고 완료 보상은 한 번만 지급된다', () => {
  const state = createDemo();
  const mission = accept(state);
  arrive(state, mission);
  const action = { type: 'complete', missionId: mission.id, verdict: 'approved', photoPresent: true };
  command(state, action);
  command(state, action);
  assert.equal(state.points, 1500);
  assert.equal(state.missions[0].status, 'completed');
  assert.equal(state.scooters.find((s) => s.id === 'PM-001').zoneId, 'z2');
  assert.equal(snapshot(state).zones.find((z) => z.id === 'z2').reserved, 0);
});

test('중복 수락과 목적지 잔여 정원을 초과하는 수락을 거절한다', () => {
  const state = createDemo();
  state.zones.find((z) => z.id === 'z2').layouts = [{ capacity: 1, effectiveWidthM: 3 }];
  state.scooters = state.scooters.filter((s) => s.zoneId !== 'z2');
  accept(state);
  assert.throws(() => accept(state), /이미/);
  assert.throws(() => accept(state, 'PM-002'), /수용/);
});

test('장치 잠금 해제 실패 시 예약·미션·주차 위치를 변경하지 않는다', () => {
  const state = createDemo();
  assert.throws(() => command(state, { type: 'accept', scooterId: 'PM-001', destinationId: 'z2', failUnlock: true }), /잠금 해제/);
  assert.equal(state.missions.length, 0);
  assert.equal(snapshot(state).zones.find((z) => z.id === 'z2').reserved, 0);
  assert.equal(state.scooters[0].zoneId, 'z1');
});

test('외부 경로 이탈 경보는 중복 발송하지 않고 취소 후 위치를 받지 않는다', () => {
  const state = createDemo();
  const mission = accept(state);
  const action = { type: 'position', missionId: mission.id, point: [37.5, 126.95], accuracy: 5, observedAt: state.now };
  command(state, action); command(state, action);
  assert.equal(state.events.filter((e) => e.type === 'alarm').length, 1);
  command(state, { type: 'cancel', missionId: mission.id });
  assert.throws(() => command(state, action), /종료/);
  assert.equal(state.points, 0);
});

test('불확실한 위치와 오래된 위치로 이탈을 확정하거나 완료하지 않는다', () => {
  const state = createDemo(); const mission = accept(state);
  command(state, { type: 'position', missionId: mission.id, point: [37.5, 126.95], accuracy: 100, observedAt: state.now });
  assert.equal(state.events.filter((e) => e.type === 'alarm').length, 0);
  assert.throws(() => command(state, { type: 'complete', missionId: mission.id, verdict: 'approved', photoPresent: true }), /위치/);
  arrive(state, mission);
  command(state, { type: 'advance', minutes: 3 });
  assert.throws(() => command(state, { type: 'complete', missionId: mission.id, verdict: 'approved', photoPresent: true }), /위치/);
});

test('시간 초과는 한 번 경보를 남기고 예약을 해제하며 포인트를 지급하지 않는다', () => {
  const state = createDemo(); const mission = accept(state);
  command(state, { type: 'advance', minutes: 20 });
  command(state, { type: 'advance', minutes: 1 });
  assert.equal(state.missions[0].status, 'expired');
  assert.equal(state.events.filter((e) => e.type === 'alarm').length, 1);
  assert.equal(snapshot(state).zones.find((z) => z.id === 'z2').reserved, 0);
  assert.throws(() => command(state, { type: 'complete', missionId: mission.id, verdict: 'approved', photoPresent: true }), /종료/);
});

test('사진 거절·판별 불가와 목적지 폐쇄는 완료하지 않는다', () => {
  const state = createDemo(); const mission = accept(state); arrive(state, mission);
  for (const verdict of ['rejected', 'uncertain']) {
    command(state, { type: 'complete', missionId: mission.id, verdict, photoPresent: true });
    assert.equal(state.points, 0);
  }
  state.zones.find((z) => z.id === 'z2').windows = [{ start: '01:00', end: '02:00' }];
  assert.throws(() => command(state, { type: 'complete', missionId: mission.id, verdict: 'approved', photoPresent: true }), /목적지/);
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

test('출발하지 않은 이동 예약을 차감해 초과 1대에 한 건만 배정한다', () => {
  const state = createDemo();
  state.zones.find((z) => z.id === 'z1').layouts = [{ capacity: 2, effectiveWidthM: 4 }];
  state.zones.find((z) => z.id === 'z1').preClose = undefined;
  state.scooters = state.scooters.filter((s) => s.zoneId !== 'z1' || ['PM-001', 'PM-002', 'PM-003'].includes(s.id));
  accept(state);
  assert.throws(() => accept(state, 'PM-002'), /대상/);
});

test('폐쇄 후 반납된 기기는 정상 반납 플래그가 있어도 이동 미션에서 제외한다', () => {
  const state = createDemo('2026-11-19T23:00:00+09:00');
  state.scooters[0].returnedAt = '2026-11-19T20:00:00+09:00';
  assert.throws(() => accept(state), /대상/);
  const valid = state.scooters.find((s) => s.id === 'PM-002');
  assert.ok(Date.parse(valid.returnedAt) < Date.parse('2026-11-19T18:00:00+09:00'));
});

test('오차 범위가 출발 존에 걸치면 주차 공간을 비우지 않는다', () => {
  const state = createDemo(); const mission = accept(state);
  const origin = state.zones.find((z) => z.id === 'z1');
  command(state, { type: 'position', missionId: mission.id, point: [origin.point[0] + 0.00021, origin.point[1]], accuracy: 30, observedAt: state.now });
  assert.equal(state.scooters[0].zoneId, 'z1');
});

test('걸어서 옮길 수 있는 최대 거리 밖의 존은 목적지로 주지 않고 수락도 거절한다', () => {
  const state = createDemo();
  const zonesOf = (offer) => offer.destinations.filter((d) => d.id !== 'exit').map((d) => d.id);
  const view = snapshot(state);
  assert.deepEqual(zonesOf(view.offers.find((o) => o.zoneId === 'z1')), ['z2']);
  assert.deepEqual(zonesOf(view.offers.find((o) => o.zoneId === 'z3')), ['z4']);
  assert.ok(view.offers.every((o) => o.destinations.every((d) => d.distanceM <= state.policy.maxMoveM)));
  state.policy.maxMoveM = 100;
  const far = snapshot(state).offers.find((o) => o.zoneId === 'z3');
  assert.deepEqual(zonesOf(far), []);
  assert.throws(() => command(state, { type: 'accept', scooterId: far.id, destinationId: 'z4' }), /거리를 넘습니다/);
  delete state.policy.maxMoveM;
  assert.deepEqual(zonesOf(snapshot(state).offers.find((o) => o.id === 'PM-001')), ['z2']);
});

test('견인 구역 안의 기기는 구역 경계 바로 밖까지 가장 짧게 옮기는 목적지를 먼저 받는다', () => {
  const state = createDemo();
  const offer = snapshot(state).offers.find((o) => o.id === 'PM-001');
  const [exit, zone] = offer.destinations;
  assert.equal(exit.id, 'exit');
  assert.ok(exit.distanceM < zone.distanceM && exit.distanceM <= 40, `${exit.distanceM}m`);
  const area = demoTowingAreas.find((a) => a.id === exit.towingAreaId);
  assert.ok(Math.abs(distanceM(exit.point, area.point) - (area.radiusM + state.policy.exitMarginM)) < 0.5);
  const mission = command(state, { type: 'accept', scooterId: 'PM-001', destinationId: 'exit' });
  const complete = { type: 'complete', missionId: mission.id, verdict: 'approved', photoPresent: true };
  command(state, { type: 'position', missionId: mission.id, point: area.point, accuracy: 5, observedAt: state.now });
  assert.throws(() => command(state, complete), /견인 구역을 벗어난/);
  command(state, { type: 'position', missionId: mission.id, point: mission.target, accuracy: 25, observedAt: state.now });
  assert.throws(() => command(state, complete), /견인 구역을 벗어난/);
  command(state, { type: 'position', missionId: mission.id, point: mission.target, accuracy: 8, observedAt: state.now });
  command(state, complete); command(state, complete);
  assert.equal(state.points, state.policy.reward);
  assert.equal(state.scooters.find((s) => s.id === 'PM-001').zoneId, null);
  assert.equal(snapshot(state).zones.find((z) => z.id === 'z1').parked, 7);
  assert.equal(snapshot(state).offers.some((o) => o.id === 'PM-001'), false);
  assert.deepEqual(state.scooters.find((s) => s.id === 'PM-001').point, mission.target);
  const view = snapshot(createDemo());
  const inside = view.scooters.filter((s) => s.towingArea);
  assert.deepEqual([...new Set(inside.map((s) => s.zoneId))].sort(), ['z1', 'z3', 'z6']);
  assert.equal(inside.length, 13);
  assert.equal(view.offers.some((o) => o.zoneId === 'z6'), false); // returned while closed: operator handoff, not a mission
  const exits = view.offers.map((o) => o.destinations[0]);
  assert.ok(exits.every((d) => d.id === 'exit' && d.distanceM >= 10 && d.distanceM <= 40));
  assert.ok(new Set(exits.map((d) => d.distanceM)).size > 1);
});
