import { test, expect, type Page } from '@playwright/test';

// Xì Tố trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Ván lưu dựng sẵn (tính bằng engine.js: bộ bài dựng lại từ handRng, rng phải là trạng thái ngay sau lần xáo). */
function seedSave(page: Page, game: Record<string, unknown>) {
  return page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-xito-save-v1')) return;
    window.localStorage.setItem('playnine-xito-save-v1', JSON.stringify({ v: 1, game: g, elapsed: 600000 }));
    window.localStorage.setItem('playnine-xito-settings-v1', JSON.stringify({ speed: 'fast' }));
  }, game);
}

const profile = [[5, 1, 3, 1], [4, 1, 2, 1], [6, 2, 3, 1], [3, 0, 2, 1]];

/**
 * Ván cuối, mức Vừa: chỉ còn bạn (nút, mù nhỏ 15, A♦ 8♦) và Tùng (ghế 2, 10♠ J♦) đã all-in 20 chip ở mù lớn.
 * Bấm Theo: lật hết lá chung, bạn thắng và ôm đủ 4000 chip.
 */
const lastHandWon = {
  v: 1, level: 'medium', rng: 3215543251, ai: 12345, chips: [3965, 0, 0, 0], button: 0, handNo: 10, humanActed: true, phase: 'bet', profile,
  h: {
    handRng: 4, sbSeat: 0, bbSeat: 2, inHand: [true, false, true, false], folded: [false, false, false, false],
    bets: [15, 0, 20, 0], committed: [15, 0, 20, 0], acted: [false, false, false, false], raises: [0, 0, 0, 0], aggr: [-1, -1, -1, -1],
    street: 0, cur: 30, minRaise: 30, toAct: 0, log: [{ s: 0, a: 'sb', n: 15 }, { s: 2, a: 'bb', n: 20 }],
  },
};

/** Giữa hai ván, mức Khó: bạn chỉ còn 15 chip; ván sau bạn all-in ở mù lớn, máy (hạt ai 12345) theo và thắng. */
const lastHandLost = { v: 1, level: 'hard', rng: 2, ai: 12345, chips: [15, 0, 3985, 0], button: 0, handNo: 9, humanActed: true, phase: 'done', profile };

test('xito reports a won tournament when the player takes every chip', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, lastHandWon);
  await page.goto('#/play/xito');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#btn-call')).toBeEnabled();
  await frame.locator('#btn-call').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'xito', mode: 'medium', won: true, assisted: false });
  await expect(frame.locator('#modal-end')).toBeVisible();
  await expect(frame.locator('#end-place')).toHaveText('1/4');
  await expect(frame.locator('#me-chips')).toHaveText(/4[.,]?000/);
});

test('xito reports a lost tournament when the player runs out of chips', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, lastHandLost);
  await page.goto('#/play/xito');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), { timeout: 5000 })
    .toBe(true);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'xito', mode: 'hard', won: false });
  await expect(page.frameLocator('iframe').locator('#modal-end')).toBeVisible();
});

test('xito reports a loss when a started tournament is abandoned, and nothing before the first action', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-xito-settings-v1', JSON.stringify({ speed: 'fast' })));
  await page.goto('#/play/xito');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  // Chưa nói lần nào: về màn chờ không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  await expect(frame.locator('#start')).toBeVisible();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Giải mới, nói một lần (xem / theo), rồi bỏ giải: won false
  await frame.locator('#btn-start').click();
  await expect(frame.locator('#btn-call')).toBeEnabled({ timeout: 15000 });
  await frame.locator('#btn-call').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'xito', mode: 'medium', won: false, assisted: false });
});
