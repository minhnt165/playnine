import { defineConfig, devices } from '@playwright/test';

// Chạy e2e trên dist/ đã ghép, phục vụ tại /playnine/ giống GitHub Pages.
export default defineConfig({
  // Test chung ở e2e/, test riêng của một game nằm cạnh game: games/<dir>/e2e.spec.ts.
  testDir: '.',
  testMatch: ['e2e/**/*.spec.ts', 'games/*/e2e.spec.ts'],
  testIgnore: ['**/node_modules/**', 'dist/**'],
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
    // Mobile chỉ kiểm tra mọi game mở được (URL không đổi, không lỗi trang).
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /e2e[\\/]games\.spec\.ts$/ },
  ],
});
