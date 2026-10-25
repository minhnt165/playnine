import { test, expect, type Page } from '@playwright/test';

// Cột Ngọc trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Bỏ hộp hướng dẫn lần đầu. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-cotngoc-settings-v1')) {
      window.localStorage.setItem('playnine-cotngoc-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('cotngoc reports the score when a restored game tops out', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: 1234 điểm, cột xuất hiện (cột 2) đầy tới hàng nhìn thấy thứ hai, xen kẽ hai màu nên không có hàng;
  // khối [3,4,5] đang nằm ngay miệng giếng → sau trễ khóa 0,5 s khóa vào vùng ẩn → hết ván, điểm giữ nguyên.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-cotngoc-save-v1')) return;
    const grid = new Array(90).fill(0);
    for (let y = 3; y < 15; y++) grid[y * 6 + 2] = y % 2 ? 1 : 2;
    const game = {
      v: 1, seed: 1, rng: 12345, bag: [], grid, piece: { x: 2, y: 2, c: [3, 4, 5] }, next: [1, 2, 3], phase: 'fall',
      tick: 3000, grav: 0, lock: 0, resets: 0, low: 2, clearT: 0, marked: [], chain: 0, score: 1234, level: 1,
      jewels: 0, pieces: 40, drawn: 41, maxChain: 0, cause: null,
    };
    window.localStorage.setItem('playnine-cotngoc-save-v1', JSON.stringify({ v: 1, game }));
  });
  await page.goto('#/play/cotngoc');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'cotngoc', mode: 'classic', won: false, score: 1234, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
});

test('cotngoc reports pn:end when a fresh game is hard-dropped to the top', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/cotngoc');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic' && !m.resume), { timeout: 5000 })
    .toBe(true);
  // Thả thẳng liên tục vào cột giữa: giếng 13 hàng đầy sau vài chục khối (hàng xóa được chỉ kéo dài thêm)
  for (let i = 0; i < 120; i++) {
    if ((await messages(page)).some((m) => m.type === 'pn:end')) break;
    await frame.locator('#game-canvas').press(' ');
    await page.waitForTimeout(60);
  }
  const end = (await messages(page)).find((m) => m.type === 'pn:end');
  expect(end).toMatchObject({ gameId: 'cotngoc', mode: 'classic', won: false, assisted: false });
  expect(end && typeof end.score === 'number' && end.score > 0).toBe(true);
  await expect(frame.locator('#overlay-over')).toBeVisible({ timeout: 5000 });
});

test('cotngoc sends no end when a new game is started right away', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/cotngoc');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(1);
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
