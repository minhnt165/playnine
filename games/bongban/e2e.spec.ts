import { test, expect, type Page } from '@playwright/test';

// Bóng Bàn trong cổng: dựng trận lưu sẵn (playnine-bongban-save-v1) ở sát điểm cuối, bấm Chơi tiếp bằng bàn phím
// (không đụng chuột: vợt đứng yên nên diễn biến tất định theo rng trong ván lưu), bắt tin nhắn pn:* ở khung trên cùng.
// Hai ván lưu dưới đây đã chạy thử bằng engine (node): mức Dễ, vợt người chơi đứng giữa bàn, không input:
// - WIN  (10-4, bạn giao): bóng giao đi qua vợt máy → 11-4 sau ~3,2 s
// - LOSE (4-10, bạn giao): máy đỡ rồi đánh bóng qua vợt bạn → 4-11 sau ~8 s

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
  first: 1,
  server: 1,
  phase: 'countdown',
  timer: 180,
  tick: 5000,
  served: true,
  winner: null,
  speed: 360,
  rally: 0,
  longest: 0,
  ball: { x: 180, y: 51, vx: 0, vy: 0, spin: 0 },
  pads: [{ x: 180, v: 0 }, { x: 180, v: 0 }],
};
const WIN = { ...base, score: [10, 4], ai: { wait: 0, target: 180, offset: -21.48181684501469, toward: false }, rng: 3663131627 };
const LOSE = { ...base, score: [4, 10], ai: { wait: 0, target: 180, offset: -7.5600677244365215, toward: false }, rng: 3663131628 };
const MID = { ...WIN, score: [2, 1] };

async function seedSave(page: Page, game: object) {
  await page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-bongban-save-v1')) return;
    window.localStorage.setItem('playnine-bongban-save-v1', JSON.stringify({ v: 1, game: g }));
    window.localStorage.setItem('playnine-bongban-settings-v1', JSON.stringify({ guideSeen: true }));
  }, game);
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
}

test('bongban winning the last point reports a won match', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, WIN);
  await page.goto('#/play/bongban');
  await waitResume(page);
  await page.frameLocator('iframe').locator('#btn-start').press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 15000 })
    .toMatchObject({ gameId: 'bongban', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('bongban losing the last point reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, LOSE);
  await page.goto('#/play/bongban');
  await waitResume(page);
  await page.frameLocator('iframe').locator('#btn-start').press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 20000 })
    .toMatchObject({ gameId: 'bongban', mode: 'easy', won: false, assisted: false });
});

test('bongban abandoning a served match reports won false and starts a new one', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, MID);
  await page.goto('#/play/bongban');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'bongban', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop(), { timeout: 5000 })
    .toMatchObject({ mode: 'medium', resume: false });
});

test('bongban starts with the level picked on the start screen', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-bongban-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/bongban');
  const frame = page.frameLocator('iframe');
  await frame.locator('#overlay-start [data-value="hard"]').click();
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  // Bỏ ngay trong lúc đếm ngược quả giao đầu (chưa giao): không gửi pn:end
  await frame.locator('#board').press('n');
  await page.waitForTimeout(300);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
