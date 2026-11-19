import express from 'express';
import { readServiceFeed } from './service-feed.mjs';

export function createServiceApp({ feedPath = process.env.SERVICE_DATA_FILE, now = () => new Date().toISOString() } = {}) {
  const app = express(); app.disable('x-powered-by');
  app.use('/api', (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }); next();
  });
  app.get('/api/service/state', (_req, res) => res.json(readServiceFeed(feedPath, now())));
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 서비스 API입니다.' }));
  return app;
}
