import { test, expect, type Page } from '@playwright/test';

// Tangram trong cổng: ván thắng báo pn:end đúng mode + thời gian; thắng nhờ gợi ý báo assisted true;
// bỏ màn đã di chuyển mảnh báo won false. Bắt tin nhắn pn:* ở khung trên cùng (cổng không có Supabase vẫn trả pn:ready).

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

// Lời giải màn "fish" (màn 1) theo dạng lưu của engine: [góc xoay, lật, ax, bx, ay, by] cho 7 mảnh L L M S S Q P.
const FISH = [
  [4, 0, -0.5, 0, 0.5, 0],
  [6, 0, -0.5, 0, 0.5, 0],
  [2, 0, 2.5, 0, -0.5, 0],
  [2, 0, -0.5, 0, 0.5, 0],
  [0, 0, 0.5, 0, 0.5, 0],
  [0, 0, -0.5, 0, 0.5, 0],
  [0, 0, -2.5, 0, 0.5, 0],
];

/** Ván lưu màn fish: 6 mảnh đúng chỗ, hình bình hành (mảnh 7) theo `last`, đã 20 giây trên đồng hồ. */
async function preloadFish(page: Page, last: number[], hints = 0) {
  const save = {
    v: 1,
    game: { v: 1, id: 'fish', pieces: FISH.slice(0, 6).concat([last]), locked: [false, false, false, false, false, false, false], moves: 6, hints },
    elapsed: 20000,
  };
  await page.addInitScript((raw) => {
    if (window.localStorage.getItem('playnine-tangram-save-v1')) return;
    window.localStorage.setItem('playnine-tangram-save-v1', raw);
  }, JSON.stringify(save));
}

test('tangram reports a won run with the solve time', async ({ page }) => {
  await captureMessages(page);
  // hình bình hành lệch nửa ô sang phải: chọn mảnh 7 rồi bấm mũi tên trái là vào đúng chỗ
  await preloadFish(page, [0, 0, -2, 0, 0.5, 0]);
  await page.goto('#/play/tangram');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  const board = frame.locator('#board');
  await board.press('7');
  await board.press('ArrowLeft');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tangram', mode: 'classic', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#solved')).toHaveText('1/42');
});

test('tangram marks a solve that used a hint as assisted', async ({ page }) => {
  await captureMessages(page);
  // hình bình hành còn nằm trong khay: gợi ý đặt nó vào chỗ là xong
  await preloadFish(page, [0, 0, 1.5, 0, 5.5, 0]);
  await page.goto('#/play/tangram');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-hint').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'tangram', mode: 'classic', won: true, assisted: true });
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('tangram reports a loss when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/tangram');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  const board = frame.locator('#board');
  await board.press('1');
  await board.press('ArrowUp');
  await frame.locator('#btn-levels').click();
  await frame.locator('.level[data-id="cat"]').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toEqual([expect.objectContaining({ gameId: 'tangram', mode: 'classic', won: false, assisted: false })]);
  await expect(frame.locator('#puzzle-name')).toHaveText('Cat');
});
