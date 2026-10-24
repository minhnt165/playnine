import { test, expect, type Page } from '@playwright/test';

// Chạy Vô Tận trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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
    if (!window.localStorage.getItem('playnine-chayvotan-settings-v1')) {
      window.localStorage.setItem('playnine-chayvotan-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('chayvotan reports the score when a restored run trips over a post', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Lượt lưu (seed 20261024): đứng ở đầu khúc 1 (khúc "cột"), 24 m + 3 xu = 39 điểm. Không bấm gì thì sau
  // 130 bước (≈ 1,1 s, sau 1,5 s đếm ngược) vấp cột ở 43 m: 43 + 3 × 5 = 58 điểm (đã tính bằng engine).
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-chayvotan-save-v1')) return;
    const game = {
      v: 1, seed: 20261024, phase: 'run', tick: 217, x: 600.7058559333359, y: 300, vy: 0, grounded: true, sliding: false,
      coyote: 0, buffer: 0, holding: false, hold: 0, prevJump: false, dj: 0, usedDouble: false, coins: 3, jumps: 0, taken: [], cause: null,
    };
    window.localStorage.setItem('playnine-chayvotan-save-v1', JSON.stringify({ v: 1, game }));
  });
  await page.goto('#/play/chayvotan');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('39');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'chayvotan', mode: 'classic', won: false, score: 58, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('58');
});

test('chayvotan reports the final score when a fresh run crashes without input', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/chayvotan');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic' && !m.resume), { timeout: 5000 })
    .toBe(true);
  // Chạm vào đường chạy để bắt đầu chạy; không nhảy thì sớm vấp cột / rơi hố / đâm bậc
  await frame.locator('#game-canvas').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 30000 })
    .toMatchObject({ gameId: 'chayvotan', mode: 'classic', won: false, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  const end = (await messages(page)).find((m) => m.type === 'pn:end');
  expect(end?.score).toBeGreaterThan(0);
  await expect(frame.locator('#over-score')).toHaveText(String(end?.score));
});

test('chayvotan sends no end when a new run is started before running', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/chayvotan');
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
