import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';

test('개발 서버는 데이터 디렉터리와 지정된 원자료 파일을 직접 제공하지 않는다', async (t) => {
  mkdirSync('data', { recursive: true });
  const name = `private-check-${process.pid}.json`;
  const dataFile = resolve('data', name); const feedFile = resolve(name);
  writeFileSync(dataFile, 'synthetic private test'); writeFileSync(feedFile, 'synthetic private test');
  const previous = process.env.SERVICE_DATA_FILE; process.env.SERVICE_DATA_FILE = feedFile;
  let server;
  t.after(async () => { await server?.close(); if (previous === undefined) delete process.env.SERVICE_DATA_FILE; else process.env.SERVICE_DATA_FILE = previous; unlinkSync(dataFile); unlinkSync(feedFile); });
  server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'silent' }); await server.listen();
  const base = `http://127.0.0.1:${server.httpServer.address().port}`;
  assert.equal((await fetch(`${base}/data/${name}`)).status, 403);
  assert.equal((await fetch(`${base}/${name}`)).status, 403);
  assert.equal((await fetch(`${base}/DATA/${name}`)).status, 403);
  assert.equal((await fetch(`${base}/${name.toUpperCase()}`)).status, 403);
});
