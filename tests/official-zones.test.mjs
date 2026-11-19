import test from 'node:test';
import assert from 'node:assert/strict';
import { createOfficialZones } from '../server/official-zones.mjs';

const records = [
  { id: '171', district: '관악구', address: '봉천동 869-1', detail: '역 인근', name: '역 인근', hasStand: false },
  { id: '172', district: '관악구', address: '남부순환로 1805', detail: '', name: '관악구 주차구역 172', hasStand: true },
  { id: '9', district: '동작구', address: '상도동 1', detail: '', name: 'x', hasStand: null },
];

test('official zones keep only the pilot district, prefix the full address and cache only exact geocodes', async () => {
  const calls = [];
  const read = createOfficialZones({
    readParking: async () => ({ status: 'ready', sourceUrl: 'https://example.org', retrievedAt: 't', records }),
    geocode: async (address) => { calls.push(address); if (address.endsWith('1805')) throw new Error('SGIS down'); return [37.48, 126.95]; },
  });
  const first = await read();
  assert.deepEqual(first.zones.map((z) => [z.id, z.address, z.point]), [['171', '서울특별시 관악구 봉천동 869-1', [37.48, 126.95]], ['172', '서울특별시 관악구 남부순환로 1805', null]]);
  await read();
  assert.deepEqual(calls, ['서울특별시 관악구 봉천동 869-1', '서울특별시 관악구 남부순환로 1805', '서울특별시 관악구 남부순환로 1805']);
  const off = await createOfficialZones({ readParking: async () => ({ status: 'unconfigured', sourceUrl: 'u', records: [] }), geocode: async () => { throw new Error('must not call'); } })();
  assert.deepEqual(off, { status: 'unconfigured', sourceUrl: 'u', zones: [] });
});
