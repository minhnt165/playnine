import { test, expect, type Page } from '@playwright/test';

// Bi-a trong cổng: dựng ván lưu sẵn (playnine-bia-save-v1) rồi bấm Đánh với góc / lực đã lưu trong ván;
// bắt tin nhắn pn:* ở khung trên cùng và kiểm tra pn:end. Cú đánh dưới đây đã chạy thử bằng engine (node):
// bi cái ở (700, 250), bi 8 ở (850, 400), góc 0,8204 rad (≈ 47°), lực 30% → bi 8 vào lỗ góc dưới phải
// (vẫn vào khi lệch ±0,5°), bi cái không rơi.
// - WIN:  bạn (bi trơn) đã hết nhóm → vào bi 8 là thắng
// - LOSE: bạn còn bi 1 trên bàn → vào bi 8 sớm (và chạm bi 8 trước) là thua

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

/** Ván lưu: mức Dễ, tới lượt bạn (bi trơn), đã đánh 3 cú; còn bi 1 hay không theo tham số. */
function saveOf(solidsLeft: boolean) {
  const balls: number[][] = [];
  for (let n = 0; n < 16; n++) balls.push([20 + n * 10, 480, 0]); // bi đã rơi (vị trí không dùng)
  balls[0] = [700, 250, 1];
  balls[8] = [850, 400, 1];
  balls[9] = [300, 100, 1];
  balls[10] = [300, 400, 1];
  balls[11] = [450, 60, 1];
  if (solidsLeft) balls[1] = [200, 250, 1];
  return {
    v: 1,
    mode: 'cpu',
    level: 'easy',
    humanShots: 3,
    aim: { angle: 0.8204, power: 30, spin: 0 },
    game: { v: 1, seed: 12345, balls, turn: 0, groups: ['solid', 'stripe'], isBreak: false, ballInHand: false, kitchen: false, shots: 6, winner: null, last: null },
  };
}

/** Ghi ván lưu + tắt hướng dẫn lần đầu (chỉ lần nạp đầu, để tải lại trang không ghi đè). */
async function seed(page: Page, save: object | null) {
  await page.addInitScript((s) => {
    if (window.localStorage.getItem('playnine-bia-settings-v1')) return;
    window.localStorage.setItem('playnine-bia-settings-v1', JSON.stringify({ guideSeen: true }));
    if (s) window.localStorage.setItem('playnine-bia-save-v1', JSON.stringify(s));
  }, save);
}

async function waitResume(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'easy'), { timeout: 5000 })
    .toBe(true);
}

test('bia sinking the 8 after clearing the group reports a won game', async ({ page }) => {
  await captureMessages(page);
  await seed(page, saveOf(false));
  await page.goto('#/play/bia');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#btn-shoot')).toBeEnabled();
  await frame.locator('#btn-shoot').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'bia', mode: 'easy', won: true, assisted: false });
  await expect(frame.locator('#modal-result')).toBeVisible();
});

test('bia sinking the 8 too early reports won false', async ({ page }) => {
  await captureMessages(page);
  await seed(page, saveOf(true));
  await page.goto('#/play/bia');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#btn-shoot')).toBeEnabled();
  await frame.locator('#btn-shoot').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 10000 })
    .toMatchObject({ gameId: 'bia', mode: 'easy', won: false, assisted: false });
});

test('bia abandoning a started game reports won false', async ({ page }) => {
  await captureMessages(page);
  await seed(page, saveOf(true));
  await page.goto('#/play/bia');
  await waitResume(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'bia', mode: 'easy', won: false, assisted: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});

test('bia re-sends start with the new level when switched before the first shot', async ({ page }) => {
  await captureMessages(page);
  await seed(page, null);
  await page.goto('#/play/bia');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'medium'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('[data-open="modal-settings"]').first().click();
  await frame.locator('[data-setting="level"] [data-value="hard"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('hard');
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
