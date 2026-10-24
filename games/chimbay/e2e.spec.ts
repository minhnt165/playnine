import { test, expect, type Page } from '@playwright/test';

// Chim Bay trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Bỏ hộp hướng dẫn lần đầu. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-chimbay-settings-v1')) {
      window.localStorage.setItem('playnine-chimbay-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('chimbay reports the score when a restored run hits the ground', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Lượt lưu: đã bay 25 s (tick 3000), 5 điểm, chim sát mặt đất đang rơi nhanh, cặp tre kế tiếp còn rất xa.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-chimbay-save-v1')) return;
    const game = { v: 1, seed: 1, rng: 12345, phase: 'play', tick: 3000, y: 530, vy: 700, score: 5, flaps: 40, cause: null, pipes: [], nextK: 20, nextX: 6000, lastY: 300 };
    window.localStorage.setItem('playnine-chimbay-save-v1', JSON.stringify({ v: 1, game }));
  });
  await page.goto('#/play/chimbay');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('5');
  // Chơi tiếp: chim đứng chờ; một cú vỗ cánh rồi rơi xuống đất sau khoảng 0,6 s
  await frame.locator('#btn-resume').click();
  await frame.locator('#game-canvas').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'chimbay', mode: 'classic', won: false, score: 5, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('5');
});

test('chimbay reports score 0 when a fresh run falls to the ground', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/chimbay');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic' && !m.resume), { timeout: 5000 })
    .toBe(true);
  // Một cú vỗ cánh rồi để chim rơi: chạm đất sau khoảng 1 s, cặp tre đầu còn xa nên chưa có điểm
  await frame.locator('#game-canvas').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'chimbay', mode: 'classic', won: false, score: 0, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('0');
});

test('chimbay sends no end when a new run is started before the first flap', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/chimbay');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(1);
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
