import { test, expect, type Page } from '@playwright/test';

// Đoán Mã trong cổng: ván kết thúc báo đúng pn:end. Dựng ván lưu sẵn (mã bí mật đã biết) qua localStorage rồi chơi nốt.
// Không có Supabase cổng vẫn trả pn:ready; bắt tin nhắn pn:* ở khung trên cùng.

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

/** Ghi ván lưu (dạng engine v1) trước khi trang nạp; chỉ ghi một lần để ván xong không bị dựng lại. */
async function seedSave(page: Page, mode: string, game: object, elapsed: number) {
  await page.addInitScript(
    ({ mode, game, elapsed }) => {
      if (window.localStorage.getItem('playnine-doanma-save-v1')) return;
      window.localStorage.setItem('playnine-doanma-settings-v1', JSON.stringify({ theme: 'auto', mode }));
      window.localStorage.setItem('playnine-doanma-save-v1', JSON.stringify({ v: 1, game, elapsed }));
    },
    { mode, game, elapsed },
  );
}

const waitResume = (page: Page, mode: string) =>
  expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);

test('doanma reports a won run with the solve time', async ({ page }) => {
  await captureMessages(page);
  // Dễ: mã đỏ cam vàng xanh lá (0 1 2 3), đã đoán sai một lần, 30 giây trên đồng hồ.
  await seedSave(page, 'easy', { v: 1, mode: 'easy', secret: [0, 1, 2, 3], rows: [[5, 4, 3, 2]], current: [null, null, null, null], started: true }, 30000);
  await page.goto('#/play/doanma');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  for (const c of [0, 1, 2, 3]) await frame.locator(`.pal[data-c="${c}"]`).click();
  await frame.locator('#btn-submit').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'doanma', mode: 'easy', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(30000);
  await expect(frame.locator('#modal-end')).toBeVisible();
});

test('doanma reports a lost run when the last guess misses', async ({ page }) => {
  await captureMessages(page);
  // Khó: 11 lần đoán sai, hàng thứ 12 đã điền đủ (vẫn sai): bấm Kiểm tra là hết lượt.
  const rows = Array.from({ length: 11 }, () => [7, 7, 7, 7, 7]);
  await seedSave(page, 'hard', { v: 1, mode: 'hard', secret: [0, 0, 1, 2, 3], rows, current: [6, 6, 6, 6, 6], started: true }, 90000);
  await page.goto('#/play/doanma');
  await waitResume(page, 'hard');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-submit').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'doanma', mode: 'hard', won: false, assisted: false });
  await expect(frame.locator('#secret-row.open')).toBeVisible();
});

test('doanma reports an abandoned game only after a peg was placed', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/doanma');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'doanma' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa điền chốt nào: ván mới không hỏi và không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  // Điền một chốt rồi bỏ ván: hỏi xác nhận, gửi won: false
  await frame.locator('.pal[data-c="0"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'doanma', mode: 'easy', won: false })]);
});
