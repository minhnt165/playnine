import { test, expect, type Page } from '@playwright/test';

// Tắt Đèn trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; timeMs?: number };

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

test('tatden reports a won run when the last light goes out', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: bàn 5x5 chỉ sáng hình chữ thập quanh ô giữa (ô 12), đã bấm một lần trước khi chơi lại.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-tatden-save-v1')) return;
    const lights = Array.from({ length: 25 }, (_, i) => ([7, 11, 12, 13, 17].includes(i) ? 1 : 0));
    const game = { v: 1, size: 5, level: 2, seed: 7, par: 1, start: lights, lights, moves: 0, total: 1 };
    window.localStorage.setItem('playnine-tatden-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/tatden');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '5x5'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="12"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tatden', mode: '5x5', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#level')).toHaveText('2');
});

test('tatden reports a lost run when a pressed board is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/tatden');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5x5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="0"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tatden', mode: '5x5', won: false });
});

test('tatden switches size before the first press without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/tatden');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5x5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-size').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('7x7');
  await expect(frame.locator('.cell')).toHaveCount(49);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
