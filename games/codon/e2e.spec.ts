import { test, expect, type Page } from '@playwright/test';

// Cờ Đơn trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn chỉ là lịch sử nước đi (chỉ số trong board.jumps của engine); game đi lại lịch sử khi mở.

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

/** Ghi ván lưu một lần (lần mở sau, game đã tự ghi / xóa ván lưu thì không đè). */
async function seedSave(page: Page, save: unknown) {
  await page.addInitScript((s) => {
    if (window.sessionStorage.getItem('codon-seeded')) return;
    window.sessionStorage.setItem('codon-seeded', '1');
    window.localStorage.setItem('playnine-codon-save-v1', JSON.stringify(s));
  }, save);
}

test('codon reports a perfect won run on the English board', async ({ page }) => {
  await captureMessages(page);
  // 30 nước đầu của một lời giải về tâm: còn 2 quân, nước cuối là quân ở lỗ 18 nhảy qua lỗ 17 vào tâm (lỗ 16).
  await seedSave(page, {
    v: 1,
    game: {
      v: 1,
      board: 'english',
      history: [7, 13, 0, 4, 48, 32, 0, 66, 70, 71, 75, 32, 11, 46, 5, 33, 71, 42, 50, 20, 11, 27, 17, 8, 41, 65, 28, 57, 65, 69],
      made: 30,
      assisted: false,
    },
    elapsed: 20000,
  });
  await page.goto('#/play/codon');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'english'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#pegs')).toHaveText('2');
  await frame.locator('.hole[data-i="18"]').click();
  await frame.locator('.hole[data-i="16"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'codon', mode: 'english', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#win-text')).toContainText('31');
});

test('codon marks a run solved with a hint as assisted', async ({ page }) => {
  await captureMessages(page);
  // Tam giác: 12 nước của một lời giải, còn 2 quân; nước cuối lấy từ nút Gợi ý (bộ giải chạy trong worker).
  await seedSave(page, {
    v: 1,
    game: { v: 1, board: 'triangle', history: [7, 25, 20, 4, 27, 32, 17, 0, 23, 4, 9, 26], made: 12, assisted: false },
    elapsed: 15000,
  });
  await page.goto('#/play/codon');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'triangle'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-hint').click();
  await expect(frame.locator('.hole.hint-to')).toHaveCount(1, { timeout: 8000 });
  await frame.locator('.hole.hint-to').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'codon', mode: 'triangle', won: true, assisted: true });
});

test('codon reports a loss when a stuck board is given up', async ({ page }) => {
  await captureMessages(page);
  // Tam giác kẹt: còn 3 quân, hết nước nhảy; mở lại thì hộp "Hết nước nhảy" hiện ngay.
  await seedSave(page, {
    v: 1,
    game: { v: 1, board: 'triangle', history: [7, 31, 17, 4, 27, 22, 3, 33, 19, 5, 35], made: 11, assisted: false },
    elapsed: 9000,
  });
  await page.goto('#/play/codon');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#modal-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#pegs')).toHaveText('3');
  await frame.locator('#btn-over-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'codon', mode: 'triangle', won: false, assisted: false })]);
  await expect(frame.locator('#pegs')).toHaveText('14');
});

test('codon reports a loss when a started board is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/codon');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'english'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Nước đầu: quân ở lỗ 4 nhảy qua lỗ 9 vào tâm (lỗ 16)
  await frame.locator('.hole[data-i="4"]').click();
  await frame.locator('.hole[data-i="16"]').click();
  await expect(frame.locator('#pegs')).toHaveText('31');
  // Đi lại về thế đầu vẫn là ván đã đi: bỏ ván vẫn tính thua
  await frame.locator('#btn-undo').click();
  await expect(frame.locator('#pegs')).toHaveText('32');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'codon', mode: 'english', won: false, assisted: false })]);
});
