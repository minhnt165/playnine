import { test, expect, type Page } from '@playwright/test';

// Xếp Khối trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

test('xepkhoi reports the score when no piece fits any more', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: bàn kín trừ các ô (r + c) % 3 === 0 (không hàng / cột nào đầy, không hai ô trống liền nhau).
  // Khay: ô đơn, thanh ngang 3, vuông 3x3. Đặt ô đơn vào (0,0) là hết chỗ cho hai khối còn lại.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-xepkhoi-save-v1')) return;
    const board = Array.from({ length: 100 }, (_, i) => ((Math.floor(i / 10) + (i % 10)) % 3 === 0 ? 0 : 1 + (i % 8)));
    const game = { v: 1, seed: 1, rng: 1, board, pieces: ['o1', 'i3h', 'o3'], score: 300, moves: 40, lines: 12 };
    window.localStorage.setItem('playnine-xepkhoi-save-v1', JSON.stringify({ v: 1, game }));
  });
  await page.goto('#/play/xepkhoi');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('300');
  // Chạm khối 1 trong khay rồi chạm ô (0,0) trên bàn
  await frame.locator('#slot-0').click();
  await frame.locator('#board .cell[data-i="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xepkhoi', mode: 'classic', won: false, score: 301, assisted: false });
  await expect(frame.locator('#over-banner')).toBeVisible();
  await expect(frame.locator('#slot-1')).toHaveClass(/nofit/);
  await expect(frame.locator('#modal-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText('301');
});

test('xepkhoi reports a lost run with the current score when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xepkhoi');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Bàn trống: khối nào cũng đặt được quanh giữa bàn
  await frame.locator('#slot-0').click();
  await frame.locator('#board .cell[data-i="44"]').click();
  await expect(frame.locator('#score')).not.toHaveText('0');
  const score = Number(await frame.locator('#score').textContent());
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xepkhoi', mode: 'classic', won: false, score });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
});

test('xepkhoi sends no end when a new game is started before the first placement', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xepkhoi');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
