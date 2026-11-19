import express from 'express';
import { readServiceFeed } from './service-feed.mjs';
import { createSeoulData } from './seoul-data.mjs';
import { readTowing } from './towing.mjs';
import { createFleet } from './fleet.mjs';
import { withGeocodes } from './sgis.mjs';
import { selectCandidates, readSensorLocations } from './candidates.mjs';
import { createAdminRouter } from './admin.mjs';

export function createServiceApp({ feedPath = process.env.SERVICE_DATA_FILE, now = () => new Date().toISOString(), publicData = { apiKey: process.env.SEOUL_OPEN_DATA_KEY }, adminToken = process.env.ADMIN_TOKEN } = {}) {
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
  app.use('/api/admin', createAdminRouter({ feedPath, token: adminToken, now }));
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 서비스 API입니다.' }));
  return app;
}
