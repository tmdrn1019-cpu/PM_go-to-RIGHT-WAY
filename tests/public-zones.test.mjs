import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { buildAreaZones, buildPenaltyZones, inCell, evaluateArea, ringStats, clipToBox, gridPieces, stationProfiles, readPublicZones, syntheticFleet, towingRisk, SYNTHETIC_RULES, inZoneDistricts } from '../server/public-zones.mjs';
import { distanceM } from '../server/engine.mjs';
import { createServiceApp } from '../server/service-app.mjs';

const designated = [{ id: 'pk-1', name: '역삼역 8번 출구', address: '서울특별시 강남구 역삼동 679-5', point: [37.5012, 127.0365] }, { id: 'pk-2', name: '외곽 구역', address: 'x', point: [37.60, 127.10] }];
const areas = [
  { id: 'a1', address: '서울특별시 강남구 역삼동 804', district: '강남구', count: 478, point: [37.501, 127.036] },
  { id: 'a2', address: '서울특별시 강남구 역삼동 805', district: '강남구', count: 50, point: [37.5015, 127.0362] },
];
const east = (m) => m / (111_195 * Math.cos(37.5 * Math.PI / 180));
const north = (m) => m / 111_195;
const square = (id, [lat, lng], sideM, landuse = 'residential', name = null) => ({ id, landuse, name, ring: [[lat, lng], [lat + north(sideM), lng], [lat + north(sideM), lng + east(sideM)], [lat, lng + east(sideM)], [lat, lng]] });
const ride = (STTN, perHour) => Object.fromEntries([['STTN', STTN], ...Array.from({ length: 24 }, (_, h) => [[`HR_${h}_GET_ON_NOPE`, perHour(h) * 30], [`HR_${h}_GET_OFF_NOPE`, 0]]).flat()]);
const master = [{ BLDN_NM: '역삼', LAT: '37.500', LOT: '127.036' }, { BLDN_NM: '역삼', LAT: '37.502', LOT: '127.036' }, { BLDN_NM: '한적', LAT: '37.56', LOT: '126.92' }];
// 역삼 100..2400 per hour, 한적 1 each: 48 station-hours, top 5% = 2200 (close), top 15% = 1700 (reduce).
const stations = stationProfiles(master, [ride('역삼(구청)', (h) => (h + 1) * 100), ride('한적', () => 1)], 30);
// 15-minute count from hourly/4; base layout (10 devices) leaves 4 - 1.2 = 2.8m.
const perHour = (flow, widthM) => Math.round(flow * 15 * widthM * 4);
const spot = { id: '23-001', name: '역삼 조사 지점', point: [37.5012, 127.0365], widthM: 4, hourly: { 8: perHour(10, 2.8), 12: perHour(60, 2.8), 13: perHour(80, 2.8) } };
const farSpot = { id: '23-002', name: '먼 지점', point: [37.5150, 127.0600], widthM: 4, hourly: { 8: 10 } };
const mapo = { id: '14-001', name: '마포 지점', point: [37.56, 126.92], widthM: 4, hourly: { 8: 10 } };
const areaList = [square(1, [37.5008, 127.0360], 100, 'residential', '역삼 아파트'), square(2, [37.5150, 127.0600], 100, 'commercial'),
  square(3, [37.56, 126.92], 100), square(4, [37.5008, 127.0360], 20), square(5, [37.5008, 127.0360], 100, 'industrial'),
  square(6, [37.5150 + north(400), 127.0600], 100)]; // in 강남 but 400m from any station or spot: never a crowd zone

test('ring stats give area and centroid of a closed ring', () => {
  const { areaM2, centroid } = ringStats(square(1, [37.5, 127.0], 100).ring);
  assert.ok(Math.abs(areaM2 - 10_000) < 50, String(areaM2));
  assert.ok(distanceM(centroid, [37.5 + north(50), 127.0 + east(50)]) < 1);
  assert.deepEqual([inZoneDistricts({ id: '21-004' }), inZoneDistricts({ id: '01-003' }), inZoneDistricts({ id: 'pk-1', address: '서울특별시 강남구 역삼동 1' }), inZoneDistricts({ id: 'pk-2', address: '서울특별시 마포구 서교동 1' }), inZoneDistricts({ district: '서초구' })], [true, false, true, false, true]);
});

test('clipToBox and gridPieces cut a ring into grid pieces that keep its outline and total area', () => {
  const box = clipToBox([[-50, -50], [150, -50], [150, 150], [-50, 150]], [0, 0, 100, 100]);
  assert.deepEqual(box.map(String).sort(), ["0,0", "0,100", "100,0", "100,100"]);
  const ring = square(9, [37.5, 127.0], 250).ring;
  const pieces = gridPieces(ring, 100);
  assert.equal(pieces.length, 9);
  for (const piece of pieces) assert.ok(ringStats(piece.ring).areaM2 <= 10_000 + 50); // vertices are rounded to ~0.1m
  assert.ok(Math.abs(pieces.reduce((sum, x) => sum + ringStats(x.ring).areaM2, 0) - ringStats(ring).areaM2) < 100);
});

test('crowd zones are small grid pieces near a station or survey spot; the stricter of the two checks wins', () => {
  const zones = buildAreaZones({ areas: areaList, spots: [spot, farSpot, mapo], stations, month: '202610' });
  const of = (id) => zones.filter((z) => z.id.startsWith(`area-${id}-`));
  // Mapo is outside the districts, the 20m square is too small, industrial land is not used and area 6 has no crowd source.
  assert.deepEqual([...new Set(zones.map((z) => z.id.split('-')[1]))], ['1', '2']);
  assert.ok(of(1).length > 1 && of(1).every((z, i) => z.name === `역삼 아파트 ${i + 1}/${of(1).length}` && z.district === '강남구' && z.station?.name === '역삼'));
  // Slivers under 300m² are dropped, so the pieces cover most but not all of the block.
  const covered = of(1).reduce((sum, z) => sum + z.basis.areaM2, 0); assert.ok(covered > 9_000 && covered < 10_050, String(covered));
  const piece = of(1)[0];
  const at = (z, h) => evaluateArea(z, `2026-11-20T${String(h).padStart(2, '0')}:30:00+09:00`);
  // 08h: station 900 (under 1700), sidewalk LOS A -> open (so not shown as a zone).
  assert.deepEqual([at(piece, 8).status, at(piece, 8).capacity, at(piece, 8).los], ['open', 10, 'A']);
  // 12h: station 1300 is fine but the sidewalk is D -> reduced.
  assert.deepEqual([at(piece, 12).status, at(piece, 12).capacity], ['reduced', 5]);
  // 13h: sidewalk E closes even though the station (1400) is open.
  assert.equal(at(piece, 13).status, 'closed'); assert.match(at(piece, 13).reason, /보도/);
  // 17h: no survey hour, station 1800 >= 1700 -> reduced; 22h: 2300 >= 2200 -> closed by the station alone.
  assert.equal(at(piece, 17).status, 'reduced'); assert.equal(at(piece, 22).status, 'closed'); assert.match(at(piece, 22).reason, /역삼역/);
  // Area 2 is watched only through its survey spot: open by LOS in survey hours, default-open outside them.
  assert.ok(of(2).every((z) => z.station === null && z.walk));
  assert.deepEqual([at(of(2)[0], 8).status, at(of(2)[0], 8).defaultOpen], ['open', false]);
  assert.deepEqual([at(of(2)[0], 3).status, at(of(2)[0], 3).defaultOpen], ['open', true]);
  // A sidewalk that leaves under 2m after parking is not used; the station alone still watches the piece.
  const narrow = buildAreaZones({ areas: [areaList[0]], spots: [{ ...spot, widthM: 2.5 }], stations, month: 'm' })[0];
  assert.equal(narrow.walk, null); assert.equal(at(narrow, 8).status, 'open'); assert.equal(at(narrow, 22).status, 'closed');
});

test('zones API serves the built file, rejects bad times and reports a missing or old file', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'zones-')); const file = join(dir, 'public-zones.json');
  const zones = buildAreaZones({ areas: areaList, spots: [spot, farSpot, mapo], stations, month: '202610' });
  // A far address (no station within 300m) and a non-강남구 address next to the station are both left out.
  const penaltyZones = buildPenaltyZones({ hotspots: [...areas, { id: 'far', address: '서울특별시 강남구 x', district: '강남구', count: 9, point: [37.60, 127.10] }, { id: 'gw', address: '서울특별시 관악구 y', district: '관악구', count: 99, point: [37.501, 127.036] }], stations, month: '202610' });
  writeFileSync(file, JSON.stringify({ version: 7, builtAt: 'b', period: 'p', month: '202610', zones, penaltyZones, designated, towingHotspots: areas }));
  const server = createServiceApp({ feedPath: '', publicData: { apiKey: '' }, publicZonesFile: file }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  // Only hotspots within 300m of a station become penalty zones; 역삼 rides (h+1)*100/h, its own mean 1,430 opens in part and mean+σ 2,045 keeps.
  // Square 50m grid cells touched by a 30m circle around each address; cells shared by both addresses merge.
  assert.deepEqual([...new Set(penaltyZones.flatMap((z) => z.towingAddresses.map((h) => h.address)))].sort(), ['서울특별시 강남구 역삼동 804', '서울특별시 강남구 역삼동 805']);
  assert.equal(new Set(penaltyZones.map((z) => z.id)).size, penaltyZones.length);
  assert.ok(penaltyZones.length >= 4 && penaltyZones.every((z) => z.boundary.length === 5 && Math.abs(distanceM(z.boundary[0], z.boundary[1]) - 50) < 1 && Math.abs(distanceM(z.boundary[1], z.boundary[2]) - 50) < 1));
  assert.ok(penaltyZones.every((z) => z.towingAddresses.some((h) => distanceM(areas.find((a) => a.address === h.address).point, z.point) <= 30 + 36)));
  for (const a of areas) assert.ok(penaltyZones.some((z) => inCell(a.point, z.bounds)));
  assert.equal(penaltyZones.find((z) => inCell(areas[0].point, z.bounds)).towingCount >= 478, true);
  const at = async (time) => (await fetch(`${base}/api/zones?at=${encodeURIComponent(time)}`)).json();
  const night = await at('2026-11-20T22:30:00+09:00');
  const n = penaltyZones.length; assert.equal(night.status, 'ready'); assert.equal(night.zones.length, n); assert.deepEqual(night.counts, { penalty: n, open: 0, reduced: 0, closed: n });
  assert.equal(night.zones[0].kind, 'penalty'); assert.equal(night.zones[0].station, undefined); assert.equal(night.zones[0].basis.station.name, '역삼'); assert.equal(night.zones[0].crowdCount, 2300);
  // Only 강남구 designated zones are in the demo area.
  assert.deepEqual(night.designated.map((d) => d.id), ['pk-1']);
  assert.equal((await at('2026-11-20T16:30:00+09:00')).zones[0].status, 'reduced');
  assert.equal((await at('2026-11-20T08:30:00+09:00')).zones[0].status, 'open');
  const fleet = await (await fetch(`${base}/api/zones/synthetic-pm`)).json();
  assert.equal(fleet.synthetic, true); assert.equal(fleet.riskRadiusM, 30); assert.ok(fleet.vehicles.some((v) => v.risk));
  assert.ok(fleet.hotspots.length > 0 && fleet.hotspots.every((h) => Object.keys(h).join() === 'address,count,point'));
  assert.equal((await fetch(`${base}/api/zones?at=nope`)).status, 400);
  assert.equal(readPublicZones(join(dir, 'missing.json')).status, 'unconfigured');
  writeFileSync(file, JSON.stringify({ version: 6, zones, designated, towingHotspots: areas })); assert.equal(readPublicZones(file).status, 'error');
  writeFileSync(file, JSON.stringify({ version: 7, zones, designated: [{ id: 'pk-x', name: 'n', point: ['a', 1] }], towingHotspots: areas })); assert.equal(readPublicZones(file).status, 'error');
  assert.deepEqual((await (await fetch(`${base}/api/zones/synthetic-pm`)).json()).vehicles, []);
});

test('synthetic fleet is deterministic, marks devices within 30m of a towing address and parks some at designated zones', () => {
  const fleet = syntheticFleet({ hotspots: areas, designated });
  assert.deepEqual(syntheticFleet({ hotspots: areas, designated }), fleet);
  assert.ok(fleet.length > areas.length);
  for (const v of fleet.filter((x) => !x.designatedId)) {
    const near = Math.min(...areas.map((a) => distanceM(v.point, a.point)));
    assert.equal(Boolean(v.risk), near <= SYNTHETIC_RULES.riskRadiusM, v.id);
    if (v.risk) assert.equal(v.risk.distanceM, Math.round(near));
  }
  assert.ok(fleet.some((v) => v.risk) && fleet.some((v) => !v.risk));
  assert.ok(fleet.some((v) => v.designatedId === 'pk-1'));
  // A designated zone right on a towing address: the device there is legally parked, not at risk.
  const parked = syntheticFleet({ hotspots: areas, designated: [{ id: 'pk-on', name: 'on', point: areas[0].point }] }).find((v) => v.designatedId === 'pk-on');
  assert.ok(towingRisk(parked.point, areas)); assert.equal(parked.risk, null);
  // Within 30m counts as risk; just past it does not.
  const edge = [{ ...areas[0], point: [37.5, 127.0] }];
  const at = (m) => towingRisk([37.5 + m / 111_195, 127.0], edge);
  assert.ok(at(29.9)); assert.equal(at(30.5), null);
});
