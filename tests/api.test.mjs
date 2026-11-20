import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createStore } from '../server/store.mjs';
import { createApp } from '../server/app.mjs';

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'pm-test-'));
  const file = join(dir, 'demo.sqlite');
  const store = createStore(file);
  const app = createApp({ store });
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const post = (action, headers = {}) => fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PM-Demo': '1', ...headers }, body: JSON.stringify(action) });
  return { store, file, base, post };
}

test('API는 같은 기기에 대한 동시 수락 중 하나만 확정한다', async (t) => {
  const { post, store } = await setup(t);
  const replies = await Promise.all([1, 2].map(() => post({ type: 'accept', scooterId: 'PM-001', destinationId: 'exit' })));
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 409]);
  assert.equal(store.read().missions.length, 1);
});

test('데이터베이스 재연결 후 시각과 포인트를 보존한다', async (t) => {
  const { post, file } = await setup(t);
  assert.equal((await post({ type: 'advance', minutes: 15 })).status, 200);
  const reopened = createStore(file);
  assert.equal(reopened.read().now, '2026-11-19T08:45:00.000Z');
  assert.equal(reopened.read().points, 0);
  reopened.close();
});

test('잘못된 입력은 JSON 오류로 응답하고 실패한 변경은 롤백한다', async (t) => {
  const { post, store, base } = await setup(t);
  assert.equal((await post({ type: 'advance', minutes: '15' })).status, 400);
  assert.equal((await post({ type: 'accept', scooterId: 'PM-001', destinationId: 'exit', failUnlock: true })).status, 502);
  assert.equal(store.read().missions.length, 0);
  const broken = await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PM-Demo': '1' }, body: '{' });
  assert.equal(broken.status, 400);
  assert.ok((await broken.json()).error);
});

test('외부 Origin 및 전용 헤더 없는 변경 요청을 거절한다', async (t) => {
  const { post, base } = await setup(t);
  assert.equal((await post({ type: 'advance', minutes: 1 }, { Origin: 'https://example.com' })).status, 403);
  assert.equal((await fetch(`${base}/api/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const response = await fetch(`${base}/api/state`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).mode, 'demo');
});

test('서비스 앱은 시연 API를 /api/demo 아래에만 두고 서비스 상태와 섞지 않는다', async (t) => {
  const { createServiceApp } = await import('../server/service-app.mjs');
  const dir = mkdtempSync(join(tmpdir(), 'pm-test-')); const store = createStore(join(dir, 'demo.sqlite'));
  const server = createServiceApp({ feedPath: '', publicData: { apiKey: '' }, demoStore: store }).listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { await new Promise((resolve) => server.close(resolve)); store.close(); rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const demo = await (await fetch(`${base}/api/demo/state`)).json();
  assert.equal(demo.mode, 'demo'); assert.ok(demo.offers.length > 0);
  assert.equal((await fetch(`${base}/api/state`)).status, 404);
  assert.equal((await (await fetch(`${base}/api/service/state`)).json()).zones.length, 0);
  const accepted = await fetch(`${base}/api/demo/command`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PM-Demo': '1' }, body: JSON.stringify({ type: 'accept', scooterId: demo.offers[0].id, destinationId: demo.offers[0].destinations[0].id }) });
  assert.equal(accepted.status, 200);
  assert.equal((await fetch(`${base}/api/demo/command`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
});

test('시연 API는 로컬 호스트와 DEMO_PUBLIC_HOST로 지정한 배포 호스트만 허용한다', async () => {
  const { demoHostAllowed } = await import('../server/app.mjs');
  assert.ok(demoHostAllowed('127.0.0.1:3001') && demoHostAllowed('localhost'));
  assert.ok(!demoHostAllowed('pm.onrender.com', undefined) && !demoHostAllowed('pm.onrender.com', ''));
  assert.ok(demoHostAllowed('pm.onrender.com', 'pm.onrender.com'));
  assert.ok(!demoHostAllowed('evil.onrender.com', 'pm.onrender.com') && !demoHostAllowed(undefined, 'pm.onrender.com'));
});
