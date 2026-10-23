import { test, expect, type Page } from '@playwright/test';

// Cờ Thú trong cổng: dựng ván lưu sẵn (playnine-cothu-save-v1) rồi đi một nước để kết thúc ván,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / bỏ ván: won false).
// Bàn 7×9, ô = y * 7 + x, y = 0 là hàng trên (phía Xanh); hang Xanh ở ô 3, hang Đỏ ở ô 59.

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

/** Chuỗi bàn 63 ký tự từ danh sách [chữ, x, y]: chữ hoa là quân Đỏ, chữ thường là quân Xanh (R C D W P T L E). */
function boardOf(pieces: [string, number, number][]) {
  const cells = Array(63).fill('.');
  for (const [ch, x, y] of pieces) cells[y * 7 + x] = ch;
  return cells.join('');
}

/** Ván lưu: bạn cầm Đỏ (đi trước), mức Dễ, tới lượt bạn, đã đi `humanMoves` nước. */
async function seedSave(page: Page, pieces: [string, number, number][], humanMoves: number) {
  const game = { v: 1, board: boardOf(pieces), turn: 0, ply: humanMoves * 2, quiet: 0, seen: [], last: null };
  await page.addInitScript(
    ([g, n]) => {
      if (window.localStorage.getItem('playnine-cothu-save-v1')) return;
      window.localStorage.setItem('playnine-cothu-save-v1', JSON.stringify({ v: 1, level: 'easy', human: 0, humanMoves: n, game: g }));
    },
    [game, humanMoves] as const,
  );
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), {
      timeout: 5000,
    })
    .toBe(true);
}

/** Bấm hai ô: chọn quân ở ô `from` rồi đi tới ô `to` (quân không nhận sự kiện, ô nhận). */
async function playMove(page: Page, from: number, to: number) {
  const frame = page.frameLocator('iframe');
  await frame.locator(`.cell[data-sq="${from}"]`).click();
  await expect(frame.locator(`.cell[data-sq="${to}"]`)).toHaveClass(/target/);
  await frame.locator(`.cell[data-sq="${to}"]`).click();
}

test('cothu entering the enemy den reports a won game', async ({ page }) => {
  await captureMessages(page);
  // Chó Đỏ đứng ở bẫy Xanh (3,1) = ô 10, sát hang Xanh (ô 3); Xanh còn Mèo ở (6,2).
  await seedSave(page, [['D', 3, 1], ['R', 6, 6], ['c', 6, 2], ['l', 0, 0]], 4);
  await page.goto('#/play/cothu');
  await waitResume(page);
  await playMove(page, 10, 3);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cothu', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('cothu losing to the computer reports won false', async ({ page }) => {
  await captureMessages(page);
  // Chuột Xanh đứng ở bẫy Đỏ (3,7) sát hang Đỏ; Đỏ chỉ có Chuột ở góc (6,0) = ô 6, không chặn được.
  // Bạn đi Chuột xuống (6,1) = ô 13, máy (mức nào cũng vậy) vào hang.
  await seedSave(page, [['R', 6, 0], ['r', 3, 7], ['e', 0, 2]], 3);
  await page.goto('#/play/cothu');
  await waitResume(page);
  await playMove(page, 6, 13);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'cothu', mode: 'easy', won: false, assisted: false });
});

test('cothu abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, [['D', 3, 4], ['R', 6, 6], ['c', 6, 2], ['l', 0, 0]], 2);
  await page.goto('#/play/cothu');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cothu', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('cothu re-sends start with the new level when switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/cothu');
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
