import { test, expect, type Page } from '@playwright/test';

// Gin Rummy trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Trận dựng sẵn qua ván lưu playnine-ginrummy-save-v1 (đúng dạng E.toJSON trong engine.js).

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

// Tay gin: 4-5-6♥, sám 9, A-2-3-4♠ + K♣ (bỏ K♣ là gin). Tay kia: 7-8-9♣, sám K, lá lẻ J♦ 10♦ 5♣ 3♣ = 28.
const GIN = ['4H', '5H', '6H', '9S', '9H', '9D', 'AS', '2S', '3S', '4S', 'KC'];
const OTHER = ['7C', '8C', '9C', 'KS', 'KH', 'KD', 'JD', '10D', '5C', '3C'];

/** Ván lưu giữa trận: người tới lượt (turn) đang cầm 11 lá ở pha bỏ lá, chồng bỏ chỉ có Q♥, còn lại trong nọc. */
function seedMatch(page: Page, hands: string[][], extra: Record<string, unknown>) {
  const discard = ['QH'];
  const used = new Set([...hands.flat(), ...discard]);
  const game = {
    v: 1,
    level: 'easy',
    bigGin: true,
    scores: [0, 0],
    boxes: [1, 1],
    round: 3,
    dealer: 1,
    rng: 12345,
    stock: ALL.filter((id) => !used.has(id)),
    discard,
    hands,
    turn: 0,
    phase: 'discard',
    passes: 0,
    mustStock: false,
    taken: null,
    took: [[], []],
    threw: [[], []],
    passed: [[], []],
    end: null,
    moves: 12,
    humanMoves: 6,
    last: null,
    ...extra,
  };
  return page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-ginrummy-save-v1')) return;
    window.localStorage.setItem('playnine-ginrummy-save-v1', JSON.stringify({ v: 1, game: g, elapsed: 90000, order: [], manual: false }));
  }, game);
}

test('ginrummy reports a won match when you go gin past 100', async ({ page }) => {
  await captureMessages(page);
  await seedMatch(page, [GIN, OTHER], { level: 'medium', scores: [95, 40] });
  await page.goto('#/play/ginrummy');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Nút Gin (knock với lá lẻ 0) bỏ K♣ rồi lật bài
  await frame.locator('#btn-knock').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ginrummy', mode: 'medium', won: true, assisted: false });
  await expect(frame.locator('#modal-round')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#btn-again')).toBeVisible();
});

test('ginrummy reports a lost match when the computer goes gin past 100', async ({ page }) => {
  await captureMessages(page);
  // Lượt máy (Khó), máy cầm tay gin và đang 95 điểm
  await seedMatch(page, [OTHER, GIN], { level: 'hard', turn: 1, scores: [30, 95], dealer: 0 });
  await page.goto('#/play/ginrummy');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), { timeout: 5000 })
    .toBe(true);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'ginrummy', mode: 'hard', won: false, assisted: false });
});

test('ginrummy reports a lost run when a played match is abandoned, and nothing before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/ginrummy');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa đi nước nào: trận mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Bỏ qua lá mời (nước đầu tiên, trận được lưu) rồi bỏ trận: won false
  await frame.locator('#btn-act').click();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('playnine-ginrummy-save-v1') !== null), { timeout: 5000 })
    .toBe(true);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ginrummy', mode: 'easy', won: false, assisted: false });
});
