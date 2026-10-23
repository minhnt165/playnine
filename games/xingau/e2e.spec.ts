import { test, expect, type Page } from '@playwright/test';

// Xí Ngầu trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Ván lưu: 12 ô đã ghi (phần trên đủ 63 nên có +35), chỉ còn ô Cơ hội; vừa lắc lần đầu ra 6-6-5-5-4. */
function seedLastRound(page: Page, scores: Record<string, number | null>) {
  return page.addInitScript((sc) => {
    if (window.localStorage.getItem('playnine-xingau-save-v1')) return;
    const game = { v: 1, seed: 7, rng: 7, dice: [6, 6, 5, 5, 4], held: [false, false, false, false, false], rolls: 1, scores: sc, bonus: 0 };
    window.localStorage.setItem('playnine-xingau-save-v1', JSON.stringify({ v: 1, game }));
  }, scores);
}

test('xingau reports a finished game with the score, won when it reaches 250', async ({ page }) => {
  await captureMessages(page);
  // 63 + 35 (phần trên) + 190 (phần dưới đã ghi) + 26 (Cơ hội) = 314
  await seedLastRound(page, {
    ones: 3, twos: 6, threes: 9, fours: 12, fives: 15, sixes: 18,
    three: 25, four: 20, full: 25, small: 30, large: 40, yacht: 50, chance: null,
  });
  await page.goto('#/play/xingau');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.cat[data-cat="chance"] .cat-val')).toHaveText('26');
  await frame.locator('.cat[data-cat="chance"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xingau', mode: 'classic', won: true, score: 314, assisted: false });
  await expect(frame.locator('#modal-end')).toBeVisible();
  await expect(frame.locator('#end-total')).toHaveText('314');
});

test('xingau reports a finished game below 250 as not won', async ({ page }) => {
  await captureMessages(page);
  // 0 + 0 (phần trên) + 30 (sảnh nhỏ) + 26 (Cơ hội) = 56
  await seedLastRound(page, {
    ones: 0, twos: 0, threes: 0, fours: 0, fives: 0, sixes: 0,
    three: 0, four: 0, full: 0, small: 30, large: 0, yacht: 0, chance: null,
  });
  await page.goto('#/play/xingau');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  await page.frameLocator('iframe').locator('.cat[data-cat="chance"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xingau', mode: 'classic', won: false, score: 56 });
});

test('xingau reports a lost run when a rolled game is abandoned, and nothing before the first roll', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/xingau');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa lắc: ván mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Lắc một lần rồi bỏ ván: won false kèm điểm hiện có (0)
  await frame.locator('#btn-roll').click();
  await expect(frame.locator('#btn-roll')).toBeEnabled();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xingau', mode: 'classic', won: false, score: 0 });
});
