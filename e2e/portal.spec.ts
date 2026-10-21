import { test, expect } from '@playwright/test';

// Tên test là hợp đồng "ngang bằng" - giữ nguyên khi chuyển sang cổng React (Task 8).

test('home lists 18 games', async ({ page }) => {
  await page.goto('');
  await expect(page.locator('#games > li')).toHaveCount(18);
});

test('filter persists after reload', async ({ page }) => {
  await page.goto('');
  const btn = () => page.locator('#filters button').nth(1);
  await btn().click();
  await expect(btn()).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(btn()).toHaveAttribute('aria-pressed', 'true');
  const count = Number(await btn().locator('b').innerText());
  await expect(page.locator('#games > li:not([hidden])')).toHaveCount(count);
});

test('language toggle', async ({ page }) => {
  await page.goto('');
  await page.locator('#lang-btn').click();
  await expect(page.locator('h1')).toContainText('chơi gì?');
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await page.locator('#lang-btn').click();
  await expect(page.locator('h1')).toContainText('play today?');
});

test('theme toggle cycles', async ({ page }) => {
  await page.goto('');
  const html = page.locator('html');
  await page.locator('#theme-btn').click();
  await expect(html).toHaveAttribute('data-theme', 'light');
  await page.locator('#theme-btn').click();
  await expect(html).toHaveAttribute('data-theme', 'dark');
  await page.locator('#theme-btn').click();
  await expect(html).not.toHaveAttribute('data-theme', /.*/);
});

test('resume tile from summary', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'playnine-2048-summary-v1',
      JSON.stringify({ v: 1, updatedAt: Date.now(), played: 3, won: 1, resume: { title: '<b>x</b> 1234', detail: 'd' } }),
    );
  });
  await page.goto('');
  await expect(page.locator('#today .tile-title').first()).toHaveText('<b>x</b> 1234');
});

test('play route opens iframe', async ({ page }) => {
  await page.goto('#/play/2048');
  await expect(page.locator('body')).toHaveClass(/playing/);
  await expect(page.locator('#frames iframe.on')).toHaveAttribute('src', /2048\/index\.html$/);
  await expect(page).toHaveTitle('2048 · PlayNine');
});

test('back from deep link goes home', async ({ page }) => {
  await page.goto('#/play/2048');
  await page.locator('#p-back').click();
  await expect(page).not.toHaveURL(/#\/play/);
  await expect(page.locator('body')).not.toHaveClass(/playing/);
  await expect(page.locator('#games')).toBeVisible();
});

test('switch game keeps history', async ({ page }) => {
  await page.goto('');
  await page.locator('#games a[href*="2048"]').first().click();
  await expect(page).toHaveURL(/#\/game\/2048$/);
  const preview = page.url();
  await page.locator('.detail-play').click();
  await expect(page).toHaveURL(/#\/play\/2048/);
  await page.locator('#p-switch button:not([aria-current="true"])').first().click();
  await expect(page).not.toHaveURL(/#\/play\/2048/);
  await page.goBack();
  await expect(page).toHaveURL(preview);
  await expect(page.locator('body')).not.toHaveClass(/playing/);
});

test('number shortcut opens game', async ({ page }) => {
  await page.goto('');
  await page.keyboard.press('1');
  await expect(page).toHaveURL(/#\/play\/co9o$/);
});

test('unknown game id shows home', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('#/play/khongco');
  await expect(page.locator('#games')).toBeVisible();
  expect(errors).toEqual([]);
});
