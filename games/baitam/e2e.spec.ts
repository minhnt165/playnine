import { test, expect, type Page } from '@playwright/test';

// Bài Tám trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Trận dựng sẵn qua ván lưu playnine-baitam-save-v1 (đúng dạng E.toJSON trong engine.js).

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

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const ALL = SUITS.flatMap((s) => RANKS.map((r) => r + s));

/** Ván lưu giữa trận: bốn tay, lá trên cùng `top`, mọi lá còn lại trong nọc. */
function seedMatch(page: Page, hands: string[][], top: string, extra: Record<string, unknown>) {
  const used = new Set([...hands.flat(), top]);
  const game = {
    v: 1,
    level: 'easy',
    target: 100,
    scores: [0, 0, 0, 0],
    round: 2,
    dealer: 3,
    rng: 12345,
    deck: ALL.filter((id) => !used.has(id)),
    pile: [top],
    hands,
    suit: top.slice(-1),
    turn: 0,
    drawn: null,
    voids: [[], [], [], []],
    phase: 'play',
    result: null,
    moves: 12,
    humanMoves: 3,
    last: null,
    ...extra,
  };
  return page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-baitam-save-v1')) return;
    window.localStorage.setItem('playnine-baitam-save-v1', JSON.stringify({ v: 1, game: g, elapsed: 60000 }));
  }, game);
}

test('baitam reports a won match when you go out and reach the target', async ({ page }) => {
  await captureMessages(page);
  // Bạn còn mỗi 7♥ (đánh được lên 2♥) và đang 95 điểm; ba máy còn 60 điểm trên tay
  await seedMatch(page, [['7H'], ['KS', 'QS'], ['KC', 'QC'], ['KD', 'QD']], '2H', { scores: [95, 0, 0, 0] });
  await page.goto('#/play/baitam');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#hand .hc[data-id="7H"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'baitam', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-round')).toBeVisible();
  await expect(frame.locator('#btn-again')).toBeVisible();
});

test('baitam reports a lost match when a computer reaches the target first', async ({ page }) => {
  await captureMessages(page);
  // Lượt của Tây (máy Khó): còn mỗi 5♥, đang 95 điểm
  await seedMatch(page, [['KS', 'QS'], ['5H'], ['KC', 'QC'], ['KD', 'QD']], '2H', { scores: [0, 95, 0, 0], turn: 1, level: 'hard' });
  await page.goto('#/play/baitam');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), { timeout: 5000 })
    .toBe(true);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'baitam', mode: 'hard', won: false, assisted: false });
});

test('baitam reports a lost run when a played match is abandoned, and nothing before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/baitam');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa đi nước nào: trận mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Rút một lá (nước đầu tiên, trận được lưu) rồi bỏ trận: won false
  await frame.locator('#btn-act').click();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('playnine-baitam-save-v1') !== null), { timeout: 5000 })
    .toBe(true);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'baitam', mode: 'easy', won: false, assisted: false });
});
