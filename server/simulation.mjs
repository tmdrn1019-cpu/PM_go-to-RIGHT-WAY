import { randomUUID } from 'node:crypto';
import { demoZones, demoPolicy, demoTowingAreas } from './fixtures.mjs';
import { evaluateZone, LOS_REFERENCE, distanceM, distanceToRouteM, koreaDay } from './engine.mjs';

const active = (mission) => ['moving', 'verifying'].includes(mission.status);
const requireValue = (condition, message, status = 409) => { if (!condition) throw Object.assign(new Error(message), { status }); };
const timestamp = (at) => new Date(at).getTime();
// Synthetic scooter positions: a fixed spiral of 4~16m around the zone point (TAGO-like individual points).
const spread = ([lat, lng], i) => { const m = 4 + (i % 4) * 4; const a = i * 2.39996; return [lat + m * Math.cos(a) / 111_195, lng + m * Math.sin(a) / (111_195 * Math.cos(lat * Math.PI / 180))]; };
const towingAreaAt = (point) => demoTowingAreas.find((area) => distanceM(point, area.point) <= area.radiusM);
// Shortest way out: straight from the area's center through the start point, to the edge plus a margin.
export function exitPoint(area, from, marginM) {
  const scaleY = 111_195; const scaleX = scaleY * Math.cos(area.point[0] * Math.PI / 180);
  let dx = (from[1] - area.point[1]) * scaleX; let dy = (from[0] - area.point[0]) * scaleY;
  const length = Math.hypot(dx, dy); if (length < 0.5) { dx = 0; dy = 1; } else { dx /= length; dy /= length; }
  const reach = area.radiusM + marginM;
  return [area.point[0] + dy * reach / scaleY, area.point[1] + dx * reach / scaleX];
}

export function createDemo(at = '2026-11-19T17:30:00+09:00') {
  requireValue(typeof at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(at) && Number.isFinite(timestamp(at)), '시연 시각이 올바르지 않습니다.', 400);
  let index = 0;
  let noon = timestamp(`${koreaDay(at)}T12:00:00+09:00`);
  if (noon >= timestamp(at)) noon -= 1440 * 60_000;
  const returnedAt = new Date(noon).toISOString();
  const scooters = demoZones.flatMap((zone, z) => {
    const normalReturn = evaluateZone(zone, returnedAt, LOS_REFERENCE).capacity > 0;
    return Array.from({ length: [8, 2, 3, 3, 0, 2][z] }, (_, i) => ({ id: `PM-${String(++index).padStart(3, '0')}`, zoneId: zone.id, point: spread(zone.point, i), normalReturn, returnedAt, lastMovedAt: null, needsOperator: !normalReturn }));
  });
  return { now: new Date(at).toISOString(), revision: 0, zones: structuredClone(demoZones), policy: { ...demoPolicy }, profile: structuredClone(LOS_REFERENCE), scooters, missions: [], points: 0, events: [] };
}

function event(state, type, message, missionId = null) {
  state.events.unshift({ id: randomUUID(), at: state.now, type, message, missionId, mode: 'mock' });
}

function alarm(state, mission, reason) {
  if (mission.alarmed) return;
  mission.alarmed = true;
  event(state, 'alarm', `모의 경보음 · 운영사 알림: ${reason}`, mission.id);
}

export function snapshot(state) {
  const zones = state.zones.map((zone) => {
    const result = evaluateZone(zone, state.now, state.profile);
    const parked = state.scooters.filter((s) => s.zoneId === zone.id).length;
    const reserved = state.missions.filter((m) => active(m) && m.destinationId === zone.id).length;
    const outbound = state.missions.filter((m) => active(m) && m.originId === zone.id && state.scooters.some((s) => s.id === m.scooterId && s.zoneId === zone.id)).length;
    return { ...zone, ...result, parked, reserved, outbound, available: Math.max(0, result.capacity - parked - reserved), overflow: Math.max(0, parked - result.capacity), unassignedOverflow: Math.max(0, parked - result.capacity - outbound) };
  });
  const offers = state.scooters.filter((scooter) => {
    const zone = zones.find((z) => z.id === scooter.zoneId);
    return zone?.unassignedOverflow > 0 && zone.status !== 'unknown' && scooter.normalReturn && !scooter.needsOperator &&
      Number.isFinite(timestamp(scooter.returnedAt)) && timestamp(scooter.returnedAt) <= timestamp(state.now) &&
      evaluateZone(zone, scooter.returnedAt, state.profile).capacity > 0 &&
      !state.missions.some((m) => active(m) && m.scooterId === scooter.id) &&
      (!scooter.lastMovedAt || timestamp(state.now) - timestamp(scooter.lastMovedAt) >= state.policy.recentMoveMinutes * 60_000);
  }).map((scooter) => {
    const origin = zones.find((z) => z.id === scooter.zoneId);
    const destinations = zones.filter((z) => z.id !== origin.id && z.available > 0 && ['open', 'reduced'].includes(z.status))
      .map((z) => ({ id: z.id, name: z.name, distanceM: Math.round(distanceM(origin.point, z.point)), available: z.available }))
      // Older saved demo states predate maxMoveM, so fall back to the fixture value.
      .filter((d) => d.distanceM <= (state.policy.maxMoveM ?? demoPolicy.maxMoveM))
      .sort((a, b) => a.distanceM - b.distanceM);
    const from = scooter.point ?? origin.point; // older saved demos have no per-scooter point
    const area = towingAreaAt(from);
    if (area) {
      const point = exitPoint(area, from, state.policy.exitMarginM ?? demoPolicy.exitMarginM);
      destinations.unshift({ id: 'exit', name: `${area.name} 밖`, distanceM: Math.round(distanceM(from, point)), available: null, towingAreaId: area.id, point });
    }
    return { ...scooter, originName: origin.name, destinations };
  });
  const todayCount = state.missions.filter((m) => koreaDay(m.acceptedAt) === koreaDay(state.now)).length;
  const scooters = state.scooters.map((s) => ({ ...s, towingArea: (s.point && towingAreaAt(s.point))?.name ?? null }));
  return { ...state, scooters, zones, offers, towingAreas: demoTowingAreas, todayCount, operatorHandoffs: state.scooters.filter((s) => s.needsOperator).length, mode: 'demo' };
}

function validPosition(state, position) {
  return position && position.accuracy <= state.policy.accuracyM && timestamp(state.now) - timestamp(position.observedAt) <= state.policy.positionAgeSeconds * 1000;
}

export function command(state, action) {
  requireValue(action && typeof action === 'object' && !Array.isArray(action), '올바른 명령이 필요합니다.', 400);
  if (action.type === 'advance') {
    requireValue(Number.isInteger(action.minutes) && action.minutes > 0 && action.minutes <= 1440, '진행 시간은 1~1440분이어야 합니다.', 400);
    state.now = new Date(timestamp(state.now) + action.minutes * 60_000).toISOString();
    for (const mission of state.missions.filter(active)) {
      if (timestamp(state.now) >= timestamp(mission.expiresAt)) {
        alarm(state, mission, '이동 제한시간 초과');
        mission.status = 'expired';
        state.scooters.find((s) => s.id === mission.scooterId).needsOperator = true;
        event(state, 'handoff', '만료된 미션을 운영사 인계 대상으로 남겼습니다.', mission.id);
      }
    }
    return { now: state.now };
  }
  if (action.type === 'accept') {
    const view = snapshot(state);
    requireValue(!state.missions.some((m) => active(m) && m.scooterId === action.scooterId), '이미 수락된 기기입니다.');
    requireValue(view.todayCount < state.policy.dailyLimit, '하루 미션 수락 한도에 도달했습니다.');
    const scooter = state.scooters.find((s) => s.id === action.scooterId);
    requireValue(scooter, '대상 기기를 찾을 수 없습니다.', 404);
    requireValue(!scooter.lastMovedAt || timestamp(state.now) - timestamp(scooter.lastMovedAt) >= state.policy.recentMoveMinutes * 60_000, '최근 이동된 기기는 제외합니다.');
    const offer = view.offers.find((s) => s.id === scooter.id);
    requireValue(offer, '현재 이동 대상 기기가 아닙니다.');
    requireValue(offer.destinations.some((d) => d.id === action.destinationId), '목적지에 남은 수용 정원이 없거나 걸어서 옮길 수 있는 거리를 넘습니다.');
    requireValue(action.failUnlock === undefined || typeof action.failUnlock === 'boolean', '장치 시연 옵션이 올바르지 않습니다.', 400);
    requireValue(!action.failUnlock, '모의 장치 잠금 해제에 실패했습니다.', 502);
    const origin = state.zones.find((z) => z.id === scooter.zoneId);
    const exit = action.destinationId === 'exit' ? offer.destinations[0] : null;
    const destination = exit ? null : state.zones.find((z) => z.id === action.destinationId);
    const route = exit ? [scooter.point ?? origin.point, exit.point] : [origin.point, [destination.point[0], origin.point[1]], destination.point];
    const mission = { id: randomUUID(), scooterId: scooter.id, originId: origin.id, destinationId: action.destinationId, ...(exit ? { towingAreaId: exit.towingAreaId, target: exit.point } : {}), status: 'moving', acceptedAt: state.now, expiresAt: new Date(timestamp(state.now) + state.policy.deadlineMinutes * 60_000).toISOString(), route, position: null, alarmed: false, verdict: null };
    state.missions.unshift(mission);
    event(state, 'unlock', exit ? `모의 잠금 해제 성공 · ${exit.name}으로 ${exit.distanceM}m 이동` : '모의 잠금 해제 성공 · 목적지 정원 1대 예약', mission.id);
    return mission;
  }
  requireValue(['position', 'complete', 'cancel'].includes(action.type), '지원하지 않는 명령입니다.', 400);
  const mission = state.missions.find((m) => m.id === action.missionId);
  requireValue(mission, '미션을 찾을 수 없습니다.', 404);
  if (action.type === 'complete' && mission.status === 'completed') return mission;
  requireValue(active(mission), '이미 종료된 미션입니다.');
  const scooter = state.scooters.find((s) => s.id === mission.scooterId);
  if (action.type === 'cancel') {
    mission.status = 'cancelled';
    scooter.needsOperator = true;
    event(state, 'handoff', '미션 취소 · 정원 예약 해제 · 실제 기기 위치는 운영사 확인 필요', mission.id);
    return mission;
  }
  if (action.type === 'position') {
    requireValue(Array.isArray(action.point) && action.point.length === 2 && action.point.every(Number.isFinite) && Math.abs(action.point[0]) <= 90 && Math.abs(action.point[1]) <= 180, '좌표가 올바르지 않습니다.', 400);
    requireValue(Number.isFinite(action.accuracy) && action.accuracy >= 0, '위치 정확도가 올바르지 않습니다.', 400);
    const observed = timestamp(action.observedAt);
    requireValue(typeof action.observedAt === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(action.observedAt) && Number.isFinite(observed) && observed <= timestamp(state.now) && observed >= timestamp(mission.acceptedAt), '위치 관측 시점이 올바르지 않습니다.', 400);
    requireValue(!mission.position || observed >= timestamp(mission.position.observedAt), '이전 위치보다 오래된 관측 시점입니다.', 400);
    mission.position = { point: action.point, accuracy: action.accuracy, observedAt: new Date(observed).toISOString() };
    if (validPosition(state, mission.position)) {
      const origin = state.zones.find((z) => z.id === mission.originId);
      if (distanceM(action.point, origin.point) - action.accuracy > state.policy.arrivalRadiusM) scooter.zoneId = null;
      if (distanceToRouteM(action.point, mission.route) > state.policy.corridorM + action.accuracy) alarm(state, mission, '허용 이동 범위 이탈');
    }
    return mission;
  }
  requireValue(validPosition(state, mission.position), '최신의 정확한 도착 위치가 필요합니다.');
  const destination = mission.destinationId === 'exit' ? null : snapshot(state).zones.find((z) => z.id === mission.destinationId);
  if (destination) {
    requireValue(['open', 'reduced'].includes(destination.status) && destination.parked + destination.reserved <= destination.capacity, '목적지가 폐쇄되었거나 수용량이 부족합니다. 취소 후 운영사에 인계하세요.');
    requireValue(distanceM(mission.position.point, destination.point) + mission.position.accuracy <= state.policy.arrivalRadiusM, '도착 위치가 목적지 주차존 내부로 확인되지 않습니다.');
  } else {
    const area = demoTowingAreas.find((a) => a.id === mission.towingAreaId);
    // GPS error is subtracted so a fix near the edge never counts as having left the area.
    requireValue(area && distanceM(mission.position.point, area.point) - mission.position.accuracy > area.radiusM, '견인 구역을 벗어난 위치로 확인되지 않습니다.');
  }
  requireValue(action.photoPresent === true, '사진 증빙이 필요합니다.', 400);
  requireValue(['approved', 'rejected', 'uncertain'].includes(action.verdict), '사진 판정값이 올바르지 않습니다.', 400);
  mission.verdict = action.verdict;
  if (action.verdict !== 'approved') {
    mission.status = 'verifying';
    event(state, 'verification', `모의 사진 판정: ${action.verdict === 'rejected' ? '거절' : '판별 불가'} · 포인트 미지급`, mission.id);
    return mission;
  }
  mission.status = 'completed'; mission.completedAt = state.now;
  scooter.zoneId = destination?.id ?? null; scooter.point = mission.target ?? destination.point; scooter.lastMovedAt = state.now; scooter.needsOperator = false;
  state.points += state.policy.reward;
  event(state, 'reward', `이동 완료 · ${state.policy.reward.toLocaleString('ko-KR')} 시연 포인트 적립`, mission.id);
  return mission;
}
