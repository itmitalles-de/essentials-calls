import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  outputDir: 'artifacts/playwright',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18180',
    // Traces and videos can retain submitted login bodies. Failure-only,
    // redacted service logs are collected by scripts/browser-e2e.sh instead.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
});
