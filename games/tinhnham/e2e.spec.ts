import { test, expect, type Page, type FrameLocator } from '@playwright/test';

// Tính Nhẩm trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
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
    window.localStorage.setItem('playnine-tinhnham-settings-v1', JSON.stringify({ guideSeen: true }));
  });
}

/**
 * Ván lưu dở ở giây 59,2 với 42 điểm (đã trả lời 9 đúng 1 sai, chuỗi dài nhất 6, lên tới mức 3).
 * Câu đang hỏi 3 + 4 ở mức 0 (chuỗi hiện tại 0), ô nhập trống. Chơi tiếp 0,8 giây là hết giờ với đúng 42 điểm.
 */
function seedLastSecond(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-tinhnham-save-v1';
    if (window.localStorage.getItem(key)) return;
    const game = {
      v: 1, seed: 12345, rng: 0, t: 59200, score: 42, streak: 0, bestStreak: 6, correct: 9, wrong: 1, maxLevel: 2,
      q: { a: 3, op: '+', b: 4, level: 0 }, input: '',
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

/** Đọc phép tính trên thẻ câu hỏi và tính đáp án (phép trừ hiển thị bằng dấu − U+2212). */
async function solve(frame: FrameLocator) {
  const a = Number(await frame.locator('#q-a').textContent());
  const b = Number(await frame.locator('#q-b').textContent());
  const op = (await frame.locator('#q-op').textContent()) || '';
  const ans = op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b;
  return String(ans);
}

test('tinhnham reports the score with won false when a round runs out of time', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedLastSecond(page);
  await page.goto('#/play/tinhnham');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('42');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'tinhnham', mode: 'classic', won: false, score: 42, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('42');
});

test('tinhnham scores answers typed on the keypad and reports a quit round with its score', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/tinhnham');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start' && m.mode === 'classic').length, { timeout: 5000 })
    .toBe(1);
  // Chưa trả lời câu nào, chưa tới 1 giây: ván mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Trả lời đúng 4 câu bằng bàn phím ảo: gõ đủ chữ số là tự chấm (mức 0 + mức 1: 1 + 1 + 1 + 2 = 5 điểm)
  for (let i = 0; i < 4; i++) {
    const ans = await solve(frame);
    for (const d of ans) await frame.locator(`#keypad .key[data-key="${d}"]`).click();
    await expect(frame.locator('#streak')).toHaveText(String(i + 1));
  }
  await expect(frame.locator('#score')).toHaveText('5');
  // Bỏ ván: hỏi lại, gửi won false với điểm hiện có
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tinhnham', mode: 'classic', won: false, score: 5, assisted: false });
});
