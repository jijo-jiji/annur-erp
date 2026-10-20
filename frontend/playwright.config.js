import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive the real screens against a real backend, on their own ports and their own
// throwaway database (see e2e/support/start-backend.mjs), so they never touch the data you develop with
// and can run while the normal dev servers (5273 / 8180) are open.
const API_PORT = 8181;
const WEB_PORT = 5373;

export default defineConfig({
  testDir: './e2e',
  // One shared database, so tests run one after another and each creates the records it needs
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 45_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: `http://127.0.0.1:${WEB_PORT}`,
    timezoneId: 'Asia/Kuala_Lumpur',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node e2e/support/start-backend.mjs',
      url: `http://127.0.0.1:${API_PORT}/api/v1/centre/`,
      timeout: 240_000,
      reuseExistingServer: false,
      env: { ANNUR_E2E_API_PORT: String(API_PORT) },
    },
    {
      command: `npx vite --host 127.0.0.1 --port ${WEB_PORT}`,
      url: `http://127.0.0.1:${WEB_PORT}`,
      timeout: 60_000,
      reuseExistingServer: false,
      env: { ANNUR_API_TARGET: `http://127.0.0.1:${API_PORT}` },
    },
  ],
});
