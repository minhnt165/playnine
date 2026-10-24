import { test, expect, type Page } from '@playwright/test';

// Dãy Số trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/*
 * Ván lưu dựng sẵn, đề Dễ 6×6 (một ô khoét ở góc dưới trái), lời giải là đường rắn bò:
 *    1*  2   3   4*  5   6
 *   12  11  10   9   8   7*
 *   13  14  15* 16  17  18
 *   24* 23  22  21  20  19
 *   25  26  27  28* 29  30
 *    #  35* 34  33  32  31
 * (* = số cho sẵn). `missing` = các số chưa điền; số tiếp theo cần đặt là `cur`.
 */
function seedSave(page: Page, missing: number[], cur: number) {
  return page.addInitScript(
    ({ missing, cur }) => {
      if (window.localStorage.getItem('playnine-dayso-save-v1')) return;
      const sol = [1, 2, 3, 4, 5, 6, 12, 11, 10, 9, 8, 7, 13, 14, 15, 16, 17, 18, 24, 23, 22, 21, 20, 19, 25, 26, 27, 28, 29, 30, 0, 35, 34, 33, 32, 31];
      const givenNums = [1, 4, 7, 15, 24, 28, 35];
      const open = sol.map((v) => (v ? 1 : 0));
      const given = sol.map((v) => (givenNums.indexOf(v) >= 0 ? 1 : 0));
      const vals = sol.map((v) => (missing.indexOf(v) >= 0 ? 0 : v));
      const game = { v: 1, mode: 's', seed: 2026, n: 6, open, sol, given, vals, notes: sol.map(() => []), moves: 20, hints: 0, undo: [], redo: [] };
      window.localStorage.setItem('playnine-dayso-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000, cur, dir: 1 }));
    },
    { missing, cur },
  );
}

test('dayso reports a won run when the last number is placed', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, [20], 20);
  await page.goto('#/play/dayso');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 's'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#cur-num')).toHaveText('20');
  // Số 20 nằm ở hàng 4, cột 5 (ô 22): chạm ô trống là đặt số tiếp theo vào đó
  await frame.locator('.cell[data-i="22"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'dayso', mode: 's', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('dayso wins by dragging the path through the last empty cells', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, [19, 20, 21], 19);
  await page.goto('#/play/dayso');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.cell[data-i="17"] .v')).toHaveText('18');
  const center = async (i: number) => {
    const b = await frame.locator('.grid > *').nth(i).boundingBox();
    if (!b) throw new Error('no box for cell ' + i);
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  // Kéo từ 18 (ô 17) qua ô 23, 22, 21 → đặt 19, 20, 21 và nối vào 22
  const start = await center(17);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (const i of [23, 22, 21]) {
    const p = await center(i);
    await page.mouse.move(p.x, p.y, { steps: 6 });
  }
  await page.mouse.up();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'dayso', mode: 's', won: true, assisted: false });
});

test('dayso reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/dayso');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell:not(.given)').first().click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'dayso', mode: 's', won: false });
});

test('dayso switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/dayso');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 's'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-size').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('m');
  await expect(frame.locator('.grid > *')).toHaveCount(64);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
