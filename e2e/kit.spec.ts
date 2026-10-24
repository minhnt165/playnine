import { test, expect } from '@playwright/test';

// Bộ dùng chung games/_kit trên trang mẫu _kit/demo.html (chạy độc lập, không có SDK).

test.beforeEach(async ({ page }) => {
  await page.route('**/sdk/playnine.js*', (r) => r.abort());
});

test('kit demo loads without page errors', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const res = await page.goto('_kit/demo.html');
  expect(res?.status()).toBe(200);
  await expect(page.locator('.logo')).toHaveText('Kit demo');
  await expect(page.locator('#app-version')).toContainText('1.0.0');
  // Không có SDK âm thanh thì ẩn hàng Âm thanh
  await page.locator('#btn-settings').click();
  await expect(page.locator('#setting-sound')).toBeHidden();
  expect(errors).toEqual([]);
});

test('kit modal opens from its button, closes on Esc and gives focus back', async ({ page }) => {
  await page.goto('_kit/demo.html');
  await page.locator('#btn-help').click();
  await expect(page.locator('#modal-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-help')).toBeHidden();
  await expect(page.locator('#btn-help')).toBeFocused();
});

test('Escape that closes a kit modal does not reach the game key handler', async ({ page }) => {
  await page.goto('_kit/demo.html');
  // Game đăng ký handler phím sau kit: Esc vừa đóng hộp thoại không được tới đây (kẻo game coi là tạm dừng / chơi tiếp).
  await page.evaluate(() => {
    (window as unknown as { seen: string[] }).seen = [];
    document.addEventListener('keydown', (e) => (window as unknown as { seen: string[] }).seen.push(e.key));
  });
  await page.locator('#btn-help').click();
  await expect(page.locator('#modal-help')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#modal-help')).toBeHidden();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => (window as unknown as { seen: string[] }).seen)).toEqual(['Escape']);
});

test('kit toast shows and hides by itself', async ({ page }) => {
  await page.goto('_kit/demo.html');
  await page.locator('#btn-toast').click();
  await expect(page.locator('#toast')).toHaveText('Hello from the kit (1)');
  await expect(page.locator('#toast')).toBeHidden({ timeout: 4000 });
});

test('kit theme choice applies and is saved', async ({ page }) => {
  await page.goto('_kit/demo.html');
  await page.locator('#btn-settings').click();
  await page.locator('#sw-theme [data-value="dark"]').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('#sw-theme [data-value="dark"]')).toHaveAttribute('aria-checked', 'true');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('playnine-kitdemo-settings-v1') || '{}').theme);
  expect(saved).toBe('dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('kit language switch reloads in Vietnamese and stores playnine-lang', async ({ page }) => {
  await page.goto('_kit/demo.html');
  await page.locator('#btn-settings').click();
  await page.locator('#sw-lang [data-value="vi"]').click();
  await expect(page.locator('.logo')).toHaveText('Thử kit');
  await expect(page.locator('#lang')).toHaveText('vi');
  expect(await page.evaluate(() => localStorage.getItem('playnine-lang'))).toBe('vi');
  await expect(page).toHaveTitle('Thử kit');
});
