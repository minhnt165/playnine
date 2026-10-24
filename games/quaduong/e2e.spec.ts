import { test, expect, type Page } from '@playwright/test';

// Qua Đường trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; score?: number };

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

test('quaduong reports the score in pn:end when the run ends', async ({ page }) => {
  await captureMessages(page);
  // Lượt lưu dở: vịt ở hàng 3 (kỷ lục 3), "bờ" đại bàng đã sát chân: bấm Chơi tiếp là bị bắt sau vài bước.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-quaduong-save-v1')) return;
    const game = { v: 1, seed: 7, t: 600, x: 4.5, y: 3, hop: null, queue: null, best: 3, edge: 2.98, over: false, cause: null };
    window.localStorage.setItem('playnine-quaduong-save-v1', JSON.stringify({ v: 1, game, ms: 10000, face: 'up' }));
    window.localStorage.setItem('playnine-quaduong-settings-v1', JSON.stringify({ guideSeen: true }));
  });
  await page.goto('#/play/quaduong');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('3');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'quaduong', mode: 'classic', won: false, assisted: false, score: 3 });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('3');
});

test('quaduong reports an abandoned run with its score', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => {
    window.localStorage.setItem('playnine-quaduong-settings-v1', JSON.stringify({ guideSeen: true }));
  });
  await page.goto('#/play/quaduong');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  // Chạm vào bàn chơi = nhảy lên một hàng (hàng 1 luôn trống ở giữa)
  await frame.locator('#canvas').click();
  await expect(frame.locator('#score')).toHaveText('1');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'quaduong', mode: 'classic', won: false, score: 1 });
});
