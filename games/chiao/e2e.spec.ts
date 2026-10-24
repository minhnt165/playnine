import { test, expect, type Page } from '@playwright/test';

// Chia Ô trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/*
 * Ván lưu dựng sẵn: đề 7x7 (mode s, hạt giống 2026, lời giải duy nhất), đã vẽ đúng 9 trên 10 hình,
 * còn thiếu hình 1x3 ở hàng cuối, cột 4..6 (chứa số 3 ở ô (6,4)). Đồng hồ đã chạy 5 giây.
 *    .  .  4  .  .  8  .
 *    .  8  .  .  .  .  4
 *    .  .  .  .  .  .  .
 *    .  .  .  .  .  .  .
 *    .  .  5  3  6  .  .
 *    .  6  .  2  .  .  .
 *    .  .  .  .  3  .  .
 */
const SAVE = {
  v: 1,
  game: {
    v: 1,
    mode: 's',
    seed: 2026,
    clues: [[1, 1, 8], [0, 2, 4], [0, 5, 8], [1, 6, 4], [4, 2, 5], [4, 3, 3], [5, 1, 6], [4, 4, 6], [5, 3, 2], [6, 4, 3]],
    rects: [[0, 0, 4, 2], [0, 2, 2, 2], [0, 4, 4, 2], [0, 6, 4, 1], [2, 2, 5, 1], [2, 3, 3, 1], [4, 0, 3, 2], [4, 4, 2, 3], [5, 3, 2, 1]],
    undo: [],
    redo: [],
    moves: 9,
    hints: 0,
  },
  elapsed: 5000,
};

async function seedSave(page: Page) {
  await page.addInitScript((save) => {
    if (window.localStorage.getItem('playnine-chiao-save-v1')) return;
    window.localStorage.setItem('playnine-chiao-save-v1', JSON.stringify(save));
  }, SAVE);
}

async function waitResumed(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
}

test('chiao reports a won run when the last rectangle is dragged', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page);
  await page.goto('#/play/chiao');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#rects .rect')).toHaveCount(9);
  // Kéo từ ô (6,4) sang ô (6,6): ô thứ 6*7+4 và 6*7+6
  const a = await frame.locator('#cells .cell').nth(46).boundingBox();
  const b = await frame.locator('#cells .cell').nth(48).boundingBox();
  if (!a || !b) throw new Error('board not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(a.x + a.width * 1.5, a.y + a.height / 2, { steps: 4 });
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'chiao', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#filled')).toHaveText('100%');
});

test('chiao reports an assisted win when a hint places the last rectangle', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page);
  await page.goto('#/play/chiao');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-hint').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'chiao', mode: 's', won: true, assisted: true });
  await expect(frame.locator('#win-assisted')).toBeVisible();
});

test('chiao reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/chiao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Một nước: kéo hình 1x2 ở góc trên trái (đúng hay sai đều là một nước)
  const a = await frame.locator('#cells .cell').nth(0).boundingBox();
  const b = await frame.locator('#cells .cell').nth(1).boundingBox();
  if (!a || !b) throw new Error('board not visible');
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(frame.locator('#rects .rect')).toHaveCount(1);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'chiao', mode: 's', won: false });
});

test('chiao switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/chiao');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-size').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('m');
  await expect(frame.locator('#cells .cell')).toHaveCount(100);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
