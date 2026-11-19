import { readFileSync, statSync } from 'node:fs';
import { distanceM } from './engine.mjs';

const validPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite) && p[0] >= 37.3 && p[0] <= 37.8 && p[1] >= 126.7 && p[1] <= 127.3;

// Operator-verified S-DoT sensor positions; the official sDoTPeople API has no coordinates.
export function readSensorLocations(file = process.env.SDOT_SENSOR_FILE || 'data/sdot-sensors.json') {
  try {
    if (statSync(file).size > 1024 * 1024) throw Error();
    const data = JSON.parse(readFileSync(file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.sensors) || data.sensors.length > 5000) throw Error();
    const ids = new Set();
    for (const s of data.sensors) {
      if (typeof s.id !== 'string' || !s.id || s.id.length > 64 || ids.has(s.id) || !validPoint(s.point)) throw Error();
      ids.add(s.id);
    }
    return { status: 'ready', sensors: data.sensors.map(({ id, point }) => ({ id, point })) };
  } catch (error) { return { status: error.code === 'ENOENT' ? 'unconfigured' : 'error', sensors: [] }; }
}

// Greedy hotspot grouping: the busiest unassigned towing address seeds a candidate search area.
export function selectCandidates(towing, pedestrians, locations, { radiusM = 500, limit = 20 } = {}) {
  const base = { radiusM, towingStatus: towing.status, pedestrianStatus: pedestrians?.status ?? 'unconfigured', sensorLocationStatus: locations.status, from: towing.from ?? null, to: towing.to ?? null, candidates: [] };
  if (towing.status !== 'ready') return base;
  const open = towing.areas.filter((a) => a.geocodeStatus === 'matched').sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  base.unmappedTowingCount = towing.areas.reduce((sum, a) => sum + (a.geocodeStatus === 'matched' ? 0 : a.count), 0);
  const records = pedestrians?.status === 'ready' ? pedestrians.records : [];
  const positions = new Map(locations.sensors.map((s) => [s.id, s.point]));
  const districtSensors = records.filter((r) => r.district === '관악구').length;
  const candidates = [];
  while (open.length && candidates.length < limit) {
    const seed = open[0];
    const members = open.filter((a) => distanceM(seed.point, a.point) <= radiusM);
    for (const m of members) open.splice(open.indexOf(m), 1);
    const nearest = records.filter((r) => positions.has(r.id)).map((r) => ({ ...r, distanceM: Math.round(distanceM(seed.point, positions.get(r.id))) }))
      .filter((r) => r.distanceM <= radiusM).sort((a, b) => a.distanceM - b.distanceM)[0];
    candidates.push({
      id: seed.id, address: seed.address, point: seed.point,
      towingCount: members.reduce((sum, a) => sum + a.count, 0), addressCount: members.length,
      pedestrian: nearest
        ? { status: 'linked', sensorId: nearest.id, distanceM: nearest.distanceM, count: nearest.count, intervalMinutes: nearest.intervalMinutes, observedAt: nearest.observedAt, delayed: nearest.delayed ?? false }
        : { status: positions.size ? 'no-sensor-nearby' : 'location-unknown', districtSensors },
      // Width, space rights and a 15-minute count are not in public data, so no LOS verdict is made.
      evaluation: { status: 'unknown', reason: '보도 유효폭·공간 사용 권한·15분 보행량을 현장에서 확인해야 판정할 수 있습니다.' },
    });
  }
  return { ...base, candidates: candidates.sort((a, b) => b.towingCount - a.towingCount) };
}
