import { test, expect, type Page } from '@playwright/test';

// Cờ Lục Giác trong cổng: dựng ván lưu sẵn (playnine-colucgiac-save-v1) rồi đặt một quân để kết thúc ván,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / bỏ ván: won false).
// Bàn 7×7, ô = r * 7 + c; Đỏ nối hàng 0 với hàng 6, Xanh nối cột 0 với cột 6. Ván lưu chỉ giữ danh sách nước.

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

/** Bỏ hộp Cách chơi lần đầu để bấm được bàn. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-colucgiac-settings-v1')) {
      window.localStorage.setItem('playnine-colucgiac-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

/** Ván lưu: bạn cầm Đỏ (đi trước), bàn 7×7 không đổi bên, tới lượt bạn. */
async function seedSave(page: Page, level: string, moves: number[]) {
  const save = { v: 1, opp: 'ai', level, human: 1, humanMoves: Math.ceil(moves.length / 2), seed: 12345, game: { v: 1, n: 7, swap: false, moves } };
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-colucgiac-save-v1')) return;
    window.localStorage.setItem('playnine-colucgiac-save-v1', JSON.stringify(s));
  }, save);
}

async function waitResume(page: Page, mode: string) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);
}

/** Chạm ô `i` (đa giác .hex mang data-i; quân không nhận sự kiện). */
async function place(page: Page, i: number) {
  await page.frameLocator('iframe').locator(`.hex[data-i="${i}"]`).click();
}

test('colucgiac linking the red sides reports a won game', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Đỏ có cột 3 từ hàng 0 tới hàng 5 (ô 3, 10, 17, 24, 31, 38); Xanh rải rác ở cột 0, 1 và góc. Đặt ô 45 (hàng 6, cột 3) là thắng.
  await seedSave(page, 'easy', [3, 0, 10, 7, 17, 14, 24, 42, 31, 43, 38, 48]);
  await page.goto('#/play/colucgiac');
  await waitResume(page, 'easy');
  await place(page, 45);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'colucgiac', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('colucgiac losing to the computer reports won false', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Xanh có hàng 3 từ cột 0 tới cột 5 (ô 21..26), chỉ còn thiếu ô 20 hoặc 27; bạn đặt ô 42 ở góc, máy Vừa thắng ngay.
  await seedSave(page, 'medium', [1, 21, 2, 22, 47, 23, 48, 24, 41, 25, 5, 26]);
  await page.goto('#/play/colucgiac');
  await waitResume(page, 'medium');
  await place(page, 42);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'colucgiac', mode: 'medium', won: false, assisted: false });
});

test('colucgiac abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedSave(page, 'easy', [24, 17]);
  await page.goto('#/play/colucgiac');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'colucgiac', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('colucgiac re-sends start with the new level when switched before the first move', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/colucgiac');
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
