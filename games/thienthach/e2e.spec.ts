import { test, expect, type Page } from '@playwright/test';

// Thiên Thạch trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
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

/** Ván lưu: tàu ở tâm sân, hết bất tử; rocks là danh sách [x, y, vx, vy] các tảng đá lớn. */
function savedGame(lives: number, score: number, rocks: number[][]) {
  const shape = new Array(11).fill(90);
  return {
    v: 1,
    game: {
      v: 1, seed: 1, rng: 1, tick: 600, score, lives, nextLife: 10000, wave: 1, deadT: 0, saucerT: 5000, waveT: 0, over: false, prevHyper: false,
      ship: { x: 360, y: 360, vx: 0, vy: 0, a: -Math.PI / 2, inv: 0, cd: 0, hyper: 0, hyperCd: 0, thrusting: false },
      rocks: rocks.map(([x, y, vx, vy]) => ({ x, y, vx, vy, s: 3, a: 0, spin: 0, shape })),
      bullets: [], saucer: null, sbullets: [], kills: { rocks: 5, saucers: 0 },
    },
  };
}

async function seed(page: Page, save: unknown) {
  await page.addInitScript((data) => {
    if (window.localStorage.getItem('playnine-thienthach-save-v1')) return;
    window.localStorage.setItem('playnine-thienthach-save-v1', data);
    window.localStorage.setItem('playnine-thienthach-settings-v1', JSON.stringify({ guideSeen: true }));
  }, JSON.stringify(save));
}

test('thienthach reports the score when the last ship is destroyed', async ({ page }) => {
  await captureMessages(page);
  // Còn 1 mạng, tảng đá lớn lao thẳng vào tàu: nổ ngay, đá vỡ (+20), sau ~1,7 giây hết ván
  await seed(page, savedGame(1, 1230, [[420, 360, -2, 0], [100, 100, 0.5, 0.3]]));
  await page.goto('#/play/thienthach');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#overlay-pause')).toBeVisible();
  await frame.locator('#btn-resume').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'thienthach', mode: 'classic', won: false, score: 1250, assisted: false });
  await expect(frame.locator('#overlay-over')).toBeVisible();
  await expect(frame.locator('#over-score')).toHaveText('1,250');
});

test('thienthach reports a lost run with the current score when a started game is abandoned', async ({ page }) => {
  await captureMessages(page);
  // Đá ở xa, trôi chậm: ván giữ nguyên điểm trong lúc bấm Ván mới → xác nhận
  await seed(page, savedGame(3, 870, [[60, 60, 0.2, 0], [660, 660, -0.2, 0]]));
  await page.goto('#/play/thienthach');
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
    .toMatchObject({ gameId: 'thienthach', mode: 'classic', won: false, score: 870, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop(), { timeout: 5000 })
    .toMatchObject({ mode: 'classic', resume: false });
});
