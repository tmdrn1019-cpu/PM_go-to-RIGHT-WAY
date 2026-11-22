import express from 'express';
import { readServiceFeed } from './service-feed.mjs';
import { createSeoulData } from './seoul-data.mjs';
import { readTowing } from './towing.mjs';
import { createFleet } from './fleet.mjs';
import { withGeocodes } from './sgis.mjs';
import { createDemoRouter } from './app.mjs';
import { createStore } from './store.mjs';
import { selectCandidates, readSensorLocations } from './candidates.mjs';
import { readPublicZones, penaltyZonesAt, syntheticFleet, SYNTHETIC_RULES, PENALTY_RULES } from './public-zones.mjs';

// The web demo area (user request 2026-11-22: 강남구 only) for the designated-zone and synthetic layers.
const inDemoArea = (place) => PENALTY_RULES.districts.some((gu) => place.district === gu || String(place.address ?? '').includes(` ${gu} `));

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
  // Penalty zones (pivot 2026-11-22): the operator app's no-return areas around towing hotspots, opened by the hour from the
  // nearest station's ridership. Seoul-designated zones are listed unchanged. Verdict at any time for the web map's playback clock.
  app.get('/api/zones', (req, res) => {
    const at = typeof req.query.at === 'string' ? Date.parse(req.query.at) : Date.parse(now());
    if (!Number.isFinite(at) || Math.abs(at - Date.parse(now())) > 30 * 86_400_000) return res.status(400).json({ error: '조회 시각은 오늘 기준 30일 안의 ISO 시각이어야 합니다.' });
    const data = readPublicZones(publicZonesFile);
    const designated = data.designated.filter(inDemoArea).map(({ id, name, address, point }) => ({ id, name, address: address ?? null, point }));
    const zones = penaltyZonesAt(data.penaltyZones, at);
    const count = (status) => zones.filter((z) => z.status === status).length;
    const counts = { penalty: zones.length, open: count('open'), reduced: count('reduced'), closed: count('closed') };
    res.json({ status: data.status === 'ready' && !zones.length ? 'unconfigured' : data.status, at: new Date(at).toISOString(), builtAt: data.builtAt ?? null, month: data.month ?? null, counts, zones, designated });
  });
  // Synthetic demo devices around real towing addresses; never real vehicle positions.
  app.get('/api/zones/synthetic-pm', (_req, res) => {
    const all = readPublicZones(publicZonesFile);
    const data = { ...all, designated: all.designated.filter(inDemoArea), towingHotspots: all.towingHotspots.filter(inDemoArea) };
    res.json({ status: data.status, synthetic: true, riskRadiusM: SYNTHETIC_RULES.riskRadiusM, period: data.period ?? null, hotspots: data.towingHotspots.filter((h) => Array.isArray(h.point)).map(({ address, count, point }) => ({ address, count, point })), vehicles: syntheticFleet({ hotspots: data.towingHotspots, designated: data.designated }) });
  });
  // The SQLite demo store opens on first demo request so service-only use never touches it.
  let demoRouter;
  app.use('/api/demo', (req, res, next) => (demoRouter ??= createDemoRouter({ store: demoStore ?? createStore(process.env.DEMO_DATA_FILE || undefined) }))(req, res, next));
  app.use('/api', (_req, res) => res.status(404).json({ error: '지원하지 않는 서비스 API입니다.' }));
  return app;
}
