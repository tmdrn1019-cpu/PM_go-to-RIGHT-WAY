import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchServiceState, decisionTtl } from '../src/service-client.mjs';

test('응답이 멈추면 요청을 10초 안에 취소한다', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true })));
  const request = fetchServiceState();
  t.mock.timers.tick(10_001);
  await assert.rejects(request);
});
test('조회 취소와 잘못된 응답을 새 운영 상태로 반영하지 않는다', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ zones: [] }) }));
  await assert.rejects(fetchServiceState());
  const controller = new AbortController(); controller.abort();
  await assert.rejects(fetchServiceState(controller.signal));
});
test('판정 유효기간은 휴대폰 시계 대신 서버 시각 차이를 사용한다', () => {
  assert.equal(decisionTtl({ generatedAt: '2026-11-19T00:00:00Z', expiresAt: '2026-11-19T00:00:30Z' }), 30_000);
  assert.equal(decisionTtl({ generatedAt: '2026-11-19T00:01:00Z', expiresAt: '2026-11-19T00:00:30Z' }), 0);
  assert.equal(decisionTtl({ generatedAt: '2026-11-19T00:00:00Z', expiresAt: null }), null);
});
