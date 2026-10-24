import { test, expect, type Page } from '@playwright/test';

// Lều Trại trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/**
 * Ván lưu dựng sẵn: đề 6x6 (seed 20261024, đúng một lời giải), đã dựng 6/7 lều, còn thiếu lều ở ô 31.
 *   2 ..A..A
 *   1 ATT..T
 *   0 .T....
 *   2 .A.T.A
 *   1 .T.A.T
 *   1 .A....   (ô 31 = hàng 6, cột 2)
 */
async function seedAlmostSolved(page: Page) {
  await page.addInitScript(() => {
    if (window !== window.top || window.localStorage.getItem('playnine-leutrai-save-v1')) return;
    const trees = [0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    const placed = [2, 5, 6, 19, 23, 27];
    const marks = trees.map((_, i) => (placed.includes(i) ? 1 : 0));
    const game = {
      v: 1, mode: 's', seed: 20261024, trees, rows: [2, 1, 0, 2, 1, 1], cols: [1, 2, 1, 1, 0, 2],
      marks, past: [placed.map((i) => [i, 0, 1])], future: [], moves: 1, hints: 0,
    };
    window.localStorage.setItem('playnine-leutrai-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
}

test('leutrai reports a won run when the last tent is pitched', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/leutrai');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.cell.tent')).toHaveCount(6);
  await frame.locator('.cell[data-i="31"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'leutrai', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('leutrai reports an assisted win when a hint finishes the puzzle', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/leutrai');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  await page.frameLocator('iframe').locator('#btn-hint').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'leutrai', mode: 's', won: true, assisted: true });
});

test('leutrai reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/leutrai');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell:not(.tree)').first().click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'leutrai', mode: 's', won: false });
});

test('leutrai switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/leutrai');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-size').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('m');
  await expect(frame.locator('.cell')).toHaveCount(64);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
