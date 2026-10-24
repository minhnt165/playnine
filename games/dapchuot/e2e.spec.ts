import { test, expect, type Page } from '@playwright/test';

// Đập Chuột trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván 60 giây kết thúc bằng won: false kèm điểm (score_high, mode classic).

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
    window.localStorage.setItem('playnine-dapchuot-settings-v1', JSON.stringify({ guideSeen: true }));
  });
}

/**
 * Ván lưu dở ở giây 59,2 với 42 điểm (hạt giống 12345). Sinh bằng engine:
 * toJSON(advance(newGame(12345), 59200).game) rồi đặt score = 42. Mọi lượt trồi đã xong, không còn gì để đập,
 * nên chơi tiếp 0,8 giây là hết giờ với đúng 42 điểm.
 */
function seedLastSecond(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-dapchuot-save-v1';
    if (window.localStorage.getItem(key)) return;
    const res = '222222222222222222222222222242222224222222422224422222242222424242224222222242244422222224'.split('').map(Number);
    const end = [
      2312, 3260, 4365, 5252, 6065, 6969, 7879, 8834, 9712, 10445, 11238, 12279, 12908, 13788, 14097, 15543, 16389, 17097, 17281, 18775,
      19477, 20268, 20886, 22076, 22520, 23499, 23993, 24726, 25616, 26204, 26952, 27088, 28340, 29210, 29625, 30380, 30889, 31584, 32355,
      32566, 33946, 34285, 34953, 35623, 35737, 36754, 37431, 38147, 38758, 39135, 39341, 40390, 40987, 41900, 42182, 42815, 43210, 43354,
      44277, 45143, 45431, 45932, 46608, 47312, 47582, 47975, 48833, 48751, 49573, 50130, 50811, 51105, 51503, 51666, 52753, 53131, 53531,
      53897, 54314, 54900, 55256, 55748, 55832, 56551, 57258, 57451, 57810, 58482, 58642, 59109,
    ];
    const game = {
      v: 1, seed: 12345, t: 59200, score: 42, streak: 0, bestStreak: 0, whacked: 0, whiffs: 0, bombs: 0, escaped: 75, stunUntil: 0,
      res, hp: res.map(() => 0), end,
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

test('dapchuot reports the score with won false when a round runs out of time', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedLastSecond(page);
  await page.goto('#/play/dapchuot');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('42');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'dapchuot', mode: 'classic', won: false, score: 42, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('42');
});

test('dapchuot reports a quit round with its current score, and nothing before the first second', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/dapchuot');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start' && m.mode === 'classic').length, { timeout: 5000 })
    .toBe(1);
  // Chưa chơi tới 1 giây, chưa có điểm: ván mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Chơi quá 1 giây rồi bỏ: hỏi lại, gửi won false với điểm hiện có
  await expect(frame.locator('#time')).toHaveText(/^0:5\d$/, { timeout: 5000 });
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'dapchuot', mode: 'classic', won: false, score: 0, assisted: false });
});
