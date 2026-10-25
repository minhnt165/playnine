import { test, expect, type Page } from '@playwright/test';

// Pinball trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn (dạng toJSON của engine) mở lại ở trạng thái tạm dừng, bấm "Chơi tiếp" là chạy.

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

const FLIPS = [{ a: Math.PI / 6, w: 0 }, { a: (5 * Math.PI) / 6, w: 0 }];
const FX = { bumper: [-99, -99, -99], sling: [-99, -99], target: [-99, -99, -99, -99], lane: [-99, -99, -99], ramp: -99, flip: [-99, -99] };
const COUNT = { ramps: 0, banks: 0, jackpots: 0, multiballs: 0, bumpers: 0 };

/** Ván lưu: bi thứ `ball`, điểm `score`, một bi ở (x, y) với vận tốc (vx, vy). */
function savedGame(ball: number, score: number, x: number, y: number, vx: number, vy: number, lane: boolean) {
  return {
    v: 1,
    game: {
      v: 1, seed: 1, rng: 1831565814, tick: 3000, score, ball, over: false,
      balls: [{ x, y, vx, vy, ramp: null, lane, sens: 0, still: 0 }],
      flips: FLIPS, held: [false, false], plunger: 0, pulling: false, queue: 0, serveT: 0,
      saveArmed: lane, saveT: 0, multi: false, ramps: 0, mult: 1, lanes: [false, false, false], skill: -1, skillT: 0,
      targets: [true, true, true, true], bankT: 0, superT: 0, fx: FX, count: COUNT,
    },
  };
}

async function seed(page: Page, save: unknown) {
  await page.addInitScript((data) => {
    if (window.localStorage.getItem('playnine-pinball-save-v1')) return;
    window.localStorage.setItem('playnine-pinball-save-v1', data);
    window.localStorage.setItem('playnine-pinball-settings-v1', JSON.stringify({ guideSeen: true }));
  }, JSON.stringify(save));
}

test('pinball reports the score when the last ball drains', async ({ page }) => {
  await captureMessages(page);
  // Bi cuối cùng (bi 3), không còn ball save, đang rơi thẳng qua khe giữa hai flipper: chạy tiếp là hết ván
  await seed(page, savedGame(3, 4321, 280, 985, 0, 800, false));
  await page.goto('#/play/pinball');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'pinball', mode: 'classic', won: false, score: 4321, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText('4,321');
});

test('pinball reports a lost run with the current score when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  // Bi 2 đang nằm chờ trên lò xo, đã có 870 điểm: bỏ ván (Ván mới → xác nhận) gửi won: false kèm điểm
  await seed(page, savedGame(2, 870, 573, 952, 0, 0, true));
  await page.goto('#/play/pinball');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-resume').click();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#modal-confirm')).toBeVisible();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'pinball', mode: 'classic', won: false, score: 870, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop(), { timeout: 5000 })
    .toMatchObject({ mode: 'classic', resume: false });
});
