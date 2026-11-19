import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { evaluateServiceFeed, readServiceFeed } from '../server/service-feed.mjs';
import { createServiceApp } from '../server/service-app.mjs';
import { serviceFixture } from './service-fixture.mjs';

const at = '2026-11-19T09:00:00+09:00';
test('운영 데이터가 없으면 시연 기기나 주차존을 대입하지 않는다', () => {
  const view = readServiceFeed(undefined, at);
  assert.equal(view.status, 'unconfigured'); assert.deepEqual(view.zones, []);
  assert.equal(view.generatedAt, '2026-11-19T00:00:00.000Z');
  assert.equal(view.capabilities.missionAcceptance, false);
});

test('새 관측·재고·승인 정책으로 현재 수용량을 계산한다', () => {
  const view = evaluateServiceFeed(serviceFixture(), at);
  assert.equal(view.status, 'ready'); assert.equal(view.zones[0].status, 'open');
  assert.equal(view.zones[0].available, 2); assert.equal(view.zones[0].capacity, 5);
  assert.equal(view.zones[0].los, 'A');
});

test('관측 또는 재고 만료, 미래 관측, 미승인 정책·장소는 개방하지 않는다', () => {
  for (const edit of [
    (f) => { f.zones[0].observation.validUntil = at; },
    (f) => { f.zones[0].inventory.validUntil = at; },
    (f) => { f.zones[0].observation.observedAt = '2026-11-19T10:00:00+09:00'; },
    (f) => { f.profile.approvedForService = false; },
    (f) => { f.zones[0].parkingAuthorized = false; },
    (f) => { f.zones[0].inventory = null; },
  ]) {
    const feed = serviceFixture(); edit(feed);
    const result = evaluateServiceFeed(feed, at).zones[0];
    assert.equal(result.status, 'unknown'); assert.equal(result.available, 0);
  }
});

test('잘못된 좌표·중복 ID·시간표·경계·단위는 거절한다', () => {
  for (const edit of [
    (f) => { f.zones[0].point = [200, 100]; },
    (f) => { f.zones.push(structuredClone(f.zones[0])); },
    (f) => { f.zones[0].windows = [{ start: '25:00', end: '26:00' }]; },
    (f) => { f.zones[0].boundary = [[37.48, 126.93]]; },
    (f) => { f.profile.unit = '명/시간/m'; },
  ]) { const feed = serviceFixture(); edit(feed); assert.throws(() => evaluateServiceFeed(feed, at)); }
});

test('공개 결과에는 원자료의 임의 비밀 필드를 전달하지 않는다', () => {
  const feed = serviceFixture(); feed.secret = 'private'; feed.zones[0].operatorToken = 'private'; feed.zones[0].inventory.secret = 'private';
  const view = evaluateServiceFeed(feed, at);
  assert.equal(view.zones.length, 1);
  assert.equal(JSON.stringify(view).includes('private'), false);
});

test('파일 변경을 다시 읽고 잘못된 JSON에는 이전 개방 상태를 되살리지 않는다', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'pm-feed-')); const file = join(dir, 'service.json');
  t.after(() => { assert.ok(resolve(dir).startsWith(resolve(tmpdir()))); rmSync(dir, { recursive: true, force: true }); });
  writeFileSync(file, JSON.stringify(serviceFixture())); assert.equal(readServiceFeed(file, at).status, 'ready');
  writeFileSync(file, '{'); const view = readServiceFeed(file, at);
  assert.equal(view.status, 'error'); assert.deepEqual(view.zones, []);
  assert.equal(JSON.stringify(view).includes(dir), false);
});

test('공개 서비스 서버는 실제 시계를 쓰며 시연 API를 노출하지 않는다', async (t) => {
  let current = Date.parse(at);
  const app = createServiceApp({ now: () => new Date(current).toISOString() });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise((done) => server.close(done)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const first = await (await fetch(`${base}/api/service/state`)).json();
  current += 60_000;
  const second = await (await fetch(`${base}/api/service/state`)).json();
  assert.notEqual(first.generatedAt, second.generatedAt);
  assert.equal((await fetch(`${base}/api/state`)).status, 404);
  assert.equal((await fetch(`${base}/api/command`, { method: 'POST' })).status, 404);
});

test('축소를 유발한 기본 배치와 운영 중인 선택 배치의 LOS를 구분한다', () => {
  const feed = serviceFixture();
  feed.zones[0].layouts = [{ capacity: 2, effectiveWidthM: 6 }, { capacity: 5, effectiveWidthM: 3 }];
  feed.zones[0].observation.pedestrianCount15Min = 2700;
  const zone = evaluateServiceFeed(feed, at).zones[0];
  assert.equal(zone.status, 'reduced'); assert.equal(zone.effectiveWidthM, 6);
  assert.equal(zone.flow, 30); assert.equal(zone.los, 'B'); assert.equal(zone.triggerLos, 'D');
});

test('0 면적 경계와 중복 좌표만 있는 배치는 거절한다', () => {
  for (const boundary of [Array(4).fill([37.48, 126.93]), [[37.48, 126.93], [37.481, 126.931], [37.482, 126.932], [37.48, 126.93]]]) {
    const feed = serviceFixture(); feed.zones[0].boundary = boundary;
    assert.throws(() => evaluateServiceFeed(feed, at));
  }
});

test('혼합 기기용 공통 정원 확인 전에는 같은 대수를 두 유형에 허용하지 않는다', () => {
  const feed = serviceFixture(); feed.zones[0].vehicleTypes = ['scooter', 'ebike'];
  assert.equal(evaluateServiceFeed(feed, at).zones[0].status, 'unknown');
  feed.zones[0].capacityAppliesToAllTypes = true;
  assert.equal(evaluateServiceFeed(feed, at).zones[0].available, 2);
});

test('다음 변경은 종료 전 축소·폐쇄 중 개방 및 자정 이후를 안내한다', () => {
  const feed = serviceFixture(); feed.zones[0].windows = [{ start: '08:00', end: '10:00' }];
  feed.zones[0].preClose = { minutes: 30, capacity: 2 };
  const view = evaluateServiceFeed(feed, at);
  assert.deepEqual(view.zones[0].nextChange, { at: '2026-11-19T00:30:00.000Z', type: 'reduce' });
  assert.equal(view.expiresAt, '2026-11-19T00:15:00.000Z');
  const early = serviceFixture('2026-11-19T07:00:00+09:00'); early.zones[0].windows = feed.zones[0].windows;
  assert.deepEqual(evaluateServiceFeed(early, '2026-11-19T07:00:00+09:00').zones[0].nextChange, { at: '2026-11-18T23:00:00.000Z', type: 'open' });
  feed.zones[0].windows = [{ start: '22:00', end: '01:00' }];
  assert.equal(evaluateServiceFeed(feed, '2026-11-19T23:00:00+09:00').zones[0].nextChange.at, '2026-11-19T15:30:00.000Z');
});
