// Copyright (c) 2026 ttldtor. SPDX-License-Identifier: BSL-1.0
import { defineConfig } from '@playwright/test';
const port = process.env.PORTALS_POC_PORT || '41806';
const live = process.env.PORTALS_PAGES_LIVE;
export default defineConfig({
  testDir: 'tests', testMatch: '*.spec.mjs', workers: 1, timeout: 30000, reporter: 'line',
  outputDir: '.work/browser-results',
  use: { browserName: 'chromium', channel: process.env.PORTALS_BROWSER_CHANNEL || undefined,
    headless: true, baseURL: live || `http://127.0.0.1:${port}/portals-wasm-poc/`,
    viewport: { width: 1100, height: 800 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: live ? undefined : { command: 'node scripts/serve.mjs', url: `http://127.0.0.1:${port}/portals-wasm-poc/`, reuseExistingServer: false, timeout: 10000 }
});
