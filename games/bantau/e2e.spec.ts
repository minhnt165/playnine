import { test, expect, type Page } from '@playwright/test';

// Bắn Tàu trong cổng: dựng ván lưu sẵn (playnine-bantau-save-v1) rồi bắn một phát để kết thúc ván,
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end (thắng: won true; thua / bỏ ván: won false).
// Ô i = hàng * 10 + cột. Tàu lưu dạng [hàng, cột, độ dài, dọc 0|1]; dấu bắn là chuỗi 100 ký tự
// (0 chưa bắn, 1 trượt, 2 trúng) cho bàn 0 (của bạn, máy bắn vào) và bàn 1 (của máy, bạn bắn vào).

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

// Đội tàu máy: tàu k nằm ngang ở hàng 2k từ cột 0 (dài 5, 4, 3, 3, 2) -> hàng lẻ toàn nước
const AI_FLEET = [[0, 0, 5, 0], [2, 0, 4, 0], [4, 0, 3, 0], [6, 0, 3, 0], [8, 0, 2, 0]];
// Đội tàu của bạn: tàu k nằm dọc ở cột 2k từ hàng 0 -> cột lẻ và hàng 5..9 toàn nước
const MY_FLEET = [[0, 0, 5, 1], [0, 2, 4, 1], [0, 4, 3, 1], [0, 6, 3, 1], [0, 8, 2, 1]];

const cellsOf = (fleet: number[][]) =>
  fleet.flatMap(([r, c, len, v]) => Array.from({ length: len }, (_, k) => (v ? (r + k) * 10 + c : r * 10 + c + k)));

function marksOf(hits: number[], misses: number[]) {
  const m = Array(100).fill('0');
  for (const i of hits) m[i] = '2';
  for (const i of misses) m[i] = '1';
  return m.join('');
}

/** Ván lưu: tới lượt bạn, mỗi bên đã bắn cùng số phát. */
async function seedSave(page: Page, level: string, mine: string, theirs: string, shotsEach: number) {
  const game = { v: 1, seed: 12345, ply: shotsEach * 2, turn: 0, winner: null, fleets: [MY_FLEET, AI_FLEET], marks: [mine, theirs] };
  await page.addInitScript(
    ([g, lv]) => {
      if (window.localStorage.getItem('playnine-bantau-save-v1')) return;
      window.localStorage.setItem('playnine-bantau-save-v1', JSON.stringify({ v: 1, level: lv, last: [-1, -1], game: g }));
    },
    [game, level] as const,
  );
}

async function waitResume(page: Page, mode: string) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === mode), { timeout: 5000 })
    .toBe(true);
}

/** Bạn đã trúng 16/17 ô tàu máy (thiếu ô 81 của Khu trục hạm); máy đã bắn trượt 16 phát (ô 60..75). */
async function seedAlmostWon(page: Page) {
  const aiCells = cellsOf(AI_FLEET).filter((i) => i !== 81);
  const water = Array.from({ length: 16 }, (_, k) => 60 + k);
  await seedSave(page, 'easy', marksOf([], water), marksOf(aiCells, []), 16);
}

test('bantau sinking the last enemy ship reports a won game', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostWon(page);
  await page.goto('#/play/bantau');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#grid-enemy')).toHaveClass(/aiming/);
  await frame.locator('#grid-enemy .cell[data-i="81"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'bantau', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-result')).toBeVisible();
});

test('bantau losing the last ship to the computer reports won false', async ({ page }) => {
  await captureMessages(page);
  // Máy (Vừa) đã trúng hết tàu của bạn trừ ô 18 (Khu trục hạm đã trúng ô 8); ô 7 và 9 cạnh đó đã bắn trượt,
  // nên phát kế tiếp của máy chắc chắn vào ô 18. Bạn đã bắn trượt 18 phát vào các hàng nước của máy.
  const myHits = cellsOf(MY_FLEET).filter((i) => i !== 18);
  const myWater = [...Array.from({ length: 10 }, (_, k) => 10 + k), ...Array.from({ length: 8 }, (_, k) => 30 + k)];
  await seedSave(page, 'medium', marksOf(myHits, [7, 9]), marksOf([], myWater), 18);
  await page.goto('#/play/bantau');
  await waitResume(page, 'medium');
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#grid-enemy')).toHaveClass(/aiming/);
  await frame.locator('#grid-enemy .cell[data-i="99"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'bantau', mode: 'medium', won: false, assisted: false });
});

test('bantau abandoning a started battle reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostWon(page);
  await page.goto('#/play/bantau');
  await waitResume(page, 'easy');
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'bantau', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('bantau re-sends start with the new level when switched before the first shot', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/bantau');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.setup [data-setting="level"] [data-value="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
