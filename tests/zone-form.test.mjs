import test from 'node:test';
import assert from 'node:assert/strict';
import { buildZone, zoneToForm } from '../src/zone-form.mjs';
import { evaluateServiceFeed } from '../server/service-feed.mjs';

const form = {
  id: 'z1', name: '테스트 존', address: '검증용 주소', lat: '37.48', lng: '126.93',
  boundary: '37.48, 126.93\n37.4801, 126.93\n37.4801, 126.9301', scooter: true, ebike: false,
  parkingAuthorized: true, capacityAppliesToAllTypes: false, layouts: '5, 3\n3, 3.4', windows: '22:00-02:00\n09:00-18:00 금, 월,월',
  preCloseMinutes: '30', preCloseCapacity: '2', count15: '450', observedAt: '2026-11-19T08:50', observationMinutes: '15', observationSource: '현장 계수',
  parked: '1', reserved: '0', inventoryAt: '2026-11-19T08:50', inventoryMinutes: '15',
};

test('operator form builds a zone the feed validator accepts, closing the ring and using KST', () => {
  const zone = buildZone(form);
  assert.deepEqual(zone.boundary.at(-1), zone.boundary[0]);
  assert.equal(zone.observation.observedAt, '2026-11-18T23:50:00.000Z');
  assert.equal(zone.observation.validUntil, '2026-11-19T00:05:00.000Z');
  assert.deepEqual(zone.windows, [{ start: '22:00', end: '02:00' }, { start: '09:00', end: '18:00', days: [1, 5] }]);
  const state = evaluateServiceFeed({ version: 1, sourceName: 't', publishedAt: '2026-11-19T00:00:00Z', profile: null, zones: [zone] }, '2026-11-19T00:00:00Z');
  assert.equal(state.zones.length, 1);
  assert.deepEqual(buildZone({ ...zoneToForm(zone), observedAt: form.observedAt, inventoryAt: form.inventoryAt }), zone);
});

test('operator form rejects missing or malformed input with a Korean message', () => {
  for (const change of [{ layouts: '' }, { layouts: '5' }, { boundary: '37.48, 126.93' }, { windows: '9시-10시' }, { windows: '09:00-18:00 평일' }, { scooter: false }, { count15: '' }, { observedAt: '2026-11-19 08:50' }, { observationMinutes: '0' }])
    assert.throws(() => buildZone({ ...form, ...change }), /[가-힣]/);
});
