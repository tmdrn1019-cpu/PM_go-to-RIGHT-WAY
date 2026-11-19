import { readFileSync, statSync } from 'node:fs';
import { evaluateZone, nextScheduledChange } from './engine.mjs';

const text = (value, max = 150) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const point = (value) => Array.isArray(value) && value.length === 2 && value.every(Number.isFinite) && Math.abs(value[0]) <= 90 && Math.abs(value[1]) <= 180;
const date = (value) => typeof value === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const integer = (value) => Number.isSafeInteger(value) && value >= 0;
const check = (valid) => { if (!valid) throw new TypeError('운영 데이터 형식을 확인하세요.'); };
function polygon(value) {
  if (!Array.isArray(value) || value.length < 4 || value.length > 200 || !value.every(point) || value[0][0] !== value.at(-1)[0] || value[0][1] !== value.at(-1)[1]) return false;
  const relative = value.map(([lat, lng]) => [lat - value[0][0], lng - value[0][1]]);
  const span = (axis) => Math.max(...relative.map((p) => p[axis])) - Math.min(...relative.map((p) => p[axis]));
  const area = relative.slice(1).reduce((sum, end, index) => sum + relative[index][0] * end[1] - end[0] * relative[index][1], 0);
  // Floating-point noise must not turn a line into a parking polygon.
  return Math.abs(area) > span(0) * span(1) * 1e-10;
}
const fresh = (record, now) => record && date(record.observedAt) && date(record.validUntil) && Date.parse(record.observedAt) <= now && now < Date.parse(record.validUntil);

function emptyState(status, at) {
  return { status, generatedAt: new Date(at).toISOString(), expiresAt: null, sourceUpdatedAt: null, sourceName: null, zones: [], refreshIntervalMs: 15_000, capabilities: { missionAcceptance: false }, messages: { missions: '이동 미션은 운영사 연결과 이용자 인증 준비 후 제공됩니다.' } };
}

export function evaluateServiceFeed(feed, at = new Date().toISOString()) {
  check(date(at) && feed?.version === 1 && text(feed.sourceName) && date(feed.publishedAt) && Array.isArray(feed.zones) && feed.zones.length <= 1000);
  const now = Date.parse(at);
  check(Date.parse(feed.publishedAt) <= now);
  const profile = feed.profile;
  if (profile) check(text(profile.name) && text(profile.source, 1000) && /^https?:\/\//.test(profile.source) && profile.unit === '명/분/m' && Array.isArray(profile.bounds) && profile.bounds.length === 5 && profile.bounds.every((n, i, values) => Number.isFinite(n) && n > (i ? values[i - 1] : 0)));
  const ids = new Set();
  const zones = feed.zones.map((zone) => {
    check(zone && text(zone.id, 64) && !ids.has(zone.id) && text(zone.name, 100) && text(zone.address, 200) && point(zone.point) && polygon(zone.boundary));
    ids.add(zone.id);
    check(Array.isArray(zone.vehicleTypes) && zone.vehicleTypes.length > 0 && zone.vehicleTypes.length <= 2 && zone.vehicleTypes.every((type) => ['scooter', 'ebike'].includes(type)));
    check(Array.isArray(zone.layouts) && zone.layouts.length > 0 && zone.layouts.length <= 100 && zone.layouts.every((layout) => Number.isInteger(layout.capacity) && layout.capacity > 0 && layout.capacity <= 1000 && Number.isFinite(layout.effectiveWidthM) && layout.effectiveWidthM > 0 && (!layout.boundary || polygon(layout.boundary))));
    check(new Set(zone.layouts.map((layout) => layout.capacity)).size === zone.layouts.length);
    check(Array.isArray(zone.windows) && zone.windows.length <= 14 && zone.windows.every((window) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window.start) && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(window.end) && (!window.days || (Array.isArray(window.days) && window.days.length > 0 && window.days.every((day) => Number.isInteger(day) && day >= 0 && day <= 6)))));
    if (zone.preClose) check(integer(zone.preClose.minutes) && zone.preClose.minutes <= 1440 && integer(zone.preClose.capacity));
    const observation = zone.observation;
    const inventory = zone.inventory;
    const countValid = Number.isFinite(observation?.pedestrianCount15Min) && observation.pedestrianCount15Min >= 0;
    const inventoryValid = fresh(inventory, now) && integer(inventory.parked) && integer(inventory.reserved);
    let reason = null;
    if (zone.parkingAuthorized !== true) reason = '주차 공간의 사용 승인이 확인되지 않았습니다.';
    else if (zone.vehicleTypes.length > 1 && zone.capacityAppliesToAllTypes !== true) reason = '기기 종류별 공간을 반영한 공통 수용량을 확인하고 있습니다.';
    else if (profile?.approvedForService !== true) reason = '운영에 적용할 보행 기준을 확인하고 있습니다.';
    else if (!fresh(observation, now) || !countValid) reason = '최신 보행량을 확인하고 있습니다.';
    else if (!inventoryValid) reason = '최신 주차·예약 현황을 확인하고 있습니다.';
    const result = evaluateZone({ layouts: zone.layouts, windows: zone.windows, preClose: zone.preClose, pedestrianCount15Min: reason ? undefined : observation.pedestrianCount15Min }, at, profile);
    const selected = zone.layouts.find((layout) => layout.capacity === result.capacity);
    const nextChange = nextScheduledChange(zone, at);
    const flow = result.selectedFlow ?? result.flow;
    const grade = flow === null ? -1 : profile.bounds.findIndex((bound) => flow <= bound + 1e-9);
    const validUntil = reason ? null : new Date(Math.min(Date.parse(observation.validUntil), Date.parse(inventory.validUntil), nextChange ? Date.parse(nextChange.at) : Infinity)).toISOString();
    return {
      id: zone.id, name: zone.name, address: zone.address, point: [...zone.point], vehicleTypes: [...new Set(zone.vehicleTypes)],
      boundary: selected?.boundary ?? zone.boundary,
      status: reason ? 'unknown' : result.status, capacity: reason ? 0 : result.capacity,
      available: reason ? 0 : Math.max(0, result.capacity - inventory.parked - inventory.reserved),
      parked: inventoryValid ? inventory.parked : null, reserved: inventoryValid ? inventory.reserved : null,
      los: flow === null ? null : 'ABCDEF'[grade < 0 ? 5 : grade], flow, triggerLos: result.los, effectiveWidthM: result.effectiveWidthM, nextChange, validUntil,
      reason: reason ?? result.reason, observedAt: date(observation?.observedAt) ? observation.observedAt : null,
      observationSource: text(observation?.source) ? observation.source : null,
      pedestrianCount15Min: countValid ? observation.pedestrianCount15Min : null,
      inventoryObservedAt: date(inventory?.observedAt) ? inventory.observedAt : null,
    };
  });
  const deadlines = zones.filter((zone) => zone.validUntil).map((zone) => Date.parse(zone.validUntil));
  return { ...emptyState('ready', at), expiresAt: deadlines.length ? new Date(Math.min(...deadlines)).toISOString() : null, sourceUpdatedAt: feed.publishedAt, sourceName: feed.sourceName, zones };
}

export function readServiceFeed(file, at = new Date().toISOString()) {
  if (!file) return emptyState('unconfigured', at);
  try {
    const stat = statSync(file); check(stat.isFile() && stat.size <= 2 * 1024 * 1024);
    return evaluateServiceFeed(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), at);
  } catch { return emptyState('error', at); }
}
