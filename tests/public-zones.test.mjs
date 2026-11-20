import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { stationProfiles, buildHotspotZones, publicZonesAt, readPublicZones } from '../server/public-zones.mjs';
import { createServiceApp } from '../server/service-app.mjs';

const ride = (STTN, perHour) => Object.fromEntries([['STTN', STTN], ...Array.from({ length: 24 }, (_, h) => [[`HR_${h}_GET_ON_NOPE`, perHour(h) * 30], [`HR_${h}_GET_OFF_NOPE`, 0]]).flat()]);
const master = [{ BLDN_NM: '역삼', LAT: '37.500', LOT: '127.036' }, { BLDN_NM: '역삼', LAT: '37.502', LOT: '127.036' }, { BLDN_NM: '한적', LAT: '37.56', LOT: '126.92' }, { BLDN_NM: '좌표없음', LAT: 'x', LOT: '1' }];
const rides = [ride('역삼(구청)', (h) => (h + 1) * 100), ride('한적', () => 1), ride('좌표없음', () => 999)];
const designated = [{ id: 'pk-1', name: '역삼역 8번 출구', address: '서울특별시 강남구 역삼동 679-5', point: [37.5012, 127.0365] }, { id: 'pk-2', name: '외곽 구역', address: 'x', point: [37.60, 127.10] }];
const areas = [
  { id: 'a1', address: '서울특별시 강남구 역삼동 804', district: '강남구', count: 478, point: [37.501, 127.036] },
  { id: 'a2', address: '서울특별시 강남구 역삼동 805', district: '강남구', count: 50, point: [37.5015, 127.0362] }, // within 300m of a1
  { id: 'a3', address: '서울특별시 강남구 역삼동 900', district: '강남구', count: 40, point: [37.5040, 127.0365] }, // same designated zone as a1 -> dropped
  { id: 'a4', address: '서울특별시 마포구 서교동 1', district: '마포구', count: 400, point: [37.561, 126.92] }, // quiet station, no designated zone
];

test('station profiles average lines, divide monthly totals by days and drop stations without coordinates', () => {
  const stations = stationProfiles(master, rides, 30);
  assert.deepEqual(stations.map((s) => s.name).sort(), ['역삼', '한적']);
  const yeoksam = stations.find((s) => s.name === '역삼');
  assert.deepEqual(yeoksam.point.map((v) => Math.round(v * 1000) / 1000), [37.501, 127.036]);
  assert.equal(yeoksam.hourly[23], 2400);
});

test('hotspot zones snap to designated zones, need a busy station and never repeat a designated zone', () => {
  const stations = stationProfiles(master, rides, 30);
  const zones = buildHotspotZones({ areas, designated, stations, period: '2025', month: '202610' });
  assert.deepEqual(zones.map((z) => [z.id, z.name, z.basis.towingCount, z.basis.addressCount, z.basis.stationName]), [['seoul-pk-1', '역삼역 8번 출구', 528, 2, '역삼']]);
  const at = (h) => publicZonesAt(zones, `2026-11-20T${String(h).padStart(2, '0')}:30:00+09:00`)[0];
  assert.equal(at(23).status, 'closed'); assert.equal(at(18).status, 'reduced'); assert.equal(at(18).capacity, 5);
  assert.equal(at(3).status, 'open'); assert.equal(at(3).crowdCount, 400); assert.equal(at(3).available, null);
  // 48 station-hours (역삼 100..2400, 한적 1 each): top 5% = 3rd = 2200, top 15% = 8th = 1700.
  assert.deepEqual([zones[0].thresholds.close, zones[0].thresholds.reduce, zones[0].thresholds.stationHours], [2200, 1700, 48]);
  assert.equal(at(21).status, 'closed'); assert.equal(at(20).status, 'reduced'); assert.equal(at(15).status, 'open');
});

test('sidewalk evidence uses the nearest surveyed spot within 300m and never changes the verdict', () => {
  const stations = stationProfiles(master, rides, 30);
  const near = { id: 's1', name: '근처 지점', point: [37.5013, 127.0366], widthM: 3, walkway: '보도전용', obstacle: '가로수', hourly: { 8: 900, 18: 2580, 19: 2580, 20: 'x' } };
  const far = { id: 's2', name: '먼 지점', point: [37.51, 127.05], widthM: 10, hourly: { 18: 99999 } };
  const zones = buildHotspotZones({ areas, designated, stations, period: 'p', month: 'm', sidewalk: [far, near, { ...near, id: 's3', widthM: 0 }] });
  const s = zones[0].basis.sidewalk;
  // 2580/60/3 = 14.3 (A); width left 1.8m -> 23.9 (B); ties pick the earlier hour.
  assert.deepEqual([s.spotName, s.peakHour, s.peakCount, s.flow, s.los, s.remainingWidthM, s.parkedFlow, s.parkedLos], ['근처 지점', 18, 2580, 14.3, 'A', 1.8, 23.9, 'B']);
  assert.ok(s.distanceM < 300);
  const plain = buildHotspotZones({ areas, designated, stations, period: 'p', month: 'm' });
  assert.equal(plain[0].basis.sidewalk, null);
  const at = '2026-11-20T23:30:00+09:00';
  assert.equal(publicZonesAt(zones, at)[0].status, publicZonesAt(plain, at)[0].status);
  assert.equal(buildHotspotZones({ areas, designated, stations, period: 'p', month: 'm', sidewalk: [far] })[0].basis.sidewalk, null);
});

test('zones API serves the built file, rejects bad times and reports a missing or old file', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'zones-')); const file = join(dir, 'public-zones.json');
  const zones = buildHotspotZones({ areas, designated, stations: stationProfiles(master, rides, 30), period: 'p', month: 'm' });
  writeFileSync(file, JSON.stringify({ version: 4, builtAt: 'b', month: 'm', zones }));
  const server = createServiceApp({ feedPath: '', publicData: { apiKey: '' }, publicZonesFile: file }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const body = await (await fetch(`${base}/api/zones?at=${encodeURIComponent(new Date().toISOString())}`)).json();
  assert.equal(body.status, 'ready'); assert.equal(body.zones.length, 1);
  assert.equal((await fetch(`${base}/api/zones?at=nope`)).status, 400);
  assert.equal(readPublicZones(join(dir, 'missing.json')).status, 'unconfigured');
  writeFileSync(file, JSON.stringify({ version: 3, zones })); assert.equal(readPublicZones(file).status, 'error');
});
