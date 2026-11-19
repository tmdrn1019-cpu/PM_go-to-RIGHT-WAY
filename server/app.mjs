// Legacy simulation harness for regression tests; running servers mount service-app.mjs.
import express from 'express';
import { command, createDemo, snapshot } from './simulation.mjs';

export function createApp({ store }) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' });
    const host = req.headers.host;
    if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host ?? '')) return res.status(403).json({ error: '로컬 시연에서만 사용할 수 있습니다.' });
    if (req.method !== 'GET' && (req.headers['x-pm-demo'] !== '1' || (req.headers.origin && req.headers.origin !== `http://${host}`))) return res.status(403).json({ error: '같은 출처의 시연 요청만 허용합니다.' });
    next();
  });
  app.use('/api', express.json({ limit: '16kb' }));
  app.get('/api/state', (_req, res) => res.json(snapshot(store.read())));
  app.post('/api/command', (req, res) => {
    const result = store.transact((state) => {
      if (req.body?.type !== 'reset') return command(state, req.body);
      if (req.body.confirm !== true) throw Object.assign(new Error('시연 초기화 확인이 필요합니다.'), { status: 400 });
      const replacement = createDemo(req.body.at);
      const revision = state.revision;
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, replacement, { revision });
      return { reset: true };
    });
    res.json({ result, state: snapshot(store.read()) });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API 경로를 찾을 수 없습니다.' }));
  app.use((error, _req, res, _next) => {
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500;
    if (status === 500) console.error(error);
    res.status(status).json({ error: status === 500 ? '서버 처리에 실패했습니다. 저장 상태는 유지됩니다.' : error.type === 'entity.parse.failed' ? '올바른 JSON이 필요합니다.' : error.message });
  });
  return app;
}
