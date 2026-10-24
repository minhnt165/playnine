import { test, expect, type Page } from '@playwright/test';

// Xoay Cờ trong cổng: dựng ván lưu sẵn (playnine-xoayco-save-v1) rồi đi một nước (chạm ô, chạm mũi tên xoay)
// để kết thúc ván, bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / bỏ ván: won false).
// Bàn 6×6, ô = hàng * 6 + cột (hàng 0 ở trên); chuỗi bàn 36 ký tự '.' trống, 'W' Trắng (đi trước), 'B' Đen.
// Mũi tên .rot[data-i]: 0 góc trên trái phải, 1 góc trên trái trái, 2 góc trên phải trái, 3 góc trên phải phải,
// 4 góc dưới trái trái, 5 góc dưới trái phải, 6 góc dưới phải phải, 7 góc dưới phải trái (phải = theo kim đồng hồ).

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

/** Ván lưu: bạn cầm Trắng, mức Dễ, tới lượt bạn (số quân Trắng = số quân Đen), đã đi `humanMoves` nước. */
async function seedSave(page: Page, rows: string[], humanMoves: number) {
  const game = { v: 1, board: rows.join(''), last: null };
  await page.addInitScript(
    ([g, n]) => {
      if (window.localStorage.getItem('playnine-xoayco-save-v1')) return;
      window.localStorage.setItem(
        'playnine-xoayco-save-v1',
        JSON.stringify({ v: 1, mode: 'ai', level: 'easy', human: 0, humanMoves: n, seed: 7, game: g }),
      );
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

/** Đặt quân vào ô `cell` rồi bấm mũi tên xoay số `rot`. */
async function playMove(page: Page, cell: number, rot: number) {
  const frame = page.frameLocator('iframe');
  await frame.locator(`.cell[data-s="${cell}"]`).click();
  await expect(frame.locator(`.cell[data-s="${cell}"] .stone`)).toHaveClass(/pending/);
  await expect(frame.locator(`.rot[data-i="${rot}"]`)).toBeEnabled();
  await frame.locator(`.rot[data-i="${rot}"]`).click();
}

test('xoayco five in a row after the twist reports a won game', async ({ page }) => {
  await captureMessages(page);
  // Trắng có bốn quân ở hàng 0; đặt ô 4 rồi xoay góc dưới phải (không chạm hàng 0) là đủ năm.
  await seedSave(page, ['WWWW..', 'BB....', 'BB....', '......', '......', '......'], 4);
  await page.goto('#/play/xoayco');
  await waitResume(page);
  await playMove(page, 4, 6);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xoayco', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('xoayco losing to the computer reports won false', async ({ page }) => {
  await captureMessages(page);
  // Đen có bốn quân ở hàng 5 (ô 30–33). Bạn đặt ô 14 rồi xoay góc trên phải: máy (mức nào cũng vậy) đặt ô 34 là thắng.
  await seedSave(page, ['.W.W..', '......', '.W..W.', '......', '......', 'BBBB..'], 3);
  await page.goto('#/play/xoayco');
  await waitResume(page);
  await playMove(page, 14, 3);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'xoayco', mode: 'easy', won: false, assisted: false });
});

test('xoayco abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, ['W.....', '......', '..B...', '......', '......', '......'], 1);
  await page.goto('#/play/xoayco');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xoayco', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('xoayco re-sends start with the new level when switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xoayco');
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
