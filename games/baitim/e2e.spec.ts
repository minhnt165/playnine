import { test, expect, type Page } from '@playwright/test';

// Bài Tim trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Trận dựng sẵn qua ván lưu playnine-baitim-save-v1 (đúng dạng E.toJSON trong engine.js): nước cuối của ván 4
// (ván không chuyền), bạn mở bằng 2♦, Tây ăn nước bằng A♦; sau nước này có người chạm 100 nên hết trận.

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
const HANDS = [['2D'], ['AD'], ['3D'], ['4D']];

/** Ván lưu ở nước cuối của ván 4: history là điểm ba ván trước, taken là lá điểm đã ăn ở ván này. */
function seedLastTrick(page: Page, level: string, history: number[][], taken: string[][]) {
  const inHand = new Set(HANDS.flat());
  const scores = [0, 1, 2, 3].map((s) => history.reduce((a, h) => a + h[s], 0));
  const game = {
    v: 1,
    level,
    scores,
    round: 4,
    rng: 12345,
    phase: 'play',
    hands: HANDS,
    passed: null,
    trick: [],
    leader: 0,
    turn: 0,
    tricks: 12,
    broken: true,
    taken,
    played: ALL.filter((id) => !inHand.has(id)),
    voids: [[], [], [], []],
    last: null,
    history: history.map((pts) => ({ pts, moon: -1 })),
    moves: 60,
    humanMoves: 12,
  };
  return page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-baitim-save-v1')) return;
    window.localStorage.setItem('playnine-baitim-save-v1', JSON.stringify({ v: 1, game: g, elapsed: 600000 }));
  }, game);
}

const HEARTS_2_10 = ['2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', '10H'];

test('baitim reports a won match when someone reaches 100 and you have the lowest score', async ({ page }) => {
  await captureMessages(page);
  // Bạn 10 điểm; Tây đã ăn Q♠ + 9 lá cơ ván này (78 + 22 = 100) nên hết trận sau nước cuối
  await seedLastTrick(page, 'easy', [[0, 26, 26, 26], [5, 26, 26, 26], [5, 26, 26, 24]], [[], ['QS', ...HEARTS_2_10], ['JH', 'QH', 'KH'], ['AH']]);
  await page.goto('#/play/baitim');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#hand .hc[data-id="2D"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'baitim', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-round')).toBeVisible({ timeout: 10000 });
  await expect(frame.locator('#btn-again')).toBeVisible();
});

test('baitim reports a lost match when you reach 100', async ({ page }) => {
  await captureMessages(page);
  // Bạn 78 điểm và đã ăn Q♠ + 9 lá cơ ván này (78 + 22 = 100); Tây chỉ 10 điểm nên Tây thắng
  await seedLastTrick(page, 'hard', [[26, 0, 26, 26], [26, 5, 26, 26], [26, 5, 26, 26]], [['QS', ...HEARTS_2_10], [], ['JH', 'QH', 'KH'], ['AH']]);
  await page.goto('#/play/baitim');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#hand .hc[data-id="2D"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'baitim', mode: 'hard', won: false, assisted: false });
});

test('baitim reports a lost run when a played match is abandoned, and nothing before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/baitim');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa đi nước nào: trận mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Chọn 3 lá (sau khi hoạt cảnh chia xong) rồi chuyền (nước đầu tiên, trận được lưu) rồi bỏ trận: won false
  await expect(frame.locator('#hand.deal')).toHaveCount(0, { timeout: 5000 });
  for (const i of [0, 4, 8]) await frame.locator('#hand .hc').nth(i).dispatchEvent('click');
  await expect(frame.locator('#btn-act')).toBeEnabled();
  await frame.locator('#btn-act').click();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('playnine-baitim-save-v1') !== null), { timeout: 5000 })
    .toBe(true);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'baitim', mode: 'medium', won: false, assisted: false });
});
