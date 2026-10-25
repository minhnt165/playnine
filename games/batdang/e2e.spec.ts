import { test, expect, type Page } from '@playwright/test';

// Bất Đẳng trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

/** Bỏ hộp "Cách chơi" lần đầu để không che bàn. */
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-batdang-settings-v1')) {
      window.localStorage.setItem('playnine-batdang-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('batdang reports a won run when the last cell is filled', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: đề Dễ 5×5 (engine seed 2026), đã điền đúng mọi ô trừ ô 24 (đáp án 3).
  //   4 3 5 1 2
  //   3 1 2 4 5
  //   5 2 [4] 3 1      [ ] = số cho sẵn
  //   1 5 3 [2] 4
  //   2 4 1 5 .
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-batdang-save-v1')) return;
    const sol = [4, 3, 5, 1, 2, 3, 1, 2, 4, 5, 5, 2, 4, 3, 1, 1, 5, 3, 2, 4, 2, 4, 1, 5, 3];
    const givens = sol.map((v, i) => (i === 12 || i === 18 ? v : 0));
    const hs = [2, 1, 0, 1, 0, 0, 0, 1, 0, 1, 2, 0, 0, 0, 2, 1, 0, 0, 1, 0];
    const vs = [2, 0, 2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const vals = sol.map((v, i) => (i === 24 ? 0 : v));
    const game = { v: 1, mode: '5', n: 5, seed: 2026, date: null, givens, hs, vs, sol, vals, notes: sol.map(() => 0), moves: 23, hints: 0, undo: [], redo: [] };
    window.localStorage.setItem('playnine-batdang-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/batdang');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '5'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="24"]').click();
  await frame.locator('.key[data-d="3"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'batdang', mode: '5', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('batdang reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/batdang');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell:not(.given)').first().click();
  await frame.locator('.key[data-d="1"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'batdang', mode: '5', won: false });
});

test('batdang switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/batdang');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#modes [data-mode="7"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('7');
  await expect(frame.locator('#board .cell')).toHaveCount(49);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
