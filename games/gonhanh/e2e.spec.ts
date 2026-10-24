import { test, expect, type Page } from '@playwright/test';

// Gõ Nhanh trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Bài gõ kết thúc khi hết giờ: won false kèm điểm = WPM làm tròn (score_high, mode 60s / 30s).

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
    window.localStorage.setItem('playnine-gonhanh-settings-v1', JSON.stringify({ guideSeen: true, mode: '60s' }));
  });
}

/**
 * Bài 60 giây lưu dở ở giây 59,4: dãy từ 'the' / 'and' xen kẽ (360 từ), đã gõ đúng 100 từ = 400 ký tự đúng
 * (3 chữ + 1 dấu cách mỗi từ). Gõ tiếp 0,6 giây không phím nào là hết giờ: WPM = 400 / 5 / 1 phút = 80.
 * Dạng dữ liệu đúng như E.toJSON (engine.js), fromJSON kiểm tra độ dài cum = 59, kps / eps = 60.
 */
function seedLastSecond(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-gonhanh-save-v1';
    if (window.localStorage.getItem(key)) return;
    const words = Array.from({ length: 360 }, (_, i) => (i % 2 ? 'and' : 'the'));
    const cum = Array.from({ length: 59 }, (_, s) => Math.min(400, Math.round(((s + 1) * 400) / 59)));
    const kps = Array.from({ length: 60 }, (_, s) => (s < 59 ? (s < 46 ? 7 : 6) : 0));
    const game = {
      v: 1, mode: '60s', seed: 12345, words, i: 100, typed: words.slice(0, 100), cur: '', started: true, t: 59400, over: false,
      end: null, flagged: null, keys: 400, errors: 0, cum, kps, eps: new Array(60).fill(0), lastAt: 59000, run: 0, bursts: 0, recent: [],
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

test('gonhanh reports the WPM with won false when a test runs out of time', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedLastSecond(page);
  await page.goto('#/play/gonhanh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '60s'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'gonhanh', mode: '60s', won: false, score: 80, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-wpm')).toHaveText('80');
});

test('gonhanh reports a quit test with its current WPM, and nothing before the first key', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/gonhanh');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start' && m.mode === '60s').length, { timeout: 5000 })
    .toBe(1);
  // Chưa gõ phím nào: bài mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Gõ đúng vài từ rồi bỏ: hỏi lại, gửi won false với WPM hiện có
  const words = await frame.locator('#words .w').evaluateAll((els) => els.slice(0, 4).map((e) => e.textContent || ''));
  await frame.locator('#inp').pressSequentially(words.join(' ') + ' ', { delay: 90 });
  await expect(frame.locator('#wpm')).not.toHaveText('–', { timeout: 5000 });
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'gonhanh', mode: '60s', won: false, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end');
  expect(end?.score).toBeGreaterThan(0);
});
