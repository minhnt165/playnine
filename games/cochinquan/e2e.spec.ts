import { test, expect, type Page } from '@playwright/test';

// Cờ Chín Quân trong cổng: ván kết thúc báo đúng pn:end. Dựng ván lưu sẵn (dạng engine v1) qua localStorage rồi chơi nốt.
// Không có Supabase cổng vẫn trả pn:ready; bắt tin nhắn pn:* ở khung trên cùng.
// Điểm bàn cờ đánh số 0–23 (trái → phải, trên → dưới); mỗi điểm là <g class="pt" data-p="…"> trong SVG.

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; timeMs?: number };

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

/** Bàn 24 điểm từ danh sách điểm trắng / đen (1 = trắng, 2 = đen) */
function board(white: number[], black: number[]) {
  return Array.from({ length: 24 }, (_, p) => (white.includes(p) ? 1 : black.includes(p) ? 2 : 0));
}

/** Ghi ván lưu trước khi trang nạp; chỉ ghi một lần để ván xong không bị dựng lại. */
async function seedSave(page: Page, save: object) {
  await page.addInitScript((save) => {
    if (window.sessionStorage.getItem('pn-seeded')) return;
    window.sessionStorage.setItem('pn-seeded', '1');
    window.localStorage.setItem('playnine-cochinquan-save-v1', JSON.stringify(save));
  }, save);
}

const waitResume = (page: Page, mode: string) =>
  expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);

test('cochinquan reports a won run when the computer drops to two pieces', async ({ page }) => {
  await captureMessages(page);
  // Người cầm trắng (0, 1, 14, 20), máy đen còn 3 quân (9, 10, 22). Trắng đi 14 → 2 lập mill 0-1-2 rồi ăn quân 22.
  const game = { v: 1, board: board([0, 1, 14, 20], [9, 10, 22]), turn: 1, hand: [0, 0], plies: 40, quiet: 3, reps: [], last: null };
  await seedSave(page, { v: 1, game, level: 'medium', human: 1, humanMoves: 20, elapsed: 60000 });
  await page.goto('#/play/cochinquan');
  await waitResume(page, 'medium');
  const frame = page.frameLocator('iframe');
  await frame.locator('.pt[data-p="14"]').click();
  await frame.locator('.pt[data-p="2"]').click();
  await expect(frame.locator('.pt[data-p="22"].removable')).toBeVisible();
  await frame.locator('.pt[data-p="22"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cochinquan', mode: 'medium', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(60000);
  await expect(frame.locator('#modal-end')).toBeVisible();
});

test('cochinquan reports a lost run when the computer forms the winning mill', async ({ page }) => {
  await captureMessages(page);
  // Người cầm đen còn 3 quân; tới lượt máy (trắng, mức Vừa) và máy lập mill là thắng ngay.
  const game = { v: 1, board: board([0, 1, 14, 20], [9, 10, 22]), turn: 1, hand: [0, 0], plies: 41, quiet: 3, reps: [], last: null };
  await seedSave(page, { v: 1, game, level: 'medium', human: 2, humanMoves: 20, elapsed: 60000 });
  await page.goto('#/play/cochinquan');
  await waitResume(page, 'medium');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'cochinquan', mode: 'medium', won: false, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-end')).toBeVisible();
});

test('cochinquan reports a draw as won false after fifty quiet moves', async ({ page }) => {
  await captureMessages(page);
  // Đã 99 nửa nước không ai ăn quân: trắng đi 4 → 5 (không lập mill) là hòa.
  const game = { v: 1, board: board([0, 4, 10, 20], [2, 9, 22, 23]), turn: 1, hand: [0, 0], plies: 160, quiet: 99, reps: [], last: null };
  await seedSave(page, { v: 1, game, level: 'hard', human: 1, humanMoves: 60, elapsed: 200000 });
  await page.goto('#/play/cochinquan');
  await waitResume(page, 'hard');
  const frame = page.frameLocator('iframe');
  await frame.locator('.pt[data-p="4"]').click();
  await frame.locator('.pt[data-p="5"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'cochinquan', mode: 'hard', won: false });
});

test('cochinquan reports an abandoned game only after the player has moved', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/cochinquan');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.gameId === 'cochinquan' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa đi nước nào: ván mới không hỏi và không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  // Đặt một quân (người cầm trắng, đi trước) rồi bỏ ván: hỏi xác nhận, gửi won: false
  await frame.locator('.pt[data-p="0"]').click();
  await expect(frame.locator('.pt[data-p="0"] .pc')).toBeVisible();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'cochinquan', mode: 'easy', won: false })]);
});
