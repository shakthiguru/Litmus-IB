import { defineConfig } from '@playwright/test';
import { BASE_URL, PROXY } from './lib/env';

// Three projects, run in order by scripts/run-all.js:
//   seed      -> serial, resets the app and checks seed data before anything mutates it
//   parallel  -> every remaining test, fully parallel across workers
//   stateful  -> serial, checks global counters (dashboard pending count)
export default defineConfig({
  testDir: './tests',
  globalSetup: require.resolve('./global-setup'),
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: Number(process.env.RETRIES ?? 0),
  workers: Number(process.env.WORKERS ?? 8),
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    proxy: PROXY,
    storageState: '.state/auth.json',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  projects: [
    { name: 'seed', testMatch: /seed\/.*\.spec\.ts/, fullyParallel: false },
    { name: 'parallel', testMatch: /parallel\/.*\.spec\.ts/ },
    { name: 'stateful', testMatch: /stateful\/.*\.spec\.ts/, fullyParallel: false },
  ],
});
