import { test, expect, type Page } from '@playwright/test';

// Nhớ Nhịp trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Bấm sai là hết ván: won: false kèm điểm = chuỗi dài nhất đã lặp lại (score_high, mode classic | hard).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; score?: number; assisted?: boolean; resume?: boolean };

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

/**
 * Ván lưu dở (chỉ đặt một lần, trước khi game ghi đè) + bỏ hộp hướng dẫn lần đầu.
 * Chuỗi theo hạt giống 12345 (khóa trong test.js): 4 ô → 3, 1, 1, 3…; 6 ô → 5, 1, 2…
 */
function seedSave(page: Page, game: { mode: string; seed: number; t: number; score: number }) {
  return page.addInitScript((g) => {
    window.localStorage.setItem('playnine-nhonhip-settings-v1', JSON.stringify({ guideSeen: true }));
    const key = 'playnine-nhonhip-save-v1';
    if (window.localStorage.getItem(key)) return;
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game: Object.assign({ v: 1 }, g) }));
  }, game);
}

test('nhonhip reports the score with won false when a wrong pad ends the game', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, { mode: 'classic', seed: 12345, t: 20000, score: 3 });
  await page.goto('#/play/nhonhip');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('3');
  await frame.locator('#btn-resume').click();
  // Máy phát lại chuỗi 4 bước rồi tới lượt; bước đầu đúng là ô 3, bấm ô 0 là sai
  await expect(frame.locator('#status')).toHaveAttribute('data-phase', 'input', { timeout: 10000 });
  await frame.locator('.pad[data-pad="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nhonhip', mode: 'classic', won: false, score: 3, assisted: false });
  await expect(frame.locator('.pad[data-pad="3"]')).toHaveClass(/expected/);
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('3');
});

test('nhonhip hard mode: repeating the sequence scores, then a wrong pad reports it', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, { mode: 'hard', seed: 12345, t: 20000, score: 2 });
  await page.goto('#/play/nhonhip');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.pad')).toHaveCount(6);
  await frame.locator('#btn-resume').click();
  await expect(frame.locator('#status')).toHaveAttribute('data-phase', 'input', { timeout: 10000 });
  for (const p of [5, 1, 2]) await frame.locator('.pad[data-pad="' + p + '"]').click();
  await expect(frame.locator('#score')).toHaveText('3');
  // Vòng 4: bước đầu vẫn là ô 5, bấm ô 0 là sai
  await expect(frame.locator('#status')).toHaveAttribute('data-phase', 'input', { timeout: 10000 });
  await frame.locator('.pad[data-pad="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'nhonhip', mode: 'hard', won: false, score: 3, assisted: false });
});

test('nhonhip reports a quit game with its score, and nothing for a fresh one', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, { mode: 'classic', seed: 777, t: 15000, score: 2 });
  await page.goto('#/play/nhonhip');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible({ timeout: 5000 });
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'nhonhip', mode: 'classic', won: false, score: 2, assisted: false })]);
  // Màn chờ: bắt đầu rồi bỏ ngay (chưa tới 1 giây, chưa có điểm) thì không hỏi, không gửi pn:end
  await expect(frame.locator('#overlay-start')).toBeVisible();
  await frame.locator('#btn-start').click();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await expect(frame.locator('#overlay-start')).toBeVisible();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start' && !m.resume && m.mode === 'classic').length, { timeout: 5000 })
    .toBe(1);
  expect((await messages(page)).filter((m) => m.type === 'pn:end').length).toBe(1);
});
