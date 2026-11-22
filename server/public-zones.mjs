import { readFileSync, statSync } from 'node:fs';
import { evaluateZone, evaluateRelative, evaluatePenalty, distanceM, LOS_REFERENCE, RELATIVE_POLICY, shareCutoff } from './engine.mjs';

// User decision (2026-11-21): zones are map areas like an operator app's return zones: OSM land-use polygons
// (residential, commercial, retail blocks) are open by default and close or shrink when crowded. Crowding is checked two
// ways and the stricter wins: the nearest subway station's hourly ridership against Seoul-wide station-hour cut-offs
// (engine.evaluateRelative) and the nearest 2015 sidewalk survey's walking LOS (engine.evaluateZone). Towing data is not used.
// User request (2026-11-21): zones appear only where and when it is crowded and stay small, so each land-use area is cut
// on a cellM grid (pieces keep the real outline) and only pieces near a crowd source are kept: within stationRadiusM of a
// station or spotRadiusM of a usable 2015 survey spot. Radii and cell size are assumptions.
export const AREA_RULES = { cellM: 100, minPieceM2: 300, minAreaM2: 3_000, maxAreaM2: 2_000_000, stationRadiusM: 300, spotRadiusM: 150,
  // Assumed layouts for the LOS check: 10 devices at right angles take 1.2m of sidewalk, 5 parallel to the kerb take 0.6m.
  layouts: [{ capacity: 10, depthM: 1.2 }, { capacity: 5, depthM: 0.6 }] };
// Map area (user choice 2026-11-21, to keep the map responsive): survey spot ids start with the Seoul district code.
export const ZONE_DISTRICTS = { '20': '동작구', '21': '관악구', '22': '서초구', '23': '강남구' };
export const inZoneDistricts = (place) => typeof place.id === 'string' && /^[0-9][0-9]-/.test(place.id) ? place.id.slice(0, 2) in ZONE_DISTRICTS
  : Object.values(ZONE_DISTRICTS).some((gu) => place.district === gu || String(place.address ?? '').includes(` ${gu} `));
export const SIDEWALK_SOURCE = { name: '서울시 유동인구조사 2015(조사지점·관찰조사)', url: 'https://data.seoul.go.kr/dataList/OA-21707/F/1/datasetView.do' };
export const RIDERSHIP_SOURCE = { name: '서울시 지하철 역별 시간대별 승하차(일평균)', url: 'https://data.seoul.go.kr/dataList/OA-12252/S/1/datasetView.do' };
export const OSM_SOURCE = { name: 'OpenStreetMap 토지이용 구역(landuse=residential·commercial·retail)', url: 'https://www.openstreetmap.org/copyright' };
const LANDUSE = { residential: '주거', commercial: '상업', retail: '판매' };

const check = (valid, message) => { if (!valid) throw new Error(message); };
const KST = 9 * 3_600_000;
const M = 111_195;
const round1 = (v) => Math.round(v * 10) / 10;
const nearest = (point, list, radius) => list.map((x) => ({ ...x, distanceM: distanceM(point, x.point) })).filter((x) => x.distanceM <= radius).sort((a, b) => a.distanceM - b.distanceM)[0];
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

// Seoul-wide cut-offs over every station-hour with service (zero-ridership night hours excluded); the median is the penalty
// zones' floor for a partial opening.
export function cityThresholds(stations, policy = RELATIVE_POLICY) {
  const hours = stations.flatMap((s) => s.hourly).filter((v) => v > 0).sort((a, b) => b - a);
  check(hours.length >= 24, '서울 기준선을 만들 역별 시간대 자료가 부족합니다.');
  return { ...policy, close: shareCutoff(hours, policy.closeShare), reduce: shareCutoff(hours, policy.reduceShare), median: hours[Math.floor(hours.length / 2)], stationHours: hours.length, stations: stations.length };
}

// Area (m²) and centroid of a closed ring, on a local metre grid.
export function ringStats(ring) {
  const origin = ring[0]; const cos = Math.cos(origin[0] * Math.PI / 180);
  const xy = ring.map(([lat, lng]) => [(lng - origin[1]) * M * cos, (lat - origin[0]) * M]);
  let a = 0; let cx = 0; let cy = 0;
  for (let i = 0; i + 1 < xy.length; i++) {
    const [x0, y0] = xy[i]; const [x1, y1] = xy[i + 1]; const c = x0 * y1 - x1 * y0;
    a += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
  }
  if (!a) return { areaM2: 0, centroid: origin };
  return { areaM2: Math.abs(a / 2), centroid: [origin[0] + cy / (3 * a) / M, origin[1] + cx / (3 * a) / (M * cos)] };
}

const usableSpot = (s) => Array.isArray(s.point) && Number.isFinite(s.widthM) && s.widthM > 0 && s.hourly && typeof s.hourly === 'object';
// Hour totals to an average 15-minute count (the survey has no 15-minute peaks, so real peaks are higher).
const quarterCounts = (hourly) => Object.fromEntries(Object.entries(hourly).map(([h, n]) => [Number(h), Number(n)])
  .filter(([h, n]) => Number.isInteger(h) && h >= 0 && h < 24 && Number.isFinite(n) && n >= 0).map(([h, n]) => [h, round1(n / 4)]));
// Only layouts that leave 2m: a narrow surveyed sidewalk must not close a whole block for good.
const layoutsFor = (widthM, rules) => rules.layouts.map(({ capacity, depthM }) => ({ capacity, depthM, effectiveWidthM: round1(widthM - depthM) })).filter((l) => l.effectiveWidthM >= 2);

// Fixed metre grid over Seoul (equirectangular around this origin; error is far below a metre per 100m cell here).
const GRID_ORIGIN = [37.5, 127.0];
const GRID_COS = Math.cos(GRID_ORIGIN[0] * Math.PI / 180);
const gridXY = ([lat, lng]) => [(lng - GRID_ORIGIN[1]) * M * GRID_COS, (lat - GRID_ORIGIN[0]) * M];
const gridLL = ([x, y]) => [Math.round((GRID_ORIGIN[0] + y / M) * 1e6) / 1e6, Math.round((GRID_ORIGIN[1] + x / (M * GRID_COS)) * 1e6) / 1e6];
// Sutherland-Hodgman against an axis-aligned box: exact for any subject polygon because the box is convex.
export function clipToBox(points, [x0, y0, x1, y1]) {
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + (b[1] - a[1]) * (x0 - a[0]) / (b[0] - a[0])]],
    [(p) => p[0] <= x1, (a, b) => [x1, a[1] + (b[1] - a[1]) * (x1 - a[0]) / (b[0] - a[0])]],
    [(p) => p[1] >= y0, (a, b) => [a[0] + (b[0] - a[0]) * (y0 - a[1]) / (b[1] - a[1]), y0]],
    [(p) => p[1] <= y1, (a, b) => [a[0] + (b[0] - a[0]) * (y1 - a[1]) / (b[1] - a[1]), y1]]];
  let out = points;
  for (const [inside, cross] of edges) {
    const input = out; out = [];
    input.forEach((cur, i) => {
      const prev = input[(i + input.length - 1) % input.length];
      if (inside(cur)) { if (!inside(prev)) out.push(cross(prev, cur)); out.push(cur); } else if (inside(prev)) out.push(cross(prev, cur));
    });
    if (!out.length) break;
  }
  return out;
}
// Pieces of a closed lat/lng ring, one per grid cell it touches, as closed lat/lng rings.
export function gridPieces(ring, cellM) {
  const xy = ring.slice(0, -1).map(gridXY);
  const xs = xy.map((p) => p[0]); const ys = xy.map((p) => p[1]);
  const pieces = [];
  for (let cx = Math.floor(Math.min(...xs) / cellM); cx * cellM < Math.max(...xs); cx++) {
    for (let cy = Math.floor(Math.min(...ys) / cellM); cy * cellM < Math.max(...ys); cy++) {
      const piece = clipToBox(xy, [cx * cellM, cy * cellM, (cx + 1) * cellM, (cy + 1) * cellM]);
      if (piece.length >= 3) pieces.push({ cell: `${cx}_${cy}`, ring: [...piece, piece[0]].map(gridLL) });
    }
  }
  return pieces;
}

// areas: [{ id, landuse, name?, ring: [[lat,lng],...closed] }] from OSM; spots: data/sidewalk-2015.json; stations: stationProfiles().
export function buildAreaZones({ areas, spots, stations, month, rules = AREA_RULES }) {
  const usable = spots.filter(usableSpot);
  check(usable.length && stations.length, '보도 조사 지점과 지하철역 자료가 필요합니다.');
  const thresholds = cityThresholds(stations);
  const zones = [];
  for (const a of areas) {
    if (!Array.isArray(a.ring) || a.ring.length < 4 || !(a.landuse in LANDUSE)) continue;
    const whole = ringStats(a.ring);
    if (whole.areaM2 < rules.minAreaM2 || whole.areaM2 > rules.maxAreaM2) continue;
    const kept = [];
    for (const piece of gridPieces(a.ring, rules.cellM)) {
      const { areaM2, centroid } = ringStats(piece.ring);
      if (areaM2 < rules.minPieceM2) continue;
      // District by the nearest survey spot anywhere in Seoul (its id carries the district code).
      const home = nearest(centroid, usable, Infinity);
      if (!home || !inZoneDistricts(home)) continue;
      const spot = home.distanceM <= rules.spotRadiusM ? home : null;
      const layouts = spot ? layoutsFor(spot.widthM, rules) : [];
      const station = nearest(centroid, stations, rules.stationRadiusM);
      // A piece with no crowd source nearby can never close, so it never becomes a zone.
      if (!station && !layouts.length) continue;
      kept.push({ id: `area-${a.id}-${piece.cell}`, kind: 'area', name: a.name || `${LANDUSE[a.landuse]} 구역 ${a.id}`, address: null, district: ZONE_DISTRICTS[home.id.slice(0, 2)],
        point: centroid.map((v) => Math.round(v * 1e6) / 1e6), boundary: piece.ring, vehicleTypes: ['scooter'], windows: [],
        layouts: rules.layouts.map(({ capacity }) => ({ capacity })), thresholds,
        station: station ? { name: station.name, distanceM: Math.round(station.distanceM), hourly: station.hourly, month } : null,
        walk: layouts.length ? { spotName: spot.name, distanceM: Math.round(spot.distanceM), widthM: spot.widthM, walkway: spot.walkway ?? null, obstacle: spot.obstacle ?? null, layouts, hourlyCounts: quarterCounts(spot.hourly) } : null,
        basis: { landuse: a.landuse, areaM2: Math.round(areaM2), osmId: a.id, cellM: rules.cellM } });
    }
    // Pieces of one block share its name, so number them for the list.
    kept.forEach((z, i) => zones.push(kept.length > 1 ? { ...z, name: `${z.name} ${i + 1}/${kept.length}` } : z));
  }
  return zones;
}

const severity = { open: 0, reduced: 1, closed: 2 };
// Both checks at one moment; the stricter verdict wins. With neither available the area stays open by default (user policy).
export function evaluateArea(zone, at) {
  const hour = new Date(new Date(at).getTime() + KST).getUTCHours();
  const parts = [];
  if (zone.station) {
    const r = evaluateRelative({ hourlyCounts: Object.fromEntries(zone.station.hourly.map((v, h) => [h, v])), layouts: zone.layouts, thresholds: zone.thresholds }, at);
    parts.push({ ...r, label: `${zone.station.name}역(${zone.station.distanceM}m)` });
  }
  if (zone.walk?.layouts.length && zone.walk.hourlyCounts[hour] !== undefined) {
    const r = evaluateZone({ hourlyCounts: zone.walk.hourlyCounts, layouts: zone.walk.layouts, windows: [] }, at, LOS_REFERENCE);
    parts.push({ ...r, label: `보도 「${zone.walk.spotName}」(${zone.walk.distanceM}m)`, reason: r.flow === null ? r.reason : `15분 보행량 ${r.currentPedestrianCount15Min}명 → ${round1(r.flow)}명/분/m, LOS ${r.los}. ${r.reason}` });
  }
  const known = parts.filter((p) => p.status in severity);
  const capacity0 = Math.max(...zone.layouts.map((l) => l.capacity));
  if (!known.length) return { status: 'open', capacity: capacity0, los: null, defaultOpen: true, crowdCount: null, checks: [], reason: '이 시간 혼잡 자료가 없어 기본 개방합니다(가정).' };
  const worst = known.reduce((a, b) => (severity[b.status] > severity[a.status] ? b : a));
  const walk = known.find((p) => p.los);
  return { status: worst.status, capacity: Math.min(...known.map((p) => p.capacity)), los: walk?.los ?? null, defaultOpen: false,
    crowdCount: zone.station?.hourly[hour] ?? null, checks: known.map((p) => ({ label: p.label, status: p.status, reason: p.reason })),
    reason: `${worst.label}: ${worst.reason}` };
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
// Parsed and validated once per file version: the maps poll every second and the file is ~2MB.
let cached = null;
export function readPublicZones(file = process.env.PUBLIC_ZONES_FILE || 'data/public-zones.json') {
  try {
    const stat = statSync(file);
    const key = `${file}:${stat.mtimeMs}:${stat.size}`;
    if (cached?.key === key) return cached.value;
    const value = parsePublicZones(file, stat);
    cached = { key, value };
    return value;
  } catch (error) { return { status: error.code === 'ENOENT' ? 'unconfigured' : 'error', zones: [], penaltyZones: [], designated: [], towingHotspots: [] }; }
}
function parsePublicZones(file, stat) {
  try {
    check(stat.size <= 16 * 1024 * 1024, 'size');
    const data = JSON.parse(readFileSync(file, 'utf8'));
    check(data.version === 7 && Array.isArray(data.zones) && data.zones.length > 0 && data.zones.length <= 5000 && Array.isArray(data.designated) && data.designated.length <= 2000 && Array.isArray(data.towingHotspots) && data.towingHotspots.length <= 2000, 'shape');
    for (const z of data.zones) check(typeof z.id === 'string' && validPoint(z.point) && Array.isArray(z.boundary) && z.boundary.length >= 4 && z.boundary.every(validPoint) && Array.isArray(z.layouts) && z.layouts.length && z.thresholds && z.basis, 'zone');
    for (const d of data.designated) check(typeof d.id === 'string' && typeof d.name === 'string' && validPoint(d.point), 'designated');
    for (const h of data.towingHotspots) check(typeof h.address === 'string' && Number.isFinite(h.count) && h.count > 0 && validPoint(h.point), 'hotspot');
    const penaltyZones = data.penaltyZones ?? [];
    check(Array.isArray(penaltyZones) && penaltyZones.length <= 2000, 'penalty');
    for (const z of penaltyZones) check(typeof z.id === 'string' && validPoint(z.point) && Array.isArray(z.boundary) && z.boundary.length >= 4 && z.boundary.every(validPoint) && Array.isArray(z.station?.hourly) && z.station.hourly.length === 24 && z.thresholds, 'penalty zone');
    return { status: 'ready', builtAt: data.builtAt, month: data.month ?? null, period: data.period, zones: data.zones, penaltyZones, designated: data.designated, towingHotspots: data.towingHotspots };
  } catch (error) { return { status: error.code === 'ENOENT' ? 'unconfigured' : 'error', zones: [], penaltyZones: [], designated: [], towingHotspots: [] }; }
}

// Verdicts at a moment; parked/available stay unknown until an operator shares inventory.
export function publicZonesAt(zones, at) {
  return zones.map((zone) => {
    const { station, walk, ...rest } = zone;
    const result = evaluateArea(zone, at);
    return { ...rest, ...result, crowdLabel: station ? `${station.name}역 ${new Date(new Date(at).getTime() + KST).getUTCHours()}시 승하차(일평균)` : null,
      basis: { ...zone.basis, station: station && { name: station.name, distanceM: station.distanceM, month: station.month }, walk: walk && { spotName: walk.spotName, distanceM: walk.distanceM, widthM: walk.widthM, walkway: walk.walkway, obstacle: walk.obstacle, losUsable: walk.layouts.length > 0 } },
      parked: null, available: null, nextChange: null, observedAt: new Date(at).toISOString(),
      observationSource: [station && `${RIDERSHIP_SOURCE.name} ${station.month}`, walk && SIDEWALK_SOURCE.name, `구역 모양 ${OSM_SOURCE.name}`].filter(Boolean).join(' · ') };
  });
}

// Pivot (2026-11-22): penalty zones are the operator app's no-return areas around towing hotspots, drawn as square grid cells
// like a rental app's map (user request): every cellM cell touched by a radiusM circle around a towing address within
// stationRadiusM of a station. Cells shared by several addresses merge. Radii, cell size and the district limit are
// assumptions (the demo area is 강남구 by user request); a cell is not a legal no-parking boundary. The same cell is the
// "towing risk area" where a return needs a photo.
export const PENALTY_RULES = { stationRadiusM: 300, radiusM: SYNTHETIC_RULES.riskRadiusM, cellM: 50, districts: ['강남구'] };
const shortAddress = (address) => String(address).replace(/^서울특별시\s+\S+구\s+/, '');
export function buildPenaltyZones({ hotspots, stations, month, rules = PENALTY_RULES }) {
  check(stations.length, '지하철역 자료가 필요합니다.');
  const thresholds = cityThresholds(stations);
  const cells = new Map();
  for (const h of hotspots) {
    if (!validPoint(h.point) || !rules.districts.includes(h.district)) continue;
    const station = nearest(h.point, stations, rules.stationRadiusM);
    if (!station) continue;
    const [x, y] = gridXY(h.point); const r = rules.radiusM; const c = rules.cellM;
    for (let cx = Math.floor((x - r) / c); cx <= Math.floor((x + r) / c); cx++) {
      for (let cy = Math.floor((y - r) / c); cy <= Math.floor((y + r) / c); cy++) {
        // Nearest point of the cell to the address: the circle touches the cell when it is within r.
        const dx = Math.max(cx * c - x, 0, x - (cx + 1) * c); const dy = Math.max(cy * c - y, 0, y - (cy + 1) * c);
        if (Math.hypot(dx, dy) > r) continue;
        const key = `${cx}_${cy}`; const cell = cells.get(key) ?? { key, cx, cy, hotspots: [], station };
        cell.hotspots.push(h); if (station.distanceM < cell.station.distanceM) cell.station = station;
        cells.set(key, cell);
      }
    }
  }
  return [...cells.values()].map(({ key, cx, cy, hotspots: hs, station }) => {
    const c = rules.cellM; const [south, west] = gridLL([cx * c, cy * c]); const [north, east] = gridLL([(cx + 1) * c, (cy + 1) * c]);
    const top = [...hs].sort((a, b) => b.count - a.count)[0];
    return { id: `penalty-${key}`, kind: 'penalty', name: `${shortAddress(top.address)} 주변 칸`, address: top.address, district: top.district,
      towingCount: hs.reduce((sum, h) => sum + h.count, 0), towingAddresses: hs.map((h) => ({ address: h.address, count: h.count })),
      point: [Math.round((south + north) / 2 * 1e6) / 1e6, Math.round((west + east) / 2 * 1e6) / 1e6], bounds: [south, west, north, east],
      boundary: [[south, west], [north, west], [north, east], [south, east], [south, west]], cellM: c, thresholds,
      station: { name: station.name, distanceM: Math.round(station.distanceM), hourly: station.hourly, month } };
  }).sort((a, b) => b.towingCount - a.towingCount || a.id.localeCompare(b.id)).map((z, _i, all) => {
    // Cells around one address share its name, so number them for the list.
    const same = all.filter((o) => o.name === z.name);
    return same.length > 1 ? { ...z, name: `${z.name} ${same.indexOf(z) + 1}/${same.length}` } : z;
  });
}
export const inCell = ([lat, lng], [south, west, north, east]) => lat >= south && lat <= north && lng >= west && lng <= east;
export function penaltyZonesAt(zones, at) {
  const hour = new Date(new Date(at).getTime() + KST).getUTCHours();
  return zones.map(({ station, ...zone }) => ({ ...zone, ...evaluatePenalty({ hourly: station.hourly, thresholds: zone.thresholds }, at), vehicleTypes: ['scooter'],
    crowdLabel: `${station.name}역(${station.distanceM}m) ${hour}시 승하차(일평균)`, basis: { station: { name: station.name, distanceM: station.distanceM, month: station.month } },
    observedAt: new Date(at).toISOString(), observationSource: `${RIDERSHIP_SOURCE.name} ${station.month} · 서울시 전동킥보드 견인 현황 2025` }));
}
