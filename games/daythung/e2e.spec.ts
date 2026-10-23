import { test, expect, type Page } from '@playwright/test';

// Test riêng của Đẩy Thùng chạy trong cổng (#/play/daythung). Không có Supabase: cổng vẫn trả pn:ready,
// nên game gửi pn:start / pn:end; bắt thẳng tin nhắn ở khung trên cùng.

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean };

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

test('daythung reports a cleared level as a won run with assisted false', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu ở màn 1: đã đi 'uulDD' (lời giải đầy đủ là 'uulDDD'), còn đúng một lần đẩy xuống là thắng.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-daythung-save-v1')) return;
    window.localStorage.setItem('playnine-daythung-save-v1', JSON.stringify({ v: 1, game: { v: 1, level: 0, hist: 'uulDD' } }));
  });
  await page.goto('#/play/daythung');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#moves')).toHaveText('5');
  await frame.locator('#btn-level').focus();
  await page.keyboard.press('ArrowDown');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'daythung', mode: 'classic', won: true, assisted: false });
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('daythung reports a restarted level with moves as a lost run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/daythung');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-level').focus();
  // Màn 1: người ở (2,3), ô phía trên trống
  await page.keyboard.press('ArrowUp');
  await expect(frame.locator('#moves')).toHaveText('1');
  // Chơi lại cần bấm R hai lần
  await page.keyboard.press('r');
  await page.keyboard.press('r');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'daythung', mode: 'classic', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
});
