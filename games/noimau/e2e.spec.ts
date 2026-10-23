import { test, expect, type Page } from '@playwright/test';

// Nối Màu trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase, cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn: bàn 5x5, màu k nối (k,0) với (k,4) theo hàng; bốn hàng đầu đã nối, hàng cuối còn thiếu ô 24.

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
    if (window.localStorage.getItem('playnine-noimau-save-v1')) return;
    const dots = [0, 1, 2, 3, 4].map((k) => [5 * k, 5 * k + 4]);
    const paths = [0, 1, 2, 3].map((k) => [0, 1, 2, 3, 4].map((c) => 5 * k + c));
    paths.push([20, 21, 22, 23]);
    window.localStorage.setItem(
      'playnine-noimau-save-v1',
      JSON.stringify({ v: 1, mode: '5x5', game: { v: 1, size: 5, dots, paths, moves: 5, last: 4 }, elapsed: 60000 }),
    );
  });
}

async function waitResumed(page: Page) {
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === '5x5'), {
      timeout: 5000,
    })
    .toBe(true);
}

test('noimau reports a won run when the last path is drawn', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/noimau');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('#pairs')).toHaveText('4/5');
  // Kéo từ đầu đường (ô 23) sang chấm cuối (ô 24)
  await frame.locator('#board [data-cell="23"]').hover();
  await page.mouse.down();
  await frame.locator('#board [data-cell="24"]').hover();
  await page.mouse.up();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'noimau', mode: '5x5', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(60000);
  await expect(frame.locator('#modal-win')).toBeVisible();
  await expect(frame.locator('#filled')).toHaveText('100%');
});

test('noimau reports a loss when a started puzzle is abandoned', async ({ page }) => {
  await captureMessages(page);
  await seedAlmostSolved(page);
  await page.goto('#/play/noimau');
  await waitResumed(page);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'noimau', mode: '5x5', won: false });
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').pop()?.resume, { timeout: 5000 })
    .toBe(false);
});
