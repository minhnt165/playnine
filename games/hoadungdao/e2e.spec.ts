import { test, expect, type Page } from '@playwright/test';

// Hoa Dung Đạo trong cổng (#/play/hoadungdao): bắt tin nhắn pn:* ở khung trên cùng
// (không có Supabase cổng vẫn trả pn:ready nên game gửi pn:start / pn:end).

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

test('hoadungdao reports a solved layout as a won run with assisted false', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu ở màn 1 ('.SSS|VHHV|VBBV|VBBV|V.SV', tối thiểu 4 nước): đã đi 3 nước, khay còn lại
  // 'VSSS|VHHV|VBBV|VBBV|S..V'; khối lớn (khối số 6) chỉ còn đi xuống được, một nước nữa là tới lối ra.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-hoadungdao-save-v1')) return;
    window.localStorage.setItem(
      'playnine-hoadungdao-save-v1',
      JSON.stringify({ v: 1, game: { v: 1, level: 0, hist: [[3, 0, 0], [7, 0, 2], [9, 0, 4]] } }),
    );
  });
  await page.goto('#/play/hoadungdao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#moves')).toHaveText('3');
  await expect(frame.locator('#min')).toHaveText('4');
  // Chạm khối lớn: hướng duy nhất còn trống là xuống
  await frame.locator('.blk-B').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'hoadungdao', mode: 'classic', won: true, assisted: false });
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#moves')).toHaveText('4');
  await expect(frame.locator('#win-perfect')).toBeVisible();
});

test('hoadungdao reports a restarted layout with a move as a lost run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/hoadungdao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Màn 1: khối vuông nhỏ ở (2,4) chỉ đi được sang trái vào ô trống (1,4)
  await frame.locator('.blk[data-k="9"]').click();
  await expect(frame.locator('#moves')).toHaveText('1');
  // Chơi lại cần bấm hai lần
  await frame.locator('#btn-restart').click();
  await frame.locator('#btn-restart').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'hoadungdao', mode: 'classic', won: false, assisted: false })]);
  await expect(frame.locator('#moves')).toHaveText('0');
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
});

test('hoadungdao sends no end when the layout is switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/hoadungdao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-level').click();
  await frame.locator('.level-btn').nth(17).click();
  await expect(frame.locator('#min')).toHaveText('81');
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
