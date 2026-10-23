import { test, expect, type Page } from '@playwright/test';

// Ba Đỉnh trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

test('badinh reports a perfect game when the last card of round 3 is cleared', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: ván 3, hai ván trước đã dọn sạch; trên bàn chỉ còn 6♠ (hàng dưới, đã ngửa), lá đáy 5♥, nọc hết.
  // Đánh 6♠: +1 (chuỗi 1) + 30 dọn sạch + 0 lá nọc -> 500 + 31 = 531, hết trận, cả 3 ván dọn sạch -> won true.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-badinh-save-v1')) return;
    const ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
    const all: string[] = [];
    ['S', 'H', 'D', 'C'].forEach((s) => ranks.forEach((r) => all.push(r + s)));
    const tableau: (string | null)[] = new Array(28).fill(null);
    tableau[23] = '6S';
    const waste = all.filter((id) => id !== '6S' && id !== '5H').concat('5H');
    const rounds = [
      { score: 200, cleared: true, stockLeft: 2 },
      { score: 200, cleared: true, stockLeft: 2 },
    ];
    const game = { v: 1, seed: 1, rng: 1, round: 2, phase: 'play', tableau, stock: [], waste, score: 500, roundScore: 100, streak: 0, bestStreak: 9, actions: 120, rounds };
    window.localStorage.setItem('playnine-badinh-save-v1', JSON.stringify({ v: 1, game }));
  });
  await page.goto('#/play/badinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#score')).toHaveText('500');
  await expect(frame.locator('#round')).toHaveText('3/3');
  await frame.locator('#table .pnc[data-id="6S"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'badinh', mode: 'classic', won: true, score: 531, assisted: false });
  await expect(frame.locator('#modal-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText('531');
  await expect(frame.locator('#over-perfect')).toBeVisible();
});

test('badinh reports a lost run with the current score when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/badinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Trong lúc chia bài (khoảng 1 s) game chưa nhận thao tác: bấm lại tới khi nọc còn 22 lá
  await expect(async () => {
    await frame.locator('#btn-draw').click({ timeout: 1000 });
    await expect(frame.locator('#stock-count')).toHaveText('22', { timeout: 500 });
  }).toPass({ timeout: 5000 });
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'badinh', mode: 'classic', won: false, score: 0, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
});

test('badinh sends no end when a new game is started before the first action', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/badinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
