import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeoulData, normalizeParking, normalizePedestrians } from '../server/seoul-data.mjs';
import { createServiceApp } from '../server/service-app.mjs';

// These are synthetic schema fixtures, never a service fallback.
const parking = { SN: 1, SGG_NM: '관악구', PSTN: '검증용 주소', DTL_PSTN: '검증용 위치', STAND_YN: 'Y', secret: 'do-not-publish' };
const person = { MODELNAME: 'SDOT001', SERIAL: '00001', SENSING_TIME: '2026-11-19_19:00:00', REGION: 'test', AUTONOMOUS_DISTRICT: 'Gwanak-gu', ADMINISTRATIVE_DISTRICT: 'test-dong', VISITOR_COUNT: '23', DATE: '2026-11-19 19:10:00.0' };
const body = (service, rows) => ({ [service]: { list_total_count: rows.length, RESULT: { CODE: 'INFO-000' }, row: rows } });
const response = (service, rows) => Response.json(body(service, rows));
const at = Date.parse('2026-11-19T19:15:00+09:00');
const fakeFetch = async (url) => url.includes('parkingKickboard') ? response('parkingKickboard', [parking]) : response('sDoTPeople', [person]);

test('인증키가 없으면 샘플 키나 외부 호출 없이 연결 준비 상태를 반환한다', async () => {
  const read = createSeoulData({ apiKey: '', fetchImpl: () => { throw new Error('must not call'); } });
  const state = await read();
  assert.equal(state.parking.status, 'unconfigured'); assert.equal(state.pedestrians.status, 'unconfigured');
  assert.deepEqual(state.parking.records, []);
});

test('공식 주차구역 필드만 반환하고 좌표·경계·수용량·운영 승인을 만들지 않는다', () => {
  const [row] = normalizeParking([parking]);
  assert.equal(row.district, '관악구'); assert.equal(row.address, '검증용 주소'); assert.equal(row.hasStand, true);
  for (const field of ['secret', 'point', 'boundary', 'capacity', 'parkingAuthorized']) assert.equal(field in row, false);
  assert.throws(() => normalizeParking([parking, parking]));
});

test('S-DoT는 한국 시각의 10분 관측을 유지하고 조회 범위 내 센서별 최신값만 선택한다', () => {
  const rows = normalizePedestrians([{ ...person, VISITOR_COUNT: '99', SENSING_TIME: '2026-11-19_18:50:00' }, person]);
  assert.equal(rows.length, 1); assert.equal(rows[0].count, 23);
  assert.equal(rows[0].observedAt, '2026-11-19T10:00:00.000Z'); assert.equal(rows[0].intervalMinutes, 10);
  assert.equal(rows[0].district, '관악구'); assert.equal('pedestrianCount15Min' in rows[0], false);
});

test('빈 인원수·음수·잘못된 달력·시각·주차 필드는 데이터로 수용하지 않는다', () => {
  for (const change of [{ VISITOR_COUNT: '' }, { VISITOR_COUNT: '-1' }, { SENSING_TIME: '2026-02-30_19:00:00' }, { SENSING_TIME: '2026-11-19_24:00:00' }]) assert.throws(() => normalizePedestrians([{ ...person, ...change }]));
  assert.throws(() => normalizeParking([{ ...parking, SN: null }]));
  assert.throws(() => normalizeParking([{ ...parking, PSTN: '' }]));
});

test('동시 요청과 브라우저 새로고침을 병합하고 자료별 수집 주기를 적용한다', async () => {
  let time = at; const urls = [];
  const read = createSeoulData({ apiKey: 'private-test-key', now: () => time, fetchImpl: async (url) => { urls.push(url); await Promise.resolve(); return fakeFetch(url); } });
  const results = await Promise.all([read(), read(), read()]);
  assert.equal(urls.length, 2); assert.equal(results[0].parking.status, 'ready');
  assert.equal(results[0].pedestrians.records[0].observedAt, '2026-11-19T10:00:00.000Z');
  assert.notEqual(results[0].pedestrians.retrievedAt, results[0].pedestrians.records[0].observedAt);
  assert.equal(JSON.stringify(results).includes('private-test-key'), false);
  await read(); assert.equal(urls.length, 2);
  time += 600_001; await read(); assert.equal(urls.length, 3);
  assert.ok(urls.at(-1).includes('sDoTPeople'));
});

test('조회 범위를 표시하고 1,000행을 전체 센서 또는 전체 자료로 표시하지 않는다', async () => {
  const read = createSeoulData({ apiKey: 'key', now: () => at, fetchImpl: async (url) => {
    if (url.includes('parkingKickboard')) return fakeFetch(url);
    const data = body('sDoTPeople', [person]); data.sDoTPeople.list_total_count = 165550;
    return Response.json(data);
  } });
  const state = await read();
  assert.equal(state.pedestrians.totalRows, 165550); assert.equal(state.pedestrians.fetchedRows, 1); assert.equal(state.pedestrians.partial, true);
});

test('공식 API 오류·네트워크 오류는 비밀을 감추고 다른 API와 운영 조회를 막지 않는다', async () => {
  const read = createSeoulData({ apiKey: 'private-test-key', now: () => at, fetchImpl: async (url) => {
    if (url.includes('parkingKickboard')) return Response.json({ RESULT: { CODE: 'INFO-100', MESSAGE: 'private-test-key' } });
    return fakeFetch(url);
  } });
  const state = await read();
  assert.equal(state.parking.status, 'error'); assert.deepEqual(state.parking.records, []);
  assert.equal(state.pedestrians.status, 'ready'); assert.equal(JSON.stringify(state).includes('private-test-key'), false);
});

test('잘못된 총 행 수·초과 본문과 미래 관측을 성공으로 수용하지 않는다', async () => {
  for (const payload of [{ RESULT: { CODE: 'ERROR-500' } }, { sDoTPeople: { ...body('sDoTPeople', [person]).sDoTPeople, list_total_count: -1 } }, { padding: 'x'.repeat(2 * 1024 * 1024) }, body('sDoTPeople', [{ ...person, SENSING_TIME: '2026-11-20_00:00:00' }])]) {
    const read = createSeoulData({ apiKey: 'key', now: () => at, fetchImpl: async (url) => url.includes('parkingKickboard') ? fakeFetch(url) : Response.json(payload) });
    assert.equal((await read()).pedestrians.status, 'error');
  }
});

test('수집 실패 후 이전 자료를 최신으로 되살리지 않고 1분 재시도 제한을 둔다', async () => {
  let time = at; let fail = false; let calls = 0;
  const read = createSeoulData({ apiKey: 'key', now: () => time, fetchImpl: async (url) => { calls++; if (fail) throw new Error('secret'); return fakeFetch(url); } });
  await read(); fail = true; time += 600_001;
  const failed = await read(); assert.equal(failed.pedestrians.status, 'error'); assert.deepEqual(failed.pedestrians.records, []);
  assert.ok(failed.pedestrians.lastSuccessAt); const count = calls;
  await read(); assert.equal(calls, count); fail = false; time += 60_001;
  assert.equal((await read()).pedestrians.status, 'ready');
});

test('새 공공데이터 API는 읽기 전용이며 기존 운영 조회와 분리된다', async (t) => {
  const app = createServiceApp({ feedPath: '', publicData: { apiKey: '', fetchImpl: fakeFetch } });
  const server = app.listen(0, '127.0.0.1'); await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const res = await fetch(`${base}/api/public-data`);
  assert.equal(res.status, 200); assert.equal(res.headers.get('cache-control'), 'no-store'); assert.equal((await res.json()).parking.status, 'unconfigured');
  assert.equal((await (await fetch(`${base}/api/service/state`)).json()).status, 'unconfigured');
  assert.equal((await fetch(`${base}/api/public-data`, { method: 'POST' })).status, 404);
});

test('5초 제한은 응답 헤더 뒤에 멈춘 본문에도 적용한다', async (t) => {
  t.mock.method(AbortSignal, 'timeout', (milliseconds) => {
    assert.equal(milliseconds, 5_000);
    const controller = new AbortController(); setImmediate(() => controller.abort()); return controller.signal;
  });
  const read = createSeoulData({ apiKey: 'key', fetchImpl: async (_url, { signal }) => new Response(new ReadableStream({
    start(controller) { signal.addEventListener('abort', () => controller.error(new Error('private upstream error')), { once: true }); },
  })) });
  const state = await read();
  assert.equal(state.parking.status, 'error'); assert.equal(state.pedestrians.status, 'error');
  assert.equal(JSON.stringify(state).includes('private upstream error'), false);
});

test('크기가 큰 응답은 본문을 읽기 전에 취소한다', async () => {
  let canceled = 0;
  const read = createSeoulData({ apiKey: 'key', fetchImpl: async () => new Response(new ReadableStream({ cancel() { canceled++; } }), { headers: { 'Content-Length': String(3 * 1024 * 1024) } }) });
  await read(); assert.equal(canceled, 2);
});

test('알 수 없는 자치구 이름은 객체의 상속 속성이 아닌 문자열로 유지한다', () => {
  assert.equal(normalizePedestrians([{ ...person, AUTONOMOUS_DISTRICT: 'constructor-gu' }])[0].district, 'constructor-gu');
});
