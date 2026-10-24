import { test, expect, type Page, type FrameLocator } from '@playwright/test';

// Xếp Tầng trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; score?: number };

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
const endMsg = async (page: Page) => (await messages(page)).find((m) => m.type === 'pn:end');

/** Chạm giữa bàn chơi liên tục (mỗi lần là một lần thả) tới khi cổng nhận pn:end. */
async function dropUntilEnd(page: Page, frame: FrameLocator) {
  for (let i = 0; i < 80 && !(await endMsg(page)); i++) {
    await frame.locator('#stage').click();
    await page.waitForTimeout(250);
  }
}

test('xeptang reports the score when the tower falls', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-xeptang-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/xeptang');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic' && !m.resume), { timeout: 5000 })
    .toBe(true);
  // Chạm dồn dập: khối thả sớm chỉ chồng một phần, khối sau hẹp dần rồi trượt hẳn
  await dropUntilEnd(page, frame);
  const end = await endMsg(page);
  expect(end).toMatchObject({ gameId: 'xeptang', mode: 'classic', won: false });
  expect(typeof end?.score).toBe('number');
  await expect(frame.locator('#ov-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText(String(end?.score));
});

test('xeptang resumes a saved tower and reports its score at the end', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: 3 tầng hẹp 6×6 (điểm 4), khối đang trượt đã đi 1 giây nên thả được ngay; gần như chắc chắn trượt hẳn.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-xeptang-save-v1')) return;
    const narrow = { x: 0, z: 0, w: 6, d: 6 };
    const game = {
      v: 1, seed: 5, rng: 12345, hue0: 200, t: 6000,
      layers: [{ x: 0, z: 0, w: 100, d: 100 }, narrow, narrow, narrow],
      blocks: 3, score: 4, streak: 0, bestStreak: 1, perfects: 1, over: false,
      cur: { side: 1, v: 106, spawnT: 5000 },
    };
    window.localStorage.setItem('playnine-xeptang-save-v1', JSON.stringify({ v: 1, game }));
    window.localStorage.setItem('playnine-xeptang-settings-v1', JSON.stringify({ guideSeen: true }));
  });
  await page.goto('#/play/xeptang');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('4');
  await frame.locator('#btn-resume').click();
  await dropUntilEnd(page, frame);
  const end = await endMsg(page);
  expect(end).toMatchObject({ gameId: 'xeptang', mode: 'classic', won: false });
  expect(end?.score ?? 0).toBeGreaterThanOrEqual(4);
  await expect(frame.locator('#over-score')).toHaveText(String(end?.score));
});

test('xeptang reports a lost run when a game played for over a second is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-xeptang-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/xeptang');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  await page.waitForTimeout(1500);
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => endMsg(page), { timeout: 5000 })
    .toMatchObject({ gameId: 'xeptang', mode: 'classic', won: false, score: 0 });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
});
