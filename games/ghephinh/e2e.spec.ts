import { test, expect, type Page } from '@playwright/test';

// Ghép Hình trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

// Bỏ hộp Cách chơi lần đầu để bấm được vào bàn
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-ghephinh-settings-v1')) {
      window.localStorage.setItem('playnine-ghephinh-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('ghephinh reports a won run when the last piece is placed', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: tranh Dễ 4x4 seed 1, đã khóa 15 mảnh, chỉ còn mảnh 0 (ô trên trái) trong khay, đồng hồ 7 giây
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-ghephinh-save-v1')) return;
    const done = [];
    for (let i = 1; i < 16; i++) done.push(i);
    const game = { v: 1, mode: 'easy', seed: 1, date: null, tray: [0], loose: [], done, moves: 15 };
    window.localStorage.setItem('playnine-ghephinh-save-v1', JSON.stringify({ v: 1, game, elapsed: 7000 }));
  });
  await page.goto('#/play/ghephinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#placed')).toHaveText('15/16');
  // Bàn phím: mũi tên chọn mảnh duy nhất trong khay, Enter cầm lên (ô đích bắt đầu ở ô trên trái), Enter đặt
  await frame.locator('#tray').focus();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(frame.locator('#cursor')).toBeVisible();
  await page.keyboard.press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ghephinh', mode: 'easy', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(7000);
  await expect(frame.locator('#placed')).toHaveText('16/16');
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('ghephinh reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/ghephinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Kéo mảnh đầu trong khay lên giữa bàn (khóa hoặc nằm rời đều tính là đã đi một nước)
  const piece = await frame.locator('#tray .piece').first().boundingBox();
  const board = await frame.locator('#board').boundingBox();
  if (!piece || !board) throw new Error('no layout');
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2);
  await page.mouse.down();
  await page.mouse.move(piece.x + piece.width / 2, piece.y + piece.height / 2 - 30, { steps: 3 });
  await page.mouse.move(board.x + board.width / 2, board.y + board.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(frame.locator('#tray .piece')).toHaveCount(15);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ghephinh', mode: 'easy', won: false });
});

test('ghephinh switches size before the first piece without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/ghephinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#modes button[data-mode="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  await expect(frame.locator('#placed')).toHaveText('0/64');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
