import { test, expect, type Page } from '@playwright/test';

// Ô Trống (FreeCell) trong cổng: ván thắng báo pn:end đúng mode + thời gian; thắng sau khi xem gợi ý báo assisted true;
// bỏ ván đã đi báo won false. Bắt tin nhắn pn:* ở khung trên cùng (cổng không có Supabase vẫn trả pn:ready).

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

// Ván #1: 103 nước đầu của lời giải (mỗi nước một nhóm, dạng lưu của engine "từ-tới-số lá").
// Sau các nước này mọi cột đã xếp giảm dần, nút "Xếp nốt" hiện ra. test.js kiểm tra lại dãy này.
const DEAL1_NEAR_WIN = [
  't5c01', 't6c11', 't6c21', 't5c31', 't5f01', 'c3f01', 't5f31', 't6c31', 't6f21', 't2f21', 't5t61', 't0t51',
  't2t11', 'c0t21', 't7c01', 'c2t61', 't7c21', 't7t11', 't0t11', 't7f01', 't7f21', 't7t51', 't0t71', 't0t51',
  't0f31', 't7f31', 't6t02', 'c0t01', 't6c01', 't1t61', 'c2t71', 't4t71', 't6t11', 't6c21', 't4t61', 't4f21',
  'c2t61', 't1t61', 't4c21', 't4f11', 't4t71', 't5t71', 't5f21', 't3f21', 'c1t41', 't5t42', 't1c11', 'c0t51',
  't3t51', 't1t32', 't1c01', 'c1t31', 't1c11', 't1t61', 't7f01', 'c3t61', 't2t72', 't2c31', 'c0t21', 't2t02',
  't3t22', 't4t02', 't4c01', 'c2t41', 't1c21', 'c1t41', 't1c11', 't1f11', 't7f11', 't6f11', 't6f01', 't7f31',
  't7f11', 't7f01', 't3t41', 't6f11', 't6f01', 't7f11', 't6t41', 't3t11', 't3t61', 't3t71', 't3f31', 't0f31',
  't0f21', 'c0f01', 't2f31', 't0f31', 't2f11', 't0f11', 't4f21', 't2f31', 't2f21', 'c3f31', 't4f01', 't0f01',
  't1f21', 't0f21', 't4f11', 't3f01', 't4f31', 't6f21', 't0t12',
];

/** Ván lưu: ván #1 sắp xong, đã 60 giây trên đồng hồ. */
async function preloadNearWin(page: Page) {
  const save = { v: 1, game: { v: 1, deal: 1, hist: DEAL1_NEAR_WIN.map((m) => [m]) }, elapsed: 60000, assisted: false };
  await page.addInitScript((raw) => {
    if (window.localStorage.getItem('playnine-otrong-save-v1')) return;
    window.localStorage.setItem('playnine-otrong-save-v1', raw);
  }, JSON.stringify(save));
}

test('otrong reports a won run with the solve time', async ({ page }) => {
  await captureMessages(page);
  await preloadNearWin(page);
  await page.goto('#/play/otrong');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#deal')).toHaveText('#1');
  await frame.locator('#btn-finish').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'otrong', mode: 'classic', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(60000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('otrong marks a win after a hint as assisted', async ({ page }) => {
  await captureMessages(page);
  await preloadNearWin(page);
  await page.goto('#/play/otrong');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-hint').click();
  await expect(frame.locator('.card.pnc-highlight').first()).toBeVisible({ timeout: 5000 });
  await frame.locator('#btn-finish').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'otrong', mode: 'classic', won: true, assisted: true });
});

test('otrong reports a loss when a started deal is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/otrong');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic' && !m.resume), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // ván mới: ô trống còn trống nên lá trên cùng cột 1 luôn vào được ô trống 1 (phím 1 rồi Q)
  const col = frame.locator('[data-drop="t0"]');
  await col.press('1');
  await col.press('q');
  await expect(frame.locator('#moves')).toHaveText('1');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'otrong', mode: 'classic', won: false, assisted: false })]);
  await expect(frame.locator('#moves')).toHaveText('0');
});
