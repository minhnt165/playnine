import { test, expect, type Page } from '@playwright/test';
import { manifests } from './manifests';

// Mỗi game đã nối SDK (theo games/*/game.json): mở trong cổng thì gửi pn:hello rồi pn:start với một mode có trong manifest.
// Không có Supabase cổng vẫn trả pn:ready; bắt tin nhắn ở khung trên cùng. Game cần bấm nút mới bắt đầu ván khai e2e.start.

type Msg = { type: string; gameId?: string; mode?: string };

async function captureMessages(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top) return;
    const w = window as unknown as { __pn: unknown[] };
    w.__pn = [];
    window.addEventListener('message', (e) => {
      if (e.data && typeof e.data === 'object' && String(e.data.type).startsWith('pn:')) w.__pn.push(e.data);
    });
  });
}

const messages = (page: Page) => page.evaluate(() => (window as unknown as { __pn: Msg[] }).__pn);

for (const g of manifests().filter((x) => x.sdk)) {
  test(`${g.id} reports hello and start through the SDK`, async ({ page }) => {
    await captureMessages(page);
    // Bỏ hộp hướng dẫn lần đầu (game cũ đọc guideSeen trong settings) để bấm được nút bắt đầu
    await page.addInitScript((key) => window.localStorage.setItem(key, JSON.stringify({ guideSeen: true })), `playnine-${g.id}-settings-v1`);
    await page.goto(`#/play/${g.id}`);
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:hello' && m.gameId === g.id), { timeout: 5000 })
      .toBe(true);
    if (g.start) await page.frameLocator('iframe').locator(g.start).first().click();
    await expect
      .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === g.id && g.modes.includes(m.mode ?? '')), {
        timeout: 8000,
      })
      .toBe(true);
  });
}
