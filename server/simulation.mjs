import { randomUUID } from 'node:crypto';
import { demoZones, demoPolicy, demoTowingAreas, towingRules, demoDesignated, demoTowingSpots } from './fixtures.mjs';
import { evaluateZone, nextScheduledChange, LOS_REFERENCE, distanceM, distanceToRouteM, koreaDay } from './engine.mjs';

const active = (mission) => ['moving', 'verifying'].includes(mission.status);
const requireValue = (condition, message, status = 409) => { if (!condition) throw Object.assign(new Error(message), { status }); };
const timestamp = (at) => new Date(at).getTime();
// Synthetic scooter positions: a fixed spiral of 4~16m around the zone point (TAGO-like individual points).
const spread = ([lat, lng], i) => { const m = 4 + (i % 4) * 4; const a = i * 2.39996; return [lat + m * Math.cos(a) / 111_195, lng + m * Math.sin(a) / (111_195 * Math.cos(lat * Math.PI / 180))]; };
const square = ([lat, lng], d = 0.00012) => [[lat - d, lng - d], [lat + d, lng - d], [lat + d, lng + d], [lat - d, lng + d], [lat - d, lng - d]];
const towingAreaAt = (point) => demoTowingAreas.find((area) => distanceM(point, area.point) <= area.radiusM);
// Walk `distM` further from `from`, straight away from the hotspot center (the real road geometry is not known).
export function awayPoint(center, from, distM) {
  const scaleY = 111_195; const scaleX = scaleY * Math.cos(center[0] * Math.PI / 180);
  let dx = (from[1] - center[1]) * scaleX; let dy = (from[0] - center[0]) * scaleY;
  const length = Math.hypot(dx, dy); if (length < 0.5) { dx = 0; dy = 1; } else { dx /= length; dy /= length; }
  return [from[0] + dy * distM / scaleY, from[1] + dx * distM / scaleX];
}
// Each scooter at a hotspot gets one real towing reason, picked deterministically in proportion to that address's counts.
export function reasonFor(area, scooterId) {
  const entries = Object.entries(area.types); const total = entries.reduce((n, [, c]) => n + c, 0);
  let u = (Number(scooterId.replace(/\D/g, '')) * 2654435761 >>> 0) % total;
  for (const [reason, count] of entries) { if (u < count) return reason; u -= count; }
}
const nearestDesignated = (point) => demoDesignated.map((z) => ({ ...z, distanceM: distanceM(point, z.point) })).sort((a, b) => a.distanceM - b.distanceM)[0];

export function createDemo(at = '2026-11-19T17:30:00+09:00') {
  requireValue(typeof at === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(at) && Number.isFinite(timestamp(at)), '시연 시각이 올바르지 않습니다.', 400);
  let index = 0;
  const scooters = demoZones.flatMap((zone, z) => Array.from({ length: [8, 2, 3, 3, 0, 2][z] }, (_, i) => ({ id: `PM-${String(++index).padStart(3, '0')}`, zoneId: zone.id, point: spread(zone.point, i), lastMovedAt: null, needsOperator: false })));
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

// Zone verdicts at any moment, in the same shape the web map uses for real zones. Pure: never changes state.
export function zonesAt(state, at = state.now) {
  return state.zones.map((zone) => {
    const result = evaluateZone(zone, at, state.profile);
    const parked = state.scooters.filter((s) => s.zoneId === zone.id).length;
    return { ...zone, ...result, address: `관악구 ${zone.area} · 합성 시연 존`, boundary: square(zone.point), vehicleTypes: ['scooter'], parked, available: Math.max(0, result.capacity - parked), overflow: Math.max(0, parked - result.capacity),
      nextChange: nextScheduledChange(zone, at), observedAt: new Date(at).toISOString(), observationSource: '시연용 합성 시간대별 보행량' };
  });
}

export function snapshot(state) {
  const free = (scooter) => !state.missions.some((m) => active(m) && m.scooterId === scooter.id) &&
    (!scooter.lastMovedAt || timestamp(state.now) - timestamp(scooter.lastMovedAt) >= state.policy.recentMoveMinutes * 60_000);
  // User rule: a scooter at a towing hotspot is moved as its real towing reason requires, unless it was already resolved or handed to the operator.
  const offers = state.scooters.filter((s) => s.point && towingAreaAt(s.point) && !s.handoff && !s.resolved && free(s)).flatMap((scooter) => {
    const area = towingAreaAt(scooter.point); const reason = reasonFor(area, scooter.id); const rule = towingRules[reason];
    if (rule.kind === 'grace') return [];
    const base = { ...scooter, originName: area.name, reason, rule };
    if (rule.kind === 'clear') {
      const point = awayPoint(area.point, scooter.point, rule.clearM + (state.policy.exitMarginM ?? demoPolicy.exitMarginM));
      return [{ ...base, destinations: [{ id: 'exit', name: `${reason} ${rule.clearM}m 밖`, distanceM: Math.round(distanceM(scooter.point, point)), towingAreaId: area.id, point }] }];
    }
    // Protected area: operator pickup by default; a citizen may still walk it to the nearest designated parking.
    const zone = nearestDesignated(scooter.point);
    return [{ ...base, operatorPickup: true, destinations: [{ id: zone.id, name: `지정 PM 주차구역 ${zone.name}`, designated: true, distanceM: Math.round(zone.distanceM), towingAreaId: area.id, point: zone.point }] }];
  });
  const todayCount = state.missions.filter((m) => koreaDay(m.acceptedAt) === koreaDay(state.now)).length;
  const scooters = state.scooters.map((s) => { const area = !s.resolved && s.point && towingAreaAt(s.point); const reason = area ? reasonFor(area, s.id) : null;
    return { ...s, towingArea: area ? area.name : null, towingReason: reason, towingKind: reason ? towingRules[reason].kind : null }; });
  return { ...state, scooters, zones: zonesAt(state), offers, towingAreas: demoTowingAreas, designated: demoDesignated, towingSpots: demoTowingSpots, todayCount, operatorHandoffs: state.scooters.filter((s) => s.needsOperator).length, mode: 'demo' };
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
        Object.assign(state.scooters.find((s) => s.id === mission.scooterId), { needsOperator: true, handoff: true });
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
    requireValue(action.failUnlock === undefined || typeof action.failUnlock === 'boolean', '장치 시연 옵션이 올바르지 않습니다.', 400);
    requireValue(!action.failUnlock, '모의 장치 잠금 해제에 실패했습니다.', 502);
    const [exit] = offer.destinations;
    requireValue(action.destinationId === exit.id, '목적지가 올바르지 않습니다.', 400);
    const minutes = state.policy.deadlineMinutes + (exit.designated ? Math.ceil(exit.distanceM / (state.policy.walkMPerMin ?? demoPolicy.walkMPerMin)) : 0);
    const mission = { reason: offer.reason, kind: offer.rule.kind, clearM: offer.rule.clearM ?? null, destinationName: exit.name, id: randomUUID(), scooterId: scooter.id, originId: scooter.zoneId, destinationId: exit.id, towingAreaId: exit.towingAreaId, target: exit.point, status: 'moving', acceptedAt: state.now, expiresAt: new Date(timestamp(state.now) + minutes * 60_000).toISOString(), route: [scooter.point, exit.point], position: null, alarmed: false, verdict: null };
    state.missions.unshift(mission);
    event(state, 'unlock', `모의 잠금 해제 성공 · ${exit.name}으로 ${exit.distanceM}m 이동`, mission.id);
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
    scooter.needsOperator = true; scooter.handoff = true;
    event(state, 'handoff', '미션 취소 · 실제 기기 위치는 운영사 확인 필요', mission.id);
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
      if (origin && distanceM(action.point, origin.point) - action.accuracy > state.policy.arrivalRadiusM) scooter.zoneId = null;
      if (distanceToRouteM(action.point, mission.route) > state.policy.corridorM + action.accuracy) alarm(state, mission, '허용 이동 범위 이탈');
    }
    return mission;
  }
  requireValue(validPosition(state, mission.position), '최신의 정확한 도착 위치가 필요합니다.');
  // GPS error always counts against the citizen: a fix that might still be too close never completes the move.
  const { point, accuracy } = mission.position;
  if (mission.kind === 'clear') requireValue(distanceM(point, mission.route[0]) - accuracy >= mission.clearM, `${mission.reason}에서 ${mission.clearM}m 넘게 옮긴 위치로 확인되지 않습니다.`);
  else if (mission.kind === 'protected') requireValue(distanceM(point, mission.target) + accuracy <= state.policy.arrivalRadiusM, '지정 주차구역에 도착한 위치로 확인되지 않습니다.');
  else { const area = demoTowingAreas.find((a) => a.id === mission.towingAreaId); // missions saved before towing reasons existed
    requireValue(area && distanceM(point, area.point) - accuracy > area.radiusM, '견인 구역을 벗어난 위치로 확인되지 않습니다.'); }
  requireValue(action.photoPresent === true, '사진 증빙이 필요합니다.', 400);
  requireValue(['approved', 'rejected', 'uncertain'].includes(action.verdict), '사진 판정값이 올바르지 않습니다.', 400);
  mission.verdict = action.verdict;
  if (action.verdict !== 'approved') {
    mission.status = 'verifying';
    event(state, 'verification', `모의 사진 판정: ${action.verdict === 'rejected' ? '거절' : '판별 불가'} · 포인트 미지급`, mission.id);
    return mission;
  }
  mission.status = 'completed'; mission.completedAt = state.now;
  Object.assign(scooter, { zoneId: null, point: mission.target, lastMovedAt: state.now, needsOperator: false, handoff: false, resolved: true });
  state.points += state.policy.reward;
  event(state, 'reward', `이동 완료 · ${state.policy.reward.toLocaleString('ko-KR')} 시연 포인트 적립`, mission.id);
  return mission;
}
