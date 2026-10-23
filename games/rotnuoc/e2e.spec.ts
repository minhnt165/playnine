import { test, expect, type Page } from '@playwright/test';

// Rót Nước trong cổng: dựng sẵn màn chỉ còn một lượt rót là xong (qua localStorage), rồi kiểm tra tin nhắn pn:*
// mà game gửi lên khung trên cùng.

type Msg = { type: string; gameId?: string; mode?: string; won?: boolean; assisted?: boolean; resume?: boolean; timeMs?: number };

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

// Màn 1 (3 màu, 5 ống) đã rót 8 lượt: ống 3 còn một lớp màu 0, rót vào ống 0 là xong.
async function presetAlmostSolved(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-rotnuoc-save-v1')) return;
    const game = {
      v: 1,
      level: 1,
      seed: 1,
      start: [[0, 1, 2, 0], [1, 2, 0, 1], [2, 0, 1, 2], [], []],
      tubes: [[0, 0, 0], [1, 1, 1, 1], [2, 2, 2, 2], [0], []],
      moves: 8,
      history: [],
      undoLeft: 3,
      extraLeft: 1,
      assisted: false,
    };
    window.localStorage.setItem('playnine-rotnuoc-save-v1', JSON.stringify({ v: 1, game, elapsed: 20000, reported: false }));
  });
}

async function openResumed(page: Page) {
  await page.goto('#/play/rotnuoc');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  return page.frameLocator('iframe');
}

test('rotnuoc reports a won run with assisted false when the last pour sorts every tube', async ({ page }) => {
  await captureMessages(page);
  await presetAlmostSolved(page);
  const frame = await openResumed(page);
  await frame.locator('.tube[data-i="3"]').click();
  await frame.locator('.tube[data-i="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'rotnuoc', mode: 'classic', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(20000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('rotnuoc marks the run assisted after the extra tube is used', async ({ page }) => {
  await captureMessages(page);
  await presetAlmostSolved(page);
  const frame = await openResumed(page);
  await frame.locator('#btn-extra').click();
  await expect(frame.locator('.tube')).toHaveCount(6);
  await frame.locator('.tube[data-i="3"]').click();
  await frame.locator('.tube[data-i="0"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'rotnuoc', mode: 'classic', won: true, assisted: true });
});

test('rotnuoc reports a loss when a started level is restarted', async ({ page }) => {
  await captureMessages(page);
  await presetAlmostSolved(page);
  const frame = await openResumed(page);
  await frame.locator('#btn-restart').click();
  await frame.locator('#btn-confirm-restart').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'rotnuoc', mode: 'classic', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(2);
});
