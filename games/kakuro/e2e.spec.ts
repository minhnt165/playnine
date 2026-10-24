import { test, expect, type Page } from '@playwright/test';

// Kakuro trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

test('kakuro reports a won run when the last cell is filled', async ({ page }) => {
  await captureMessages(page);
  // Ván lưu: đề Dễ 6×6 (engine seed 2026), đã điền đúng mọi ô trừ ô 33 (đáp án 9).
  //   # # # # # #
  //   # # # 1 5 9
  //   # # 1 2 3 8
  //   # 9 7 # 1 4
  //   # 1 2 3 4 #
  //   # 7 4 9 # #
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-kakuro-save-v1')) return;
    const white = [0,0,0,0,0,0, 0,0,0,1,1,1, 0,0,1,1,1,1, 0,1,1,0,1,1, 0,1,1,1,1,0, 0,1,1,1,0,0];
    const sol = [0,0,0,0,0,0, 0,0,0,1,5,9, 0,0,1,2,3,8, 0,9,7,0,1,4, 0,1,2,3,4,0, 0,7,4,9,0,0];
    const vals = sol.map((d, i) => (i === 33 ? 0 : d));
    const game = { v: 1, mode: 's', seed: 2026, n: 6, white, sol, vals, notes: sol.map(() => 0), moves: 17, hints: 0, undo: [], redo: [] };
    window.localStorage.setItem('playnine-kakuro-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/kakuro');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="33"]').click();
  await frame.locator('.key[data-d="9"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'kakuro', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('kakuro reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/kakuro');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell').first().click();
  await frame.locator('.key[data-d="5"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'kakuro', mode: 's', won: false });
});

test('kakuro switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/kakuro');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-size').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('m');
  await expect(frame.locator('#board > *')).toHaveCount(64);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
