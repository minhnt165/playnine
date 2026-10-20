import { defineConfig, devices } from '@playwright/test';

// Chạy e2e trên dist/ đã ghép, phục vụ tại /playnine/ giống GitHub Pages.
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  reporter: 'list',
  use: { baseURL: 'http://localhost:4173/playnine/' },
  webServer: {
    command: 'node scripts/serve-dist.mjs 4173',
    url: 'http://localhost:4173/playnine/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Mobile chỉ kiểm tra URL game cũ.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /legacy-urls\.spec\.ts/ },
  ],
});
