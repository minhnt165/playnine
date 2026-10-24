import { test, expect, type Page } from '@playwright/test';

// Phòng Không trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
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

/** Đã xem hướng dẫn, tắt rung. */
function seedSettings(page: Page) {
  return page.addInitScript(() => {
    window.localStorage.setItem('playnine-phongkhong-settings-v1', JSON.stringify({ theme: 'auto', guideSeen: true, vibrate: false }));
  });
}

/**
 * Ván lưu dở: đợt 1, 2150 điểm, chỉ còn thành phố cuối (số 6) và một tên lửa cách nó 30px.
 * Sinh bằng engine: newGame({ seed: 'e2e' }), chạy 120 tick, rồi sửa cities / score / spawnT và spawnMissile (fromJSON nhận).
 * Chơi tiếp là tên lửa rơi trúng sau khoảng 20 tick: hết ván với đúng 2150 điểm.
 */
function seedLastCity(page: Page) {
  return page.addInitScript(() => {
    const key = 'playnine-phongkhong-save-v1';
    if (window.localStorage.getItem(key)) return;
    const game = {
      v: 1, rng: 188467783, tick: 120, wave: 1, score: 2150, phase: 'play', timer: 0,
      cities: '000001', baseAlive: '111', ammo: [10, 10, 10], bank: 0, nextBonus: 10000,
      toSpawn: 11, spawnT: 600, bombersLeft: 0, bomberT: 446, nextId: 3,
      missiles: [{ id: 2, born: 120, sx: 196, sy: 300, x: 196, y: 300, vx: 0, vy: 1.5, t: 5, tx: 196, ty: 330, split: 0, kind: 0 }],
      bombers: [], shots: [], booms: [], kills: 0, fired: 0, lost: 0,
    };
    window.localStorage.setItem(key, JSON.stringify({ v: 1, game }));
  });
}

test('phongkhong reports the final score with won false when the last city falls', async ({ page }) => {
  await captureMessages(page);
  await seedSettings(page);
  await seedLastCity(page);
  await page.goto('#/play/phongkhong');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await expect(frame.locator('#score')).toHaveText('2,150');
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'phongkhong', mode: 'classic', won: false, score: 2150, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#over-score')).toHaveText('2,150');
});

test('phongkhong reports a lost run when a started game is abandoned, and nothing before play', async ({ page }) => {
  await captureMessages(page);
  await seedSettings(page);
  await page.goto('#/play/phongkhong');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  // Chơi hơn 1 giây (tên lửa đợt 1 chưa kịp rơi tới đất) rồi bỏ ván: hỏi xác nhận, gửi won: false
  await page.waitForTimeout(1500);
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'phongkhong', mode: 'classic', won: false, assisted: false });
  // Ván mới bắt đầu ngay: thêm một pn:start
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
});
