import { test, expect, type Page } from '@playwright/test';

// Hitori trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).

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

// Bỏ hộp Cách chơi lần đầu để bấm được vào bàn
async function skipGuide(page: Page) {
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('playnine-hitori-settings-v1')) {
      window.localStorage.setItem('playnine-hitori-settings-v1', JSON.stringify({ guideSeen: true }));
    }
  });
}

test('hitori reports a won run when the last shaded cell completes the puzzle', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  // Ván lưu: đề 5x5 (seed 1, một lời giải: tô ô 5, 7, 9, 11, 17, 20, 24), đã tô 6 ô, còn thiếu ô 24.
  //   5 1 2 4 3
  //   5 2 2 5 2
  //   2 2 4 3 1
  //   4 3 2 1 2
  //   4 4 3 2 2
  await page.addInitScript(() => {
    if (window.localStorage.getItem('playnine-hitori-save-v1')) return;
    const grid = '5124352252224314321244322'.split('').map(Number);
    const blacks = [5, 7, 9, 11, 17, 20];
    const marks = grid.map((_, i) => (blacks.includes(i) ? 1 : 0));
    const game = { v: 1, n: 5, seed: 1, grid, marks, moves: 6, hints: 0, history: blacks.map((i) => [i, 0, 1]), future: [] };
    window.localStorage.setItem('playnine-hitori-save-v1', JSON.stringify({ v: 1, game, elapsed: 5000 }));
  });
  await page.goto('#/play/hitori');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '5'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('.cell.black')).toHaveCount(6);
  await frame.locator('.cell[data-i="24"]').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'hitori', mode: '5', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(5000);
  await expect(frame.locator('#modal-win')).toBeVisible();
});

test('hitori reports a lost run when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/hitori');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.cell[data-i="0"]').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'hitori', mode: '5', won: false });
});

test('hitori switches size before the first move without ending a run', async ({ page }) => {
  await captureMessages(page);
  await skipGuide(page);
  await page.goto('#/play/hitori');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === '5'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('.sizes button[data-value="9"]').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.mode, { timeout: 5000 })
    .toBe('9');
  await expect(frame.locator('.cell')).toHaveCount(81);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
