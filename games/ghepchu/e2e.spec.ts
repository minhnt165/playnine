import { test, expect, type Page } from '@playwright/test';

// Ghép Chữ trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Vòng 90 giây kết thúc bằng won: false kèm điểm (score_high, mode classic).

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

/** Bỏ hộp hướng dẫn lần đầu. */
function skipGuide(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('playnine-ghepchu-settings-v1', JSON.stringify({ guideSeen: true }));
  });
}

/**
 * Vòng lưu dở ở giây 89,2 (hạt giống 12345 → từ gốc "wanting", chữ đang xếp "twanign"), đã tìm "wanting" (3000)
 * và "wit" (100) = 3100 điểm. Sinh bằng engine: toJSON(advance(submit(submit(newGame(12345), 'wanting'), 'wit'), 89200)).
 * Đổi words.js (bộ từ gốc) thì phải sinh lại ván này.
 */
function seedLastSecond(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-ghepchu-save-v1';
    if (window.localStorage.getItem(key)) return;
    const game = { v: 1, seed: 12345, base: 'wanting', letters: 'twanign', found: ['wanting', 'wit'], t: 89200 };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

test('ghepchu reports the score with won false when a round runs out of time', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedLastSecond(page);
  await page.goto('#/play/ghepchu');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('3,100');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'ghepchu', mode: 'classic', won: false, score: 3100, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('3,100');
  await expect(frame.locator('#over-found .chip')).toHaveCount(2);
  await expect(frame.locator('#over-missed .chip')).toHaveCount(30);
});

test('ghepchu scores a typed word and reports a quit round, but nothing before the first second', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/ghepchu');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start' && m.mode === 'classic').length, { timeout: 5000 })
    .toBe(1);
  // Chưa chơi tới 1 giây, chưa có điểm: ván mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);

  // Gõ từ dài nhất của vòng (tra bằng engine trong khung game) rồi Enter
  const letters = (await frame.locator('#rack .tile').allTextContents()).join('').toLowerCase();
  const game = page.frames().find((f) => f.url().includes('/ghepchu/'));
  if (!game) throw new Error('không thấy khung game');
  const word = await game.evaluate((l) => (window as unknown as { GameEngine: { wordsFor(s: string): string[] } }).GameEngine.wordsFor(l)[0], letters);
  const points = word.length === 7 ? 3000 : 2000;
  await frame.locator('.found').click();
  await page.keyboard.type(word);
  await page.keyboard.press('Enter');
  await expect(frame.locator('#score')).toHaveText(points.toLocaleString('en-US'));
  await expect(frame.locator('#found-list .chip')).toHaveText([word.toUpperCase()]);

  // Bỏ vòng khi đã có điểm: hỏi lại, gửi won false với điểm hiện có
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ghepchu', mode: 'classic', won: false, score: points, assisted: false });
});
