import { test, expect, type Page } from '@playwright/test';

// Phản Xạ trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván ngắm bắn 60 giây kết thúc bằng won: false kèm điểm (score_high, mode classic);
// đo phản ứng gửi mode reaction với điểm 1000 − trung bình (ms).

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

/** Bỏ hộp hướng dẫn lần đầu, chọn sẵn chế độ. */
function presetSettings(page: Page, mode: 'classic' | 'reaction') {
  return page.addInitScript((m) => {
    window.localStorage.setItem('playnine-phanxa-settings-v1', JSON.stringify({ guideSeen: true, mode: m }));
  }, mode);
}

/**
 * Ván ngắm bắn lưu dở ở giây 59,2 với 842 điểm, sân trống (mục tiêu kế tiếp hiện lúc 59,9 giây và chưa kịp biến mất
 * trước khi hết giờ). Không chạm gì thì chơi tiếp 0,8 giây là hết ván với đúng 842 điểm.
 */
function seedLastSecond(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-phanxa-save-v1';
    if (window.localStorage.getItem(key)) return;
    const game = {
      v: 1, mode: 'classic', seed: 12345, rng: 987654321, w: 100, h: 160, t: 59200, nextAt: 59900, nextId: 60, targets: [],
      score: 842, streak: 0, bestStreak: 12, hits: 40, misses: 3, expired: 20, reactSum: 16000, over: false,
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

test('phanxa reports the score with won false when an aim round runs out of time', async ({ page }) => {
  await captureMessages(page);
  await presetSettings(page, 'classic');
  await seedLastSecond(page);
  await page.goto('#/play/phanxa');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#h1')).toHaveText('842');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'phanxa', mode: 'classic', won: false, score: 842, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('842');
});

test('phanxa reports a quit aim round with its current score, and nothing before the first second', async ({ page }) => {
  await captureMessages(page);
  await presetSettings(page, 'classic');
  await page.goto('#/play/phanxa');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start' && m.mode === 'classic').length, { timeout: 5000 })
    .toBe(1);
  // Chưa chơi tới 1 giây, chưa chạm: ván mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Chơi quá 1 giây rồi bỏ: hỏi lại, gửi won false với điểm hiện có
  await expect(frame.locator('#h2')).toHaveText(/^0:5\d$/, { timeout: 5000 });
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'phanxa', mode: 'classic', won: false, score: 0, assisted: false });
});

test('phanxa reaction test reports 1000 minus the average after five tries', async ({ page }) => {
  test.setTimeout(60000);
  await captureMessages(page);
  await presetSettings(page, 'reaction');
  await page.goto('#/play/phanxa');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'reaction'), { timeout: 5000 })
    .toBe(true);
  // Vùng đọc màn hình (#sr) báo "Green, tap now" khi màn chuyển xanh: đợi rồi nhấn Space (≥ 150 ms để không bị tính đoán trước)
  const sr = frame.locator('#sr');
  const ended = async () => (await messages(page)).some((m) => m.type === 'pn:end');
  for (let i = 0; i < 12 && !(await ended()); i++) {
    // Đợi màn xanh hoặc ván xong (tối đa 4 s chờ đỏ + 1,2 s báo kết quả / lỗi)
    const until = Date.now() + 8000;
    let green = false;
    while (Date.now() < until && !(await ended())) {
      if ((await sr.textContent()) === 'Green, tap now') {
        green = true;
        break;
      }
      await page.waitForTimeout(40);
    }
    if (!green) break;
    await page.waitForTimeout(150);
    await page.keyboard.press('Space');
    await expect(sr).not.toHaveText('Green, tap now');
  }
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'phanxa', mode: 'reaction', won: false, assisted: false });
  const msg = (await messages(page)).find((m) => m.type === 'pn:end');
  expect(msg?.score).toBeGreaterThan(0);
  expect(msg?.score).toBeLessThanOrEqual(900);
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-trials li')).toHaveCount(5);
});
