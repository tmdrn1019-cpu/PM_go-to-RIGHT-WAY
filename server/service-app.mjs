import express from 'express';
import { readServiceFeed } from './service-feed.mjs';
import { createSeoulData } from './seoul-data.mjs';
import { readTowing } from './towing.mjs';
import { createFleet } from './fleet.mjs';
import { withGeocodes } from './sgis.mjs';
import { createDemoRouter } from './app.mjs';
import { createStore } from './store.mjs';
import { selectCandidates, readSensorLocations } from './candidates.mjs';
import { readPublicZones, publicZonesAt } from './public-zones.mjs';

export function createServiceApp({ feedPath = process.env.SERVICE_DATA_FILE, now = () => new Date().toISOString(), publicData = { apiKey: process.env.SEOUL_OPEN_DATA_KEY }, demoStore, publicZonesFile } = {}) {
  const app = express(); app.disable('x-powered-by');
  const readPublicData = createSeoulData(publicData);
  const readFleet = createFleet({ apiKey: process.env.TAGO_SERVICE_KEY });
  app.use('/api', (_req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' }); next();
  });
  app.get('/api/service/state', (_req, res) => res.json(readServiceFeed(feedPath, now())));
  app.get('/api/public-data', async (_req, res) => res.json(await readPublicData()));
  app.get('/api/towing/areas', (_req, res) => res.json(withGeocodes(readTowing())));
  app.get('/api/towing/candidates', async (_req, res) => res.json(selectCandidates(withGeocodes(readTowing()), (await readPublicData()).pedestrians, readSensorLocations())));
  app.get('/api/pm/vehicles', async (req, res) => res.json(await readFleet(typeof req.query.cityCode === 'string' ? req.query.cityCode : '', typeof req.query.provider === 'string' ? req.query.provider : '')));
  // Seoul-designated zones confirmed from public data; verdict at any time for the web map's playback clock.
  app.get('/api/zones', (req, res) => {
    const at = typeof req.query.at === 'string' ? Date.parse(req.query.at) : Date.parse(now());
    if (!Number.isFinite(at) || Math.abs(at - Date.parse(now())) > 30 * 86_400_000) return res.status(400).json({ error: '조회 시각은 오늘 기준 30일 안의 ISO 시각이어야 합니다.' });
    const data = readPublicZones(publicZonesFile);
    res.json({ status: data.status, at: new Date(at).toISOString(), builtAt: data.builtAt ?? null, month: data.month ?? null, zones: publicZonesAt(data.zones, at) });
  });
  // The SQLite demo store opens on first demo request so service-only use never touches it.
  let demoRouter;
  app.use('/api/demo', (req, res, next) => (demoRouter ??= createDemoRouter({ store: demoStore ?? createStore(process.env.DEMO_DATA_FILE || undefined) }))(req, res, next));
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 서비스 API입니다.' }));
  return app;
}
