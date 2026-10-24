import { test, expect, type Page } from '@playwright/test';

// Ghép Ba trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn bằng engine (tất định theo seed): nước cuối cố định nên điểm cuối biết trước.

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

/** Bỏ hộp hướng dẫn lần đầu; nếu có `save` thì đặt ván lưu (chỉ lần nạp đầu, để tải lại không ghi đè). */
async function seed(page: Page, save?: unknown) {
  await page.addInitScript((s) => {
    if (!window.localStorage.getItem('playnine-ghepba-settings-v1')) {
      window.localStorage.setItem('playnine-ghepba-settings-v1', JSON.stringify({ guideSeen: true }));
    }
    if (s && !window.sessionStorage.getItem('ghepba-seeded')) {
      window.sessionStorage.setItem('ghepba-seeded', '1');
      window.localStorage.setItem('playnine-ghepba-save-v1', JSON.stringify({ v: 1, game: s }));
    }
  }, save ?? null);
}

/** Chạm ô (hàng r, cột c) trên canvas bàn (lề 2% cạnh bàn, 8 ô mỗi cạnh — khớp app.js). */
async function tapCell(page: Page, r: number, c: number) {
  const board = page.frameLocator('iframe').locator('#board');
  const box = await board.boundingBox();
  if (!box) throw new Error('no board');
  const pad = Math.round(box.width * 0.02);
  const cs = (box.width - 2 * pad) / 8;
  await board.click({ position: { x: pad + (c + 0.5) * cs, y: pad + (r + 0.5) * cs } });
}

// seed 2026 sau 29 nước (engine.newGame({ seed: 2026 }), mỗi nước lấy findMoves()[0]); nước thứ 30: (1,3) ↔ (1,4) → 2140 điểm
const LAST_MOVE = {
  v: 1, mode: 'classic', date: null, seed: 2026, rng: 105155520,
  board: [5, 2, 2, 9, 4, 1, 2, 3, 0, 1, 4, 0, 10, 5, 4, 1, 0, 3, 0, 4, 0, 1, 4, 1, 2, 5, 1, 1, 0, 13, 3, 0, 1, 5, 0, 0, 5, 1, 3, 3, 5, 4, 3, 2, 0, 2, 1, 4, 4, 1, 2, 1, 5, 1, 5, 4, 3, 2, 3, 4, 4, 2, 4, 5],
  score: 2110, moves: 29, maxChain: 4, made: 5,
};
// seed 31 sau 3 nước
const MID_GAME = {
  v: 1, mode: 'classic', date: null, seed: 31, rng: 3463731766,
  board: [2, 5, 1, 1, 3, 5, 0, 5, 3, 3, 2, 2, 3, 2, 4, 0, 0, 4, 0, 0, 5, 5, 3, 4, 0, 5, 3, 0, 1, 1, 4, 1, 1, 4, 3, 5, 4, 5, 5, 1, 2, 2, 0, 5, 0, 2, 0, 3, 5, 5, 3, 4, 3, 2, 0, 5, 4, 5, 4, 1, 4, 3, 5, 4],
  score: 510, moves: 3, maxChain: 3, made: 0,
};

test('ghepba reports the score when the 30th move ends the game', async ({ page }) => {
  await captureMessages(page);
  await seed(page, LAST_MOVE);
  await page.goto('#/play/ghepba');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#moves')).toHaveText('1');
  await expect(frame.locator('#score')).toHaveText('2,110');
  // Chạm viên (1,3) rồi viên kề (1,4)
  await tapCell(page, 1, 3);
  await tapCell(page, 1, 4);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ghepba', mode: 'classic', won: false, score: 2140, assisted: false });
  await expect(frame.locator('#modal-over')).toBeVisible({ timeout: 8000 });
  await expect(frame.locator('#over-score')).toHaveText('2,140');
  await expect(frame.locator('#moves')).toHaveText('0');
});

test('ghepba reports a lost run with the current score when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  await seed(page, MID_GAME);
  await page.goto('#/play/ghepba');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('510');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ghepba', mode: 'classic', won: false, score: 510 });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
  await expect(frame.locator('#moves')).toHaveText('30');
});

test('ghepba sends no end before the first move and starts the daily mode', async ({ page }) => {
  await captureMessages(page);
  await seed(page);
  await page.goto('#/play/ghepba');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await frame.locator('#mode-daily').click();
  await expect(frame.locator('#mode-daily')).toHaveAttribute('aria-checked', 'true');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'daily'), { timeout: 5000 })
    .toBe(true);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
