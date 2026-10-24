import { test, expect, type Page } from '@playwright/test';

// Cờ Nhảy trong cổng: dựng ván lưu sẵn (playnine-conhay-save-v1) rồi đi một nước để kết thúc ván,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / bỏ ván: won false).
// Bàn 121 lỗ, ô đánh số theo hàng từ trên xuống (r = -8..8), trong hàng từ trái sang phải;
// chuỗi bàn: '.' trống, '0' quân đỏ (bạn, góc dưới), '1' quân xanh (máy, góc trên). Lỗ là phần tử [data-cell].

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean };

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

// 9 quân đỏ trong góc đích (góc trên) trừ lỗ (2,-5) = ô 7; quân đỏ thứ 10 ở (2,-4) = ô 16, sát lỗ trống.
// Quân xanh ở hàng giữa. Bạn đi 16 → 7 là lấp đầy góc đích.
const WIN_BOARD = '0000000.00......0.......................................111111111.....1..................................................';
// 9 quân xanh trong góc đích của máy (góc dưới) trừ lỗ (-2,5); quân xanh thứ 10 ở (-2,4), bước một ô là thắng.
// Quân đỏ ở hàng r = -2, -3 (xa góc dưới): bạn đi (4,-2) = ô 43 → (4,-3) = ô 31, máy (mức nào cũng vậy) thắng ngay.
const LOSE_BOARD = '...........................000.......0000000............................................................1......11.1111111';

/** Ván lưu: đấu 1 máy mức Dễ, tới lượt bạn, mỗi bên đã đi 20 lượt. */
async function seedSave(page: Page, board: string) {
  const game = { v: 1, players: 2, board, turn: 0, ply: 40, turns: [20, 20], last: null, winner: null, reason: null, seed: 7 };
  await page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-conhay-save-v1')) return;
    window.localStorage.setItem('playnine-conhay-save-v1', JSON.stringify({ v: 1, level: 'easy', opp: 'ai1', humanMoves: 20, game: g }));
  }, game);
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), {
      timeout: 5000,
    })
    .toBe(true);
}

/** Chạm quân ở ô `from` rồi chạm ô đích `to`. */
async function playMove(page: Page, from: number, to: number) {
  const frame = page.frameLocator('iframe');
  await frame.locator(`[data-cell="${from}"]`).click();
  await expect(frame.locator('#layer-marks .dot')).not.toHaveCount(0);
  await frame.locator(`[data-cell="${to}"]`).click();
}

test('conhay filling the goal corner reports a won game', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, WIN_BOARD);
  await page.goto('#/play/conhay');
  await waitResume(page);
  await playMove(page, 16, 7);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'conhay', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('conhay losing to the computer reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, LOSE_BOARD);
  await page.goto('#/play/conhay');
  await waitResume(page);
  await playMove(page, 43, 31);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'conhay', mode: 'easy', won: false, assisted: false });
});

test('conhay abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, WIN_BOARD);
  await page.goto('#/play/conhay');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'conhay', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('conhay re-sends start with the new level when switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/conhay');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-open="modal-settings"]').click();
  await frame.locator('[data-setting="level"] [data-value="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
