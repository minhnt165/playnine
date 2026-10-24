import { test, expect, type Page } from '@playwright/test';

// Cờ Vây trong cổng: dựng ván lưu sẵn (playnine-covay-save-v1) rồi kết thúc ván bằng bỏ lượt / đầu hàng,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / đầu hàng / bỏ ván: won false).
// Bàn 9×9, điểm = r * 9 + c (r hàng từ trên, c cột từ trái), -1 là bỏ lượt. Ván lưu chỉ giữ danh sách nước.

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

/** Bỏ hộp Cách chơi lần đầu để bấm được bàn. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-covay-settings-v1')) {
      window.localStorage.setItem('playnine-covay-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

/** Ván lưu: bạn cầm Đen, bàn 9×9, komi 6,5. */
async function seedSave(page: Page, level: string, moves: number[], humanMoves: number) {
  const save = { v: 1, opp: 'ai', level, human: 1, humanMoves, seed: 12345, game: { v: 1, n: 9, komi: 6.5, moves } };
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-covay-save-v1')) return;
    window.localStorage.setItem('playnine-covay-save-v1', JSON.stringify(s));
  }, save);
}

async function waitResume(page: Page, mode: string) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);
}

const at = (r: number, c: number) => r * 9 + c;

/**
 * Thế đã xong, máy (Trắng) vừa bỏ lượt, tới lượt bạn: Đen tường cột 4 + hàng 4 bên trái (45 điểm),
 * Trắng tường cột 5 + hàng 4 bên phải (36 + 6,5 = 42,5). Bạn bỏ lượt là hết ván, Đen thắng 2,5.
 */
function settledMoves() {
  const black: number[] = [];
  const white: number[] = [];
  for (let r = 0; r < 9; r++) {
    black.push(at(r, 4));
    white.push(at(r, 5));
  }
  for (let c = 0; c < 4; c++) black.push(at(4, c));
  for (let c = 6; c < 9; c++) white.push(at(4, c));
  const moves: number[] = [];
  black.forEach((p, k) => {
    moves.push(p);
    if (k < white.length) moves.push(white[k]);
  });
  moves.push(-1);
  return moves; // 13 nước Đen, 12 nước Trắng, Trắng bỏ lượt
}

test('covay passing after the computer passes on a won count reports a won game', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedSave(page, 'easy', settledMoves(), 13);
  await page.goto('#/play/covay');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-pass').click();
  await frame.locator('#btn-confirm-pass').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'covay', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-result')).toBeVisible();
});

test('covay computer resigning a hopeless game reports a won game', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Đen có bốn hàng quân (hàng 1, 3, 5, 7), Trắng toàn bỏ lượt; 71 nước, tới lượt máy: máy xin thua
  const moves: number[] = [];
  let k = 0;
  for (const r of [1, 3, 5, 7]) {
    for (let c = 0; c < 9; c++) {
      if (k++) moves.push(-1);
      moves.push(at(r, c));
    }
  }
  await seedSave(page, 'hard', moves, 36);
  await page.goto('#/play/covay');
  await waitResume(page, 'hard');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'covay', mode: 'hard', won: true, assisted: false });
});

test('covay resigning reports won false', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedSave(page, 'medium', [at(4, 4), at(2, 6)], 1);
  await page.goto('#/play/covay');
  await waitResume(page, 'medium');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-resign').click();
  await frame.locator('#btn-confirm-resign').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'covay', mode: 'medium', won: false, assisted: false });
});

test('covay abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await seedSave(page, 'easy', [at(4, 4), at(2, 6)], 1);
  await page.goto('#/play/covay');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'covay', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});
