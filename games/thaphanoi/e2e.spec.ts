import { test, expect, type Page } from '@playwright/test';

// Tháp Hà Nội trong cổng: ván thắng báo pn:end đúng mode + thời gian; bỏ ván đã đi một nước báo won false.
// Bắt tin nhắn pn:* ở khung trên cùng (cổng không có Supabase vẫn trả pn:ready).

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

test('thaphanoi reports a won run with the solve time', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu 4 đĩa: còn đúng một nước (đĩa 1 từ cọc giữa sang cọc phải), đã 20 giây trên đồng hồ.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-thaphanoi-save-v1')) return;
    window.localStorage.setItem(
      'playnine-thaphanoi-save-v1',
      JSON.stringify({ v: 1, mode: 'd4', game: { v: 1, n: 4, pegs: [[], [1], [4, 3, 2]], moves: 14 }, elapsed: 20000 }),
    );
  });
  await page.goto('#/play/thaphanoi');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'd4'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chạm cọc giữa để nhấc đĩa, chạm cọc phải để đặt
  await frame.locator('.peg[data-peg="1"]').click();
  await frame.locator('.peg[data-peg="2"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'thaphanoi', mode: 'd4', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#win-moves')).toHaveText('15');
});

test('thaphanoi reports a loss when a started board is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/thaphanoi');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'd4'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.peg[data-peg="0"]').click();
  await frame.locator('.peg[data-peg="2"]').click();
  await expect(frame.locator('#moves')).toHaveText('1');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'thaphanoi', mode: 'd4', won: false, assisted: false })]);
  await expect(frame.locator('#moves')).toHaveText('0');
});
