import { test, expect, type Page } from '@playwright/test';

// Bài Bích trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Trận dựng sẵn qua ván lưu playnine-baibich-save-v1 (đúng dạng E.toJSON trong engine.js): còn nước cuối của ván,
// ván này đội nào đạt hợp đồng thì chạm mốc 300.

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

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

type Opts = {
  level: string;
  winners: number[]; // người ăn 12 nước đã xong (nước sau do người ăn nước trước dẫn)
  hands: string[][];
  trick: string[];
  turn: number;
  bids: number[];
  scores: number[];
};

/**
 * Ván lưu ở nước thứ 13: 12 nước đã xong, mỗi nước 4 lá cùng chất liền bậc, lá to nhất ở ghế ăn.
 * Bốn lá còn lại (2♥ 2♦ 2♣ A♠) nằm trên tay / nước đang đánh. Người chia là ghế 3 nên bạn dẫn nước đầu.
 */
function lastTrickSave(o: Opts) {
  const skip = ['2H', '2D', '2C', 'AS'];
  const groups: string[][] = [];
  for (const s of ['H', 'D', 'C', 'S']) {
    const ids = RANKS.map((r) => r + s).filter((id) => !skip.includes(id));
    for (let i = 0; i < ids.length; i += 4) groups.push(ids.slice(i, i + 4));
  }
  let lead = 0;
  const tricks = [0, 0, 0, 0];
  const done = groups.map((g, i) => {
    const win = o.winners[i];
    const cards: string[] = [];
    let k = 0;
    for (let p = 0; p < 4; p++) cards.push((lead + p) % 4 === win ? g[3] : g[k++]);
    const d = { lead, cards, win };
    tricks[win]++;
    lead = win;
    return d;
  });
  return {
    v: 1, level: o.level, target: 300, scores: o.scores, bags: [0, 0], handNo: 4, dealer: 3, rng: 12345,
    hands: o.hands, bids: o.bids, turn: o.turn, lead, trick: o.trick, tricks, broken: true, done,
    phase: 'play', result: null, moves: 55, humanMoves: 13,
  };
}

function seed(page: Page, game: unknown) {
  return page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-baibich-save-v1')) return;
    window.localStorage.setItem('playnine-baibich-save-v1', JSON.stringify({ v: 1, game: g, elapsed: 600000 }));
  }, game);
}

test('baibich reports a won match when your team makes its bid and reaches the target', async ({ page }) => {
  await captureMessages(page);
  // Tây dẫn 2♥, Bắc 2♦, Đông 2♣; bạn còn A♠ (ăn nước cuối): đội bạn ăn 5 + 3 = 8 đúng số báo → 250 + 80 = 330
  await seed(page, lastTrickSave({
    level: 'medium',
    winners: [0, 2, 0, 1, 3, 2, 0, 2, 1, 3, 0, 1],
    hands: [['AS'], [], [], []],
    trick: ['2H', '2D', '2C'],
    turn: 0,
    bids: [5, 3, 3, 2],
    scores: [250, 100],
  }));
  await page.goto('#/play/baibich');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#hand .hc[data-id="AS"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'baibich', mode: 'medium', won: true, assisted: false });
  await expect(frame.locator('#modal-round')).toBeVisible({ timeout: 5000 });
  await expect(frame.locator('#btn-again')).toBeVisible();
});

test('baibich reports a lost match when the computer team reaches the target first', async ({ page }) => {
  await captureMessages(page);
  // Bạn đã dẫn 2♥; Tây (máy Khó) còn A♠ và ăn nước cuối: đội máy ăn 4 + 2 = 6 đúng số báo → 250 + 60 = 310
  await seed(page, lastTrickSave({
    level: 'hard',
    winners: [0, 2, 0, 1, 3, 2, 0, 2, 1, 3, 1, 0],
    hands: [[], ['AS'], ['2D'], ['2C']],
    trick: ['2H'],
    turn: 1,
    bids: [4, 4, 3, 2],
    scores: [100, 250],
  }));
  await page.goto('#/play/baibich');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'hard'), { timeout: 5000 })
    .toBe(true);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'baibich', mode: 'hard', won: false, assisted: false });
});

test('baibich reports a lost run when a played match is abandoned, and nothing before the first move', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/baibich');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  // Chưa đi nước nào: trận mới không hỏi, không gửi pn:end
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeHidden();
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
  // Báo (nước đầu tiên, trận được lưu) rồi bỏ trận: won false
  await frame.locator('#btn-bid').click();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem('playnine-baibich-save-v1') !== null), { timeout: 5000 })
    .toBe(true);
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'baibich', mode: 'medium', won: false, assisted: false });
});
