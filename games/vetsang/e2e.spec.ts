import { test, expect, type Page } from '@playwright/test';

// Vệt Sáng trong cổng: dựng trận lưu sẵn (playnine-vetsang-save-v1) ở giữa hiệp quyết định, bấm Chơi tiếp bằng bàn phím
// (không lái: xe người chơi đi thẳng nên diễn biến tất định theo ván lưu), bắt tin nhắn pn:* ở khung trên cùng.
// Các ván lưu dưới đây đã chạy thử bằng engine (node, xem test "ván lưu dựng sẵn của e2e" trong test.js), mức Dễ:
// - WIN  (2-0): xe máy đã tự quấn vào ngõ cụt một ô → đâm ở tick đầu sau đếm ngược → 3-0 sau ~1,9 s
// - LOSE (0-2): xe người chơi kẹt trong ngõ cụt, không lái thì đâm ở tick đầu → 0-3 sau ~1,9 s
// - MID  (1-1): hai xe đều thoáng, dùng để thử bỏ trận

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

const base = {
  v: 1,
  level: 'easy',
  rng: 12345,
  round: 3,
  draws: 0,
  started: true,
  winner: null,
  last: 0,
  phase: 'play',
  timer: 0,
  time: 600,
  move: 0,
  ticks: 10,
  queue: [],
};
const freeA = { x: 10, y: 30, dir: 0, alive: true, path: [10, 34, 10, 30] };
const freeB = { x: 29, y: 9, dir: 2, alive: true, path: [29, 5, 29, 9] };
const trapB = { x: 21, y: 7, dir: 2, alive: true, path: [20, 4, 20, 8, 22, 8, 22, 6, 21, 6, 21, 7] };
const trapA = { x: 18, y: 32, dir: 0, alive: true, path: [19, 35, 19, 31, 17, 31, 17, 33, 18, 33, 18, 32] };
type Bike = typeof freeA;
const make = (a: Bike, b: Bike, score: number[]) => ({ ...base, score, bikes: [a, b], hist: [[[a.x, a.y, a.dir]], [[b.x, b.y, b.dir]]] });
const WIN = make(freeA, trapB, [2, 0]);
const LOSE = make(trapA, freeB, [0, 2]);
const MID = make(freeA, freeB, [1, 1]);

async function seedSave(page: Page, game: object) {
  await page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-vetsang-save-v1')) return;
    window.localStorage.setItem('playnine-vetsang-save-v1', JSON.stringify({ v: 1, game: g }));
    window.localStorage.setItem('playnine-vetsang-settings-v1', JSON.stringify({ guideSeen: true }));
  }, game);
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
}

test('vetsang winning the deciding round reports a won match', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, WIN);
  await page.goto('#/play/vetsang');
  await waitResume(page);
  await page.frameLocator('iframe').locator('#btn-start').press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'vetsang', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('vetsang losing the deciding round reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, LOSE);
  await page.goto('#/play/vetsang');
  await waitResume(page);
  await page.frameLocator('iframe').locator('#btn-start').press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'vetsang', mode: 'easy', won: false, assisted: false });
});

test('vetsang abandoning a started match reports won false and starts a new one', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, MID);
  await page.goto('#/play/vetsang');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'vetsang', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop(), { timeout: 5000 })
    .toMatchObject({ mode: 'medium', resume: false });
});

test('vetsang starts with the level picked on the start screen', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-vetsang-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/vetsang');
  const frame = page.frameLocator('iframe');
  await frame.locator('#overlay-start [data-value="hard"]').click();
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  // Bỏ ngay trong lúc đếm ngược hiệp đầu (chưa chạy): không gửi pn:end
  await frame.locator('#board').press('n');
  await page.waitForTimeout(300);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
