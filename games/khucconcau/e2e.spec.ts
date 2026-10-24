import { test, expect, type Page } from '@playwright/test';

// Khúc Côn Cầu trong cổng: dựng trận lưu sẵn (playnine-khucconcau-save-v1) ở sát bàn cuối, bấm Chơi tiếp bằng bàn phím
// (không đụng chuột: chày người chơi đứng yên ở chỗ chờ nên diễn biến tất định theo rng trong ván lưu), bắt tin nhắn pn:* ở khung trên cùng.
// Hai ván lưu dưới đây đã chạy thử bằng engine (node, có test trong test.js): mức Dễ, máy được giao đĩa, người chơi không điều khiển:
// - WIN  (6-2): máy đẩy đĩa, đĩa dội chày người chơi rồi vào khung máy → 7-2 sau ~5 s
// - LOSE (2-6): máy đẩy đĩa vào khung người chơi → 2-7 sau ~6 s

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
  phase: 'faceoff',
  timer: 120,
  tick: 6000,
  released: true,
  winner: null,
  receiver: 1,
  half: 1,
  stall: 0,
  shots: 0,
  touch: [-1, -1],
  puck: { x: 180, y: 190, vx: 0, vy: 0 },
  mallets: [{ x: 180, y: 576, vx: 0, vy: 0 }, { x: 180, y: 64, vx: 0, vy: 0 }],
  ai: { wait: 0, tx: 180, ty: 64, err: 0, aimX: 0, aimErr: 0, sign: 0, bank: 0 },
};
const WIN = { ...base, score: [6, 2], rng: 1831566652 };
const LOSE = { ...base, score: [2, 6], rng: 1831565927 };
const MID = { ...WIN, score: [2, 1] };

async function seedSave(page: Page, game: object) {
  await page.addInitScript((g) => {
    if (window.localStorage.getItem('playnine-khucconcau-save-v1')) return;
    window.localStorage.setItem('playnine-khucconcau-save-v1', JSON.stringify({ v: 1, game: g }));
    window.localStorage.setItem('playnine-khucconcau-settings-v1', JSON.stringify({ guideSeen: true }));
  }, game);
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
}

test('khucconcau scoring the 7th goal reports a won match', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, WIN);
  await page.goto('#/play/khucconcau');
  await waitResume(page);
  await page.frameLocator('iframe').locator('#btn-start').press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 20000 })
    .toMatchObject({ gameId: 'khucconcau', mode: 'easy', won: true, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-result')).toBeVisible();
});

test('khucconcau conceding the 7th goal reports won false', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, LOSE);
  await page.goto('#/play/khucconcau');
  await waitResume(page);
  await page.frameLocator('iframe').locator('#btn-start').press('Enter');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 20000 })
    .toMatchObject({ gameId: 'khucconcau', mode: 'easy', won: false, assisted: false });
});

test('khucconcau abandoning a started match reports won false and starts a new one', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, MID);
  await page.goto('#/play/khucconcau');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-start-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'khucconcau', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop(), { timeout: 5000 })
    .toMatchObject({ mode: 'medium', resume: false });
});

test('khucconcau starts with the level picked on the start screen', async ({ page }) => {
  await captureMessages(page);
  await page.addInitScript(() => window.localStorage.setItem('playnine-khucconcau-settings-v1', JSON.stringify({ guideSeen: true })));
  await page.goto('#/play/khucconcau');
  const frame = page.frameLocator('iframe');
  await frame.locator('#overlay-start [data-value="hard"]').click();
  await frame.locator('#btn-start').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  // Bỏ ngay trong lúc chờ thả đĩa lần đầu: không gửi pn:end
  await frame.locator('#board').press('n');
  await page.waitForTimeout(300);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
