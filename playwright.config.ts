import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  workers: 4,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['allure-playwright', { resultsDir: 'allure/results' }],
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'api', testMatch: '**/api/*.spec.ts' },
    { name: 'chromium', testMatch: '**/ui.spec.ts', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: process.env.BASE_URL ? undefined : {
    command: 'npm start',
    url: 'http://127.0.0.1:3100',
    env: { HOST: '127.0.0.1', PORT: '3100' },
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
