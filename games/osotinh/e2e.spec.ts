import { test, expect, type Page } from '@playwright/test';

// Ô Số Tính trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Bỏ hộp "Cách chơi" lần đầu để bấm được lưới. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-osotinh-settings-v1')) {
      window.localStorage.setItem('playnine-osotinh-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('osotinh reports a won run when the last cell is filled', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: đề 4x4 nghiệm duy nhất, đã điền đúng mọi ô trừ ô cuối (ô 15 = 1), đồng hồ đã chạy 5 giây.
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-osotinh-save-v1')) return;
    const solution = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
    const cages = [
      { cells: [0, 1, 5], op: '+', target: 7 },
      { cells: [7, 11], op: '+', target: 5 },
      { cells: [9, 10], op: '-', target: 3 },
      { cells: [14, 15], op: '/', target: 2 },
      { cells: [8, 12, 13], op: '+', target: 9 },
      { cells: [2, 3, 6], op: '*', target: 12 },
      { cells: [4], op: '=', target: 3 },
    ];
    const values = solution.map((v, i) => (i === 15 ? 0 : v));
    const game = { v: 1, size: 4, seed: 1, cages, solution, values, notes: new Array(16).fill(0), moves: 14, hints: 0, undo: [], redo: [] };
    window.localStorage.setItem('playnine-osotinh-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/osotinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '4'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="15"]').click();
  await frame.locator('.num[data-v="1"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'osotinh', mode: '4', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('osotinh reports a lost run when a started grid is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/osotinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '4'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell:not(.fixed)').first().click();
  await frame.locator('.num[data-v="1"]').click();
  await frame.locator('#btn-new').click();
  await expect(frame.locator('#new-warn')).toBeVisible();
  await frame.locator('.size-option[data-size="5"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'osotinh', mode: '4', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('5');
  await expect(frame.locator('.cell')).toHaveCount(25);
});

test('osotinh switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/osotinh');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '4'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-size').click();
  await expect(frame.locator('#new-warn')).toBeHidden();
  await frame.locator('.size-option[data-size="7"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('7');
  await expect(frame.locator('.cell')).toHaveCount(49);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
