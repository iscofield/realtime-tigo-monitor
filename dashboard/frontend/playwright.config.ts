import { defineConfig, devices } from '@playwright/test';

// Use PLAYWRIGHT_BASE_URL env var for Docker testing, default to dev server
const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174';
const useDocker = baseURL.includes('5174');

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only start webServer when not using Docker
  ...(useDocker ? {} : {
    webServer: {
      command: 'npm run dev',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
  }),
});
