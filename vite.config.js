import { defineConfig, normalizePath } from 'vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { createServiceApp } from './server/service-app.mjs';

export default defineConfig({
  publicDir: false,
  plugins: [react(), {
    name: 'service-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(createServiceApp());
    },
  }],
  server: { host: '127.0.0.1', port: 5173, strictPort: true, fs: {
    deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**', '**/.superpowers/**', '**/private/**', ...(process.env.SERVICE_DATA_FILE ? [normalizePath(resolve(process.env.SERVICE_DATA_FILE))] : [])],
  } },
});
