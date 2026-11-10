import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 20_000,
  use: { baseURL: 'http://localhost:4174', viewport: { width: 1280, height: 860 } },
  webServer: { command: 'npm run build && rm -rf .e2e-data && DATA_DIR=.e2e-data PORT=4174 node server.mjs', url: 'http://localhost:4174/healthz', reuseExistingServer: false },
});
