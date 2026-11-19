import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { selectCandidates, readSensorLocations } from '../server/candidates.mjs';

const area = (id, count, point, geocodeStatus = 'matched') => ({ id, address: `서울특별시 관악구 봉천동 ${id}`, count, point, geocodeStatus });
const towing = { status: 'ready', from: '2025-01-01', to: '2025-12-31', areas: [
  area('a', 10, [37.4800, 126.9500]), area('b', 30, [37.4810, 126.9500]), area('c', 5, [37.4900, 126.9500]), area('d', 99, undefined, 'review'),
] };
const pedestrians = { status: 'ready', records: [{ id: 'S1', district: '관악구', count: 40, intervalMinutes: 10, observedAt: '2026-11-20T01:00:00.000Z', delayed: false }] };

test('candidates group geocoded hotspots by radius, rank by towing and never auto-open', () => {
  const result = selectCandidates(towing, pedestrians, { status: 'unconfigured', sensors: [] });
  assert.deepEqual(result.candidates.map((c) => [c.id, c.towingCount, c.addressCount]), [['b', 40, 2], ['c', 5, 1]]);
  assert.equal(result.candidates[0].pedestrian.status, 'location-unknown');
  assert.equal(result.candidates[0].pedestrian.districtSensors, 1);
  assert.ok(result.candidates.every((c) => c.evaluation.status === 'unknown'));
});

test('pedestrian link uses only verified sensor positions within the radius', () => {
  const near = selectCandidates(towing, pedestrians, { status: 'ready', sensors: [{ id: 'S1', point: [37.4815, 126.9500] }] });
  assert.equal(near.candidates[0].pedestrian.status, 'linked');
  assert.equal(near.candidates[0].pedestrian.intervalMinutes, 10);
  assert.equal(near.candidates[1].pedestrian.status, 'no-sensor-nearby');
  assert.equal(selectCandidates({ status: 'error', areas: [] }, pedestrians, { status: 'ready', sensors: [] }).candidates.length, 0);
});

test('sensor location file is validated', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sdot-')); const file = join(dir, 's.json');
  try {
    assert.equal(readSensorLocations(join(dir, 'none.json')).status, 'unconfigured');
    writeFileSync(file, JSON.stringify({ version: 1, sensors: [{ id: 'S1', point: [0, 0] }] }));
    assert.equal(readSensorLocations(file).status, 'error');
    writeFileSync(file, JSON.stringify({ version: 1, sensors: [{ id: 'S1', point: [37.48, 126.95] }] }));
    assert.deepEqual(readSensorLocations(file), { status: 'ready', sensors: [{ id: 'S1', point: [37.48, 126.95] }] });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
