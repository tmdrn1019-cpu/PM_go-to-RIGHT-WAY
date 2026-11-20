import { readFileSync, statSync } from 'node:fs';
import { evaluateRelative, nextScheduledChange, distanceM, RELATIVE_POLICY, shareCutoff, losGrade } from './engine.mjs';

// User decisions (2026-11-20): no field survey; target Seoul's busiest 2025 towing hotspots; judge by each place's own
// station-hour crowding against Seoul-wide cut-offs (engine.evaluateRelative). Zones are snapped to the nearest Seoul-designated PM parking zone so the
// space is officially permitted, and crowding comes from the nearest subway station's hourly ridership (full day).
export const HOTSPOT_RULES = { spacingM: 300, snapM: 500, stationRadiusM: 1000, limit: 20, capacities: [10, 5], lengthM: 6, depthM: 1.2 };
// Sidewalk evidence (user choice 2026-11-20): shown next to the verdict, never used to decide it.
export const SIDEWALK_RULES = { radiusM: 300, parkedDepthM: 1.2 };
export const RIDERSHIP_SOURCE = { name: '서울시 지하철 역별 시간대별 승하차(일평균)', url: 'https://data.seoul.go.kr/dataList/OA-12252/S/1/datasetView.do' };

const check = (valid, message) => { if (!valid) throw new Error(message); };
const KST = 9 * 3_600_000;
const stationKey = (name) => String(name).replace(/\(.*?\)/g, '').replace(/역$/, '').trim();

// Station points from subwayStationMaster (lines averaged) and daily-average boardings+alightings per hour from CardSubwayTime.
export function stationProfiles(master, rides, days) {
  check(Number.isInteger(days) && days > 0, '월 일수가 필요합니다.');
  const points = new Map();
  for (const s of master) {
    const lat = Number(s.LAT); const lng = Number(s.LOT);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < 37.3 || lat > 37.8 || lng < 126.7 || lng > 127.3) continue;
    const key = stationKey(s.BLDN_NM); const p = points.get(key) ?? { lat: 0, lng: 0, n: 0 };
    p.lat += lat; p.lng += lng; p.n += 1; points.set(key, p);
  }
  const hours = new Map();
  for (const r of rides) {
    const key = stationKey(r.STTN); const sum = hours.get(key) ?? Array(24).fill(0);
    for (let h = 0; h < 24; h++) sum[h] += (Number(r[`HR_${h}_GET_ON_NOPE`]) || 0) + (Number(r[`HR_${h}_GET_OFF_NOPE`]) || 0);
    hours.set(key, sum);
  }
  return [...hours].filter(([key]) => points.has(key)).map(([name, sum]) => {
    const p = points.get(name);
    return { name, point: [p.lat / p.n, p.lng / p.n], hourly: sum.map((v) => Math.round(v / days)) };
  });
}

// Seoul-wide cut-offs over every station-hour with service (zero-ridership night hours excluded).
export function cityThresholds(stations, policy = RELATIVE_POLICY) {
  const hours = stations.flatMap((s) => s.hourly).filter((v) => v > 0).sort((a, b) => b - a);
  check(hours.length >= 24, '서울 기준선을 만들 역별 시간대 자료가 부족합니다.');
  return { ...policy, close: shareCutoff(hours, policy.closeShare), reduce: shareCutoff(hours, policy.reduceShare), stationHours: hours.length, stations: stations.length };
}

// A 6m x 1.2m strip centred on the zone point, laid east-west (orientation is an assumption).
function strip([lat, lng], lengthM, depthM) {
  const dy = depthM / 2 / 111_195; const dx = lengthM / 2 / (111_195 * Math.cos(lat * Math.PI / 180));
  return [[lat - dy, lng - dx], [lat + dy, lng - dx], [lat + dy, lng + dx], [lat - dy, lng + dx], [lat - dy, lng - dx]];
}
const nearest = (point, list, radius) => list.map((x) => ({ ...x, distanceM: distanceM(point, x.point) })).filter((x) => x.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM)[0];
const round1 = (v) => Math.round(v * 10) / 10;

// Nearest 2015 survey spot within radiusM: its busiest weekday hour as an hour-average flow over the full surveyed width,
// and over the width left after a parked device (depth is the zone strip assumption).
export function sidewalkEvidence(point, spots, rules = SIDEWALK_RULES) {
  const spot = nearest(point, spots.filter((s) => Array.isArray(s.point) && Number.isFinite(s.widthM) && s.widthM > 0 && s.hourly), rules.radiusM);
  const hours = spot && Object.entries(spot.hourly).map(([h, n]) => [Number(h), n]).filter(([h, n]) => Number.isInteger(h) && Number.isFinite(n) && n >= 0);
  if (!hours?.length) return null;
  const [peakHour, peakCount] = hours.sort((a, b) => b[1] - a[1] || a[0] - b[0])[0];
  const flow = peakCount / 60 / spot.widthM;
  const remainingWidthM = round1(spot.widthM - rules.parkedDepthM);
  const parkedFlow = remainingWidthM > 0 ? peakCount / 60 / remainingWidthM : null;
  return { year: 2015, spotName: spot.name, distanceM: Math.round(spot.distanceM), widthM: spot.widthM, walkway: spot.walkway ?? null, obstacle: spot.obstacle ?? null,
    peakHour, peakCount, flow: round1(flow), los: losGrade(flow), parkedDepthM: rules.parkedDepthM, remainingWidthM,
    parkedFlow: parkedFlow === null ? null : round1(parkedFlow), parkedLos: parkedFlow === null ? null : losGrade(parkedFlow) };
}
const total = (hourly) => hourly.reduce((a, b) => a + b, 0);

// areas: towing addresses with points; designated: Seoul PM parking zones with points; stations: stationProfiles().
export function buildHotspotZones({ areas, designated, stations, period, month, sidewalk = [], rules = HOTSPOT_RULES }) {
  const open = areas.filter((a) => Array.isArray(a.point)).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
  check(open.length, '좌표가 확인된 견인 주소가 없습니다.');
  check(designated.length && stations.length, '지정 주차구역과 지하철역 자료가 필요합니다.');
  const thresholds = cityThresholds(stations);
  const totals = stations.map((s) => total(s.hourly)).sort((a, b) => a - b);
  const medianStation = totals[Math.floor(totals.length / 2)];
  const hotspots = [];
  // Greedy grouping: the busiest unassigned address seeds a hotspot and absorbs addresses within spacingM.
  while (open.length) {
    const seed = open[0];
    const members = open.filter((a) => distanceM(seed.point, a.point) <= rules.spacingM);
    for (const m of members) open.splice(open.indexOf(m), 1);
    const zone = nearest(seed.point, designated, rules.snapM);
    const station = nearest(seed.point, stations, rules.stationRadiusM);
    // "혼잡이 많은 곳": the nearest station must carry at least the median daily ridership of Seoul stations.
    if (zone && station && total(station.hourly) >= medianStation) hotspots.push({ seed, zone, station, towingCount: members.reduce((sum, a) => sum + a.count, 0), addressCount: members.length });
  }
  const used = new Set();
  return hotspots.sort((a, b) => b.towingCount - a.towingCount).filter(({ zone }) => !used.has(zone.id) && used.add(zone.id)).slice(0, rules.limit)
    .map(({ seed, zone, station, towingCount, addressCount }) => ({
      id: `seoul-${zone.id}`, name: zone.name, address: zone.address, district: seed.district, point: zone.point,
      boundary: strip(zone.point, rules.lengthM, rules.depthM), vehicleTypes: ['scooter'], layouts: rules.capacities.map((capacity) => ({ capacity })), windows: [],
      hourlyCounts: Object.fromEntries(station.hourly.map((v, h) => [h, v])), thresholds,
      basis: { towingCount, addressCount, period, spacingM: rules.spacingM, hotspotAddress: seed.address, hotspotDistanceM: Math.round(zone.distanceM), stationName: station.name, stationDistanceM: Math.round(station.distanceM), month, sidewalk: sidewalkEvidence(zone.point, sidewalk) } }));
}

// Synthetic demo devices (user choice 2026-11-20): Seoul has no public PM positions, so devices are scattered around real
// towing addresses. riskRadiusM reuses the mobile demo's towing-area radius; it is an assumption, not a legal no-parking boundary.
export const SYNTHETIC_RULES = { hotspots: 50, perCount: 40, maxPerHotspot: 6, spreadM: 80, riskRadiusM: 30, designatedEvery: 3 };
function seededRandom(text) {
  let a = 0; for (const c of String(text)) a = Math.imul(a ^ c.charCodeAt(0), 2654435761);
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const offset = ([lat, lng], meters, angle) => [lat + meters * Math.cos(angle) / 111_195, lng + meters * Math.sin(angle) / (111_195 * Math.cos(lat * Math.PI / 180))];
export function syntheticFleet({ hotspots, designated, rules = SYNTHETIC_RULES }) {
  const spots = hotspots.filter((h) => Array.isArray(h.point)).sort((a, b) => b.count - a.count);
  const placed = [];
  for (const h of spots.slice(0, rules.hotspots)) {
    const random = seededRandom(h.address);
    const n = Math.min(rules.maxPerHotspot, Math.max(1, Math.ceil(h.count / rules.perCount)));
    for (let i = 0; i < n; i++) placed.push({ point: offset(h.point, random() * rules.spreadM, random() * 2 * Math.PI), designatedId: null });
  }
  designated.forEach((d, i) => { if (i % rules.designatedEvery === 0) placed.push({ point: d.point, designatedId: d.id }); });
  // A device parked in a designated zone is legally parked, so it is never a towing risk even next to a towing address.
  return placed.map((v, i) => ({ id: `SIM-${String(i + 1).padStart(4, '0')}`, point: v.point, designatedId: v.designatedId, risk: v.designatedId ? null : towingRisk(v.point, spots, rules.riskRadiusM) }));
}
export function towingRisk(point, hotspots, radiusM = SYNTHETIC_RULES.riskRadiusM) {
  const near = nearest(point, hotspots.filter((h) => Array.isArray(h.point)), radiusM);
  return near ? { address: near.address, district: near.district ?? null, towingCount: near.count, distanceM: Math.round(near.distanceM) } : null;
}

const validPoint = (p) => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
export function readPublicZones(file = process.env.PUBLIC_ZONES_FILE || 'data/public-zones.json') {
  try {
    check(statSync(file).size <= 2 * 1024 * 1024, 'size');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    check(data.version === 5 && Array.isArray(data.zones) && data.zones.length > 0 && data.zones.length <= 200 && Array.isArray(data.designated) && data.designated.length <= 2000 && Array.isArray(data.towingHotspots) && data.towingHotspots.length <= 2000, 'shape');
    for (const z of data.zones) check(typeof z.id === 'string' && Array.isArray(z.point) && Array.isArray(z.boundary) && Array.isArray(z.layouts) && z.layouts.length && z.hourlyCounts && typeof z.hourlyCounts === 'object' && z.basis && z.thresholds, 'zone');
    for (const d of data.designated) check(typeof d.id === 'string' && typeof d.name === 'string' && validPoint(d.point), 'designated');
    for (const h of data.towingHotspots) check(typeof h.address === 'string' && Number.isFinite(h.count) && h.count > 0 && validPoint(h.point), 'hotspot');
    return { status: 'ready', builtAt: data.builtAt, month: data.month, period: data.period, zones: data.zones, designated: data.designated, towingHotspots: data.towingHotspots };
  } catch (error) { return { status: error.code === 'ENOENT' ? 'unconfigured' : 'error', zones: [], designated: [], towingHotspots: [] }; }
}

// Verdicts at a moment from the shared engine; parked/available stay unknown until an operator shares inventory.
export function publicZonesAt(zones, at) {
  return zones.map((zone) => {
    const result = evaluateRelative(zone, at);
    const hour = new Date(new Date(at).getTime() + KST).getUTCHours();
    return { ...zone, ...result, currentPedestrianCount15Min: null, crowdCount: zone.hourlyCounts[hour] ?? null, crowdLabel: `${zone.basis.stationName}역 ${hour}시 승하차(일평균)`,
      parked: null, available: null, nextChange: nextScheduledChange(zone, at), observedAt: new Date(at).toISOString(),
      observationSource: `${RIDERSHIP_SOURCE.name} ${zone.basis.month} · ${zone.basis.stationName}역(${zone.basis.stationDistanceM}m)` };
  });
}
