import express from 'express';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createServiceApp } from './service-app.mjs';

const dist = resolve('dist');
if (!existsSync(resolve(dist, 'index.html'))) throw new Error('먼저 npm run build를 실행하세요.');
const app = createServiceApp();
app.use((_req, res, next) => {
  res.set({ 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: blob: https://tile.openstreetmap.org; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'" });
  next();
});
app.use(express.static(dist));
app.get(['/', '/service', '/mobile', '/demo'], (_req, res) => res.sendFile(resolve(dist, 'index.html')));
app.use((_req, res) => res.status(404).sendFile(resolve(dist, 'index.html')));
const port = Number(process.env.PORT ?? 3001);
const server = app.listen(port, '127.0.0.1', () => console.log(`PM 주차존: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
