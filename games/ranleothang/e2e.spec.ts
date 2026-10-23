import { test, expect, type Page } from '@playwright/test';

// Rắn Leo Thang trong cổng: bắt tin nhắn pn:* ở khung trên cùng (không có Supabase cổng vẫn trả pn:ready).
// Ván lưu dựng sẵn trên bàn 'garden' (layout 0); rng 1 nghĩa là lần tung kế tiếp ra 4 (engine mulberry32).

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

/** Ván lưu 2 người (bạn + 1 máy), đã tung 20 lần; `turn` 0 = tới lượt bạn, 1 = tới lượt máy. */
async function seedSave(page: Page, pos: [number, number], turn: 0 | 1) {
  await page.addInitScript(
    ({ pos, turn }) => {
      if (window.localStorage.getItem('playnine-ranleothang-save-v1')) return;
      const game = { v: 1, layout: 0, players: 2, pos, turn, rng: 1, extraSix: true, winner: null, rolls: 20, counts: [10, 10] };
      window.localStorage.setItem('playnine-ranleothang-save-v1', JSON.stringify({ v: 1, game, log: '', die: 3, elapsed: 60000 }));
    },
    { pos, turn },
  );
}

test('ranleothang reports a won run when you land exactly on 100', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, [96, 30], 0); // tung ra 4: 96 -> 100
  await page.goto('#/play/ranleothang');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.resume === true && m.mode === 'classic'), {
      timeout: 5000,
    })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-roll').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ranleothang', mode: 'classic', won: true, assisted: false });
  const end = (await messages(page)).find((m) => m.type === 'pn:end') as Msg;
  expect(end.timeMs).toBeGreaterThanOrEqual(60000);
  await expect(frame.locator('#modal-end')).toBeVisible({ timeout: 8000 });
});

test('ranleothang reports a loss when the computer reaches 100 first', async ({ page }) => {
  await captureMessages(page);
  await seedSave(page, [52, 96], 1); // lượt máy, máy tự tung ra 4: 96 -> 100
  await page.goto('#/play/ranleothang');
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 8000 })
    .toMatchObject({ gameId: 'ranleothang', mode: 'classic', won: false, assisted: false });
  await expect(page.frameLocator('iframe').locator('#modal-end')).toBeVisible({ timeout: 8000 });
});

test('ranleothang reports a loss when a game is abandoned after the first roll', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/ranleothang');
  await expect
    .poll(async () => (await messages(page)).some((m) => m.type === 'pn:start' && m.mode === 'classic'), { timeout: 5000 })
    .toBe(true);
  const frame = page.frameLocator('iframe');
  await frame.locator('#btn-roll').click();
  await frame.locator('#btn-new').click();
  await frame.locator('#btn-confirm-new').click();
  await expect
    .poll(async () => (await messages(page)).find((m) => m.type === 'pn:end'), { timeout: 5000 })
    .toMatchObject({ gameId: 'ranleothang', mode: 'classic', won: false });
});

test('ranleothang starts over without a result before the first roll', async ({ page }) => {
  await captureMessages(page);
  await page.goto('#/play/ranleothang');
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(1);
  await page.frameLocator('iframe').locator('#btn-new').click();
  await expect
    .poll(async () => (await messages(page)).filter((m) => m.type === 'pn:start').length, { timeout: 5000 })
    .toBe(2);
  expect((await messages(page)).some((m) => m.type === 'pn:end')).toBe(false);
});
