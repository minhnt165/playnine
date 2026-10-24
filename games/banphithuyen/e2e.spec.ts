import { test, expect, type Page } from '@playwright/test';

// Bắn Phi Thuyền trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Game vô tận: hết ván luôn là won: false kèm điểm.

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

/** Đã xem hướng dẫn, tắt tự bắn (đạn tự bắn có thể bắn rơi quả bom dựng sẵn). */
function seedSettings(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('playnine-banphithuyen-settings-v1', JSON.stringify({ theme: 'auto', guideSeen: true, autofire: false, vibrate: false }));
  });
}

/**
 * Ván lưu dở: đợt 1, 1230 điểm, còn 1 tàu ở giữa sân, một quả bom ngay trên đầu tàu.
 * Sinh bằng engine: newGame({ seed: 'e2e' }) rồi sửa lives / score / tick / bombs (fromJSON nhận).
 * Chơi tiếp là bom rơi trúng tàu trong vài tick: hết ván với đúng 1230 điểm.
 */
function seedLastLife(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-banphithuyen-save-v1';
    if (window.localStorage.getItem(key)) return;
    const full = '000111111000011111111110111111111111111111111111111111111111111100001111111000000111111000000111';
    const game = {
      v: 1, rng: 3915540606, wave: 1, score: 1230, lives: 1, extra: false, tick: 600, shots: 0, kills: 0, px: 120,
      alive: '1'.repeat(45), fx: 42, fy: 44, dir: 1, anim: 0, march: 0, stepT: 22,
      shields: [full, full, full, full],
      bullet: null, bombs: [{ x: 120, y: 310, k: 0 }], bombT: 1000, ufo: null, ufoT: 1244, phase: 'play', timer: 0,
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

test('banphithuyen reports the final score with won false when the last ship is hit', async ({ page }) => {
  await captureMessages(page);
  await seedSettings(page);
  await seedLastLife(page);
  await page.goto('#/play/banphithuyen');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('1,230');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'banphithuyen', mode: 'classic', won: false, score: 1230, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('1,230');
});

test('banphithuyen reports a lost run when a started game is abandoned, and nothing before play', async ({ page }) => {
  await captureMessages(page);
  await seedSettings(page);
  await page.goto('#/play/banphithuyen');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  // Chơi hơn 1 giây (bom chưa kịp rơi tới tàu) rồi bỏ ván: hỏi xác nhận, gửi won: false
  await page.waitForTimeout(1500);
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'banphithuyen', mode: 'classic', won: false, assisted: false });
  // Ván mới bắt đầu ngay: thêm một pn:start
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
});
