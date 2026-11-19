import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServiceApp } from '../server/service-app.mjs';
import { serviceFixture } from './service-fixture.mjs';

const token = 'test-admin-token-0123456789abcdef-xyz';
const at = '2026-11-19T00:00:00.000Z';
async function withServer(options, run) {
  const server = createServiceApp({ now: () => at, publicData: { apiKey: '' }, ...options }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const call = (method, path, body, auth = token) => fetch(`http://127.0.0.1:${server.address().port}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: body && JSON.stringify(body) });
  try { await run(call); } finally { server.close(); }
}

test('admin API is disabled without a strong token and rejects wrong tokens', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'admin-')); const feedPath = join(dir, 'feed.json');
  try {
    await withServer({ feedPath, adminToken: 'short' }, async (call) => assert.equal((await call('GET', '/api/admin/feed')).status, 503));
    await withServer({ feedPath, adminToken: token }, async (call) => {
      assert.equal((await call('GET', '/api/admin/feed', null, 'wrong')).status, 401);
      assert.equal((await call('GET', '/api/admin/feed', null, null)).status, 401);
      assert.equal((await call('PUT', '/api/admin/zones/a', serviceFixture(at).zones[0], 'wrong')).status, 401);
      assert.equal(existsSync(feedPath), false);
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('admin registers, validates, approves profile and deletes zones in the served feed', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'admin-')); const feedPath = join(dir, 'feed.json');
  const zone = serviceFixture(at).zones[0];
  try {
    await withServer({ feedPath, adminToken: token }, async (call) => {
      assert.equal((await call('PUT', '/api/admin/zones/a', { ...zone, layouts: [] })).status, 400);
      assert.equal((await call('PUT', '/api/admin/zones/b', zone)).status, 400);
      assert.equal(existsSync(feedPath), false);
      assert.equal((await call('PUT', '/api/admin/zones/a', zone)).status, 200);
      let state = await (await call('GET', '/api/service/state', null, null)).json();
      assert.equal(state.zones[0].status, 'unknown');
      assert.equal((await call('PUT', '/api/admin/profile', { approvedForService: true })).status, 200);
      state = await (await call('GET', '/api/service/state', null, null)).json();
      assert.equal(state.zones[0].status, 'open');
      assert.equal(state.zones[0].available, 2);
      assert.equal((await call('PUT', '/api/admin/zones/a', { ...zone, name: '수정된 이름' })).status, 200);
      assert.equal(JSON.parse(readFileSync(feedPath, 'utf8')).zones.length, 1);
      assert.equal((await call('DELETE', '/api/admin/zones/a')).status, 200);
      assert.equal((await call('DELETE', '/api/admin/zones/a')).status, 400);
      writeFileSync(feedPath, '{broken');
      assert.equal((await call('PUT', '/api/admin/zones/a', zone)).status, 400);
      assert.equal(readFileSync(feedPath, 'utf8'), '{broken');
    });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
