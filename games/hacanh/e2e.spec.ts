import { test, expect, type Page } from '@playwright/test';

// Hạ Cánh trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn (dạng toJSON của engine, địa hình sinh lại từ lvSeed) mở lại ở trạng thái tạm dừng,
// bấm "Chơi tiếp" là chạy.

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

/**
 * Ván lưu ở màn 5 (đã đáp 4 lần), đang bay. Mặt đất luôn thấp hơn 380 nên tàu ở độ cao 450 chưa chạm gì;
 * vy rất âm thì vài phần giây sau đâm xuống và nổ, vy = 0 ở độ cao 700 thì còn rơi lâu.
 */
function savedGame(ships: number, score: number, y: number, vy: number) {
  return {
    v: 1,
    game: {
      v: 1, seed: 1, rng: 1, tick: 3000, level: 5, score, ships, fuel: 300, phase: 'fly', timer: 0, lvSeed: 12345,
      lands: [2, 1, 1], ship: { x: 400, y, vx: 0, vy, a: 0 }, wreck: null,
    },
  };
}

async function seed(page: Page, save: unknown) {
  await page.addInitScript((data) => {
    if (window.localStorage.getItem('playnine-hacanh-save-v1')) return;
    window.localStorage.setItem('playnine-hacanh-save-v1', data);
    window.localStorage.setItem('playnine-hacanh-settings-v1', JSON.stringify({ guideSeen: true }));
  }, JSON.stringify(save));
}

test('hacanh reports the score when the last lander crashes', async ({ page }) => {
  await captureMessages(page);
  // Còn 1 tàu, đang lao xuống rất nhanh: nổ ngay, ~1,7 giây sau hết ván
  await seed(page, savedGame(1, 1230, 450, -200));
  await page.goto('#/play/hacanh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'hacanh', mode: 'classic', won: false, score: 1230, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText('1,230');
});

test('hacanh reports a lost run with the current score when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  // Tàu ở trên cao, rơi từ vận tốc 0: còn bay khá lâu trong lúc bấm Ván mới → xác nhận
  await seed(page, savedGame(3, 870, 700, 0));
  await page.goto('#/play/hacanh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-resume').click();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'hacanh', mode: 'classic', won: false, score: 870, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop(), { timeout: 5000 })
    .toMatchObject({ mode: 'classic', resume: false });
});
