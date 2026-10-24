import { test, expect, type Page } from '@playwright/test';

// Cầu Nối trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase, cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn: bàn 7x7 (mode s), bốn đảo số 2 ở bốn góc hình vuông (0,0) (0,3) (3,0) (3,3).
// Cạnh theo thứ tự engine: 0 = đảo 0–1 (ngang), 1 = đảo 0–2 (dọc), 2 = đảo 1–3 (dọc), 3 = đảo 2–3 (ngang).
// Lời giải duy nhất là vòng cầu đơn; ba cạnh đầu đã có cầu, còn thiếu cầu giữa đảo 2 và đảo 3.

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

async function seedAlmostSolved(page: Page) {
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-caunoi-save-v1')) return;
    const game = {
      v: 1,
      mode: 's',
      size: 7,
      islands: [[0, 0, 2], [0, 3, 2], [3, 0, 2], [3, 3, 2]],
      sol: [1, 1, 1, 1],
      br: [1, 1, 1, 0],
      undo: [[[0, 0, 1]], [[1, 0, 1]], [[2, 0, 1]]],
      redo: [],
      moves: 3,
      assisted: false,
    };
    window.localStorage.setItem('playnine-caunoi-save-v1', JSON.stringify({ v: 1, game, elapsed: 60000 }));
  });
}

async function waitResumed(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), {
      timeout: 5000,
    })
    .toBe(true);
}

/** Chạm vào tâm ô (hàng r, cột c) của bàn 7x7: app tính đảo theo tọa độ chạm. */
async function tapCell(page: Page, r: number, c: number) {
  const board = page.frameLocator('iframe').locator('#board');
  const box = await board.boundingBox();
  if (!box) throw new Error('board not visible');
  await board.click({ position: { x: ((c + 0.5) / 7) * box.width, y: ((r + 0.5) / 7) * box.height } });
}

test('caunoi reports a won run when the last bridge is built', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/caunoi');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#islands')).toHaveText('2/4');
  // Chạm đảo (3,0) rồi đảo (3,3): thêm cầu cuối cùng
  await tapCell(page, 3, 0);
  await tapCell(page, 3, 3);
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'caunoi', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(60000);
  await expect(frame.locator('#islands')).toHaveText('4/4');
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('caunoi reports a loss when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/caunoi');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'caunoi', mode: 's', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});
